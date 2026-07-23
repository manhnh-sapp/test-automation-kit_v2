import { Client, type ClientConfig, type QueryResultRow } from 'pg';

/**
 * Guarded READ-ONLY PostgreSQL client cho kho DB UAT — cửa DUY NHẤT được phép mở kết nối DB.
 *
 * Vai trò: oracle PHỤ để verify/chẩn đoán khi UI/API không expose được state
 * (vd phân biệt "field trống do FE" vs "do BE", kiểm dữ liệu có persist không).
 * KHÔNG dùng để dựng/mutate state (setup precondition vẫn qua api/factory/test_hook/fixture),
 * KHÔNG phải evidence Jira (evidence vẫn là ảnh UI), KHÔNG thay oracle từ spec.
 *
 * Kho UAT và PROD là hai kho tách biệt: chỉ cần cấu hình credential kho UAT
 * (`LIB_MASTER_DB_*`) thì client chỉ kết nối đúng kho đó. Không cấu hình creds ⇒ không truy cập.
 *
 * ⚠️ DB user UAT có thể có FULL quyền (ghi/DDL) ở tầng DB — nên **guard client này là lớp chặn
 * duy nhất**, phải giữ nghiêm. Nó chỉ được phép làm ĐÚNG việc read-only đã yêu cầu:
 *  - `BEGIN TRANSACTION READ ONLY` chặn mọi INSERT/UPDATE/DELETE/DDL (kể cả trong writable-CTE,
 *    hàm volatile, `nextval`) — Postgres tự ném dù user full quyền.
 *  - Lint chặn các đường mà READ ONLY transaction KHÔNG chặn: hàm đọc/ghi file server & admin
 *    (`pg_read_file`, `lo_export`, `pg_reload_conf`, `pg_terminate_backend`...), `EXPLAIN ANALYZE`
 *    (thực thi thật), nhiều statement (stacked query). Chỉ cho câu bắt đầu bằng SELECT/WITH/EXPLAIN/…
 *  - `SET LOCAL statement_timeout` giới hạn thời gian; không log connection string/password.
 *  - Chỉ đọc env `LIB_MASTER_DB_*` (không đụng `DATABASE_URL`/`PG*`/`TEST_DB_*`).
 *  - Tùy chọn (chỉ khi bạn tự set): `LIB_MASTER_DB_ALLOWED_HOSTS` giới hạn host được kết nối,
 *    `LIB_MASTER_DB_DENY_HOST_PATTERNS` chặn host/dbname khớp mẫu. Bỏ trống ⇒ không áp.
 *
 * Vì user full quyền, TUYỆT ĐỐI không nới lint để "chạy nhanh" — chỉ chạy đúng SELECT chẩn đoán.
 */

/** Prefix env mặc định (DB1). DB khác dùng prefix 'LIB_MASTER_DB2', 'LIB_MASTER_DB3'… (so nhiều bản). */
export const DEFAULT_DB_PREFIX = 'LIB_MASTER_DB';
/** Env kết nối bắt buộc theo prefix — thiếu bất kỳ cái nào ⇒ coi như chưa bật (dormant). */
const requiredKeys = (prefix: string) =>
  [`${prefix}_HOST`, `${prefix}_PORT`, `${prefix}_NAME`, `${prefix}_USERNAME`, `${prefix}_PASSWORD`] as const;

export interface UatDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** Tùy chọn: nếu non-empty, chỉ cho kết nối host trong danh sách. */
  allowedHosts: string[];
  /** Tùy chọn: nếu non-empty, chặn host/dbname chứa các mẫu này. */
  denyPatterns: string[];
  ssl: boolean;
  statementTimeoutMs: number;
}

/** Lỗi guard DB — nêu rõ nguyên nhân dừng (config thiếu / host không hợp lệ / query không read-only). */
export class UatDbGuardError extends Error {
  constructor(message: string) {
    super(`[uatPgClient] ${message}`);
    this.name = 'UatDbGuardError';
  }
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** true nếu đủ env kết nối để dùng DB verify (caller có thể skip gracefully nếu false). */
export function isUatDbConfigured(prefix: string = DEFAULT_DB_PREFIX): boolean {
  return requiredKeys(prefix).every((k) => (process.env[k] ?? '').trim() !== '');
}

/**
 * Đọc + validate config từ env theo prefix. Ném `UatDbGuardError` nếu thiếu env kết nối/không hợp lệ.
 * Kết nối (HOST/PORT/NAME/USERNAME/PASSWORD) lấy đúng theo prefix.
 * Guard/tuỳ chọn (ALLOWED_HOSTS/DENY_HOST_PATTERNS/SSL/STATEMENT_TIMEOUT_MS) theo prefix, fallback về LIB_MASTER_DB_*.
 */
export function loadUatDbConfig(prefix: string = DEFAULT_DB_PREFIX): UatDbConfig {
  const missing = requiredKeys(prefix).filter((k) => (process.env[k] ?? '').trim() === '');
  if (missing.length) {
    throw new UatDbGuardError(
      `Thiếu env kết nối: ${missing.join(', ')}. DB verify chỉ chạy khi đã cấu hình kho UAT.`,
    );
  }
  const opt = (suffix: string) =>
    process.env[`${prefix}_${suffix}`] ?? process.env[`${DEFAULT_DB_PREFIX}_${suffix}`];

  const port = Number.parseInt(process.env[`${prefix}_PORT`] as string, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new UatDbGuardError(`${prefix}_PORT không hợp lệ: "${process.env[`${prefix}_PORT`]}".`);
  }

  const statementTimeoutMs = Number.parseInt(opt('STATEMENT_TIMEOUT_MS') ?? '5000', 10);

  return {
    host: (process.env[`${prefix}_HOST`] as string).trim(),
    port,
    database: (process.env[`${prefix}_NAME`] as string).trim(),
    user: (process.env[`${prefix}_USERNAME`] as string).trim(),
    password: process.env[`${prefix}_PASSWORD`] as string,
    allowedHosts: splitCsv(opt('ALLOWED_HOSTS')),
    denyPatterns: splitCsv(opt('DENY_HOST_PATTERNS')),
    ssl: (opt('SSL') ?? '').trim().toLowerCase() === 'true',
    statementTimeoutMs:
      Number.isInteger(statementTimeoutMs) && statementTimeoutMs > 0 ? statementTimeoutMs : 5000,
  };
}

/**
 * Guard host tùy chọn: chỉ áp khi bạn tự cấu hình allowlist/deny.
 * Bỏ trống cả hai ⇒ không áp (rào chính là credential kho UAT).
 */
export function assertHostGuards(cfg: UatDbConfig): void {
  const host = cfg.host.toLowerCase();
  const db = cfg.database.toLowerCase();

  if (cfg.allowedHosts.length && !cfg.allowedHosts.includes(host)) {
    throw new UatDbGuardError(
      `Host "${cfg.host}" không nằm trong LIB_MASTER_DB_ALLOWED_HOSTS (${cfg.allowedHosts.join(', ')}).`,
    );
  }
  const hit = cfg.denyPatterns.find((p) => host.includes(p) || db.includes(p));
  if (hit) {
    throw new UatDbGuardError(
      `Host/DB khớp mẫu chặn "${hit}" trong LIB_MASTER_DB_DENY_HOST_PATTERNS. (host="${cfg.host}", db="${cfg.database}")`,
    );
  }
}

/**
 * Hàm/keyword nguy hiểm mà `BEGIN TRANSACTION READ ONLY` KHÔNG chặn (đọc/ghi file server, admin)
 * → phải chặn ở lint. Chọn tên hàm hiếm trùng tên cột để giảm false-positive.
 */
const DANGEROUS_TOKEN =
  /\b(lo_import|lo_export|pg_read_file|pg_read_binary_file|pg_read_server_files|pg_ls_dir|pg_ls_logdir|pg_ls_waldir|pg_stat_file|pg_reload_conf|pg_terminate_backend|pg_cancel_backend|pg_rotate_logfile|pg_sleep|dblink|dblink_exec)\b/i;

/** Lint read-only. Bảo đảm chính vẫn là transaction READ ONLY; đây là lớp bổ sung cho user full quyền. */
export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) throw new UatDbGuardError('Query rỗng.');
  // Phải bắt đầu bằng câu đọc (cho phép leading comment/whitespace).
  const readStart = /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*(select|with|explain|values|table|show)\b/i;
  if (!readStart.test(trimmed)) {
    throw new UatDbGuardError('Chỉ cho phép câu đọc bắt đầu bằng SELECT/WITH/EXPLAIN/VALUES/TABLE/SHOW (read-only verify).');
  }
  // EXPLAIN ANALYZE thực thi câu lệnh thật -> chặn (chỉ EXPLAIN thường mới an toàn).
  if (/^\s*explain\b/i.test(trimmed) && /\banalyze\b/i.test(trimmed)) {
    throw new UatDbGuardError('Không cho phép EXPLAIN ANALYZE (thực thi câu lệnh thật).');
  }
  // Hàm đọc/ghi file server / admin không bị READ ONLY transaction chặn -> chặn ở đây.
  const bad = trimmed.match(DANGEROUS_TOKEN);
  if (bad) {
    throw new UatDbGuardError(`Không cho phép hàm/keyword nguy hiểm "${bad[1]}" (đọc/ghi file server hoặc admin).`);
  }
  // Chặn nhiều statement (ngăn stacked write): chỉ cho phép 1 dấu ; ở cuối.
  const withoutTrailing = trimmed.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    throw new UatDbGuardError('Không cho phép nhiều statement trong một query (chống stacked query).');
  }
}

/**
 * Chạy MỘT câu SELECT read-only trên kho DB UAT, trả về `rows`.
 * Guard chạy trước; kết nối mở/đóng theo từng lần gọi (verify tần suất thấp).
 */
export async function queryUatReadonly<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  opts: { dbPrefix?: string } = {},
): Promise<T[]> {
  assertReadOnlySql(sql);
  const cfg = loadUatDbConfig(opts.dbPrefix ?? DEFAULT_DB_PREFIX);
  assertHostGuards(cfg);

  const clientConfig: ClientConfig = {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
  };

  const client = new Client(clientConfig);
  await client.connect();
  // Audit: chỉ host/db/user, KHÔNG bao giờ log password/connection string.
  // eslint-disable-next-line no-console
  console.log(`[uatPgClient] connected UAT host=${cfg.host} db=${cfg.database} user=${cfg.user} (read-only)`);
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${cfg.statementTimeoutMs}`);
    const res = await client.query<T>(sql, params as unknown[]);
    await client.query('ROLLBACK');
    return res.rows;
  } finally {
    await client.end();
  }
}
