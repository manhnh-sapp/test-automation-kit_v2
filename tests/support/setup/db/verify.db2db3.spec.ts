import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { isUatDbConfigured, queryUatReadonly } from './uatPgClient';

/**
 * VERIFY SAPP-14127 — DB2 (before) → DB3 (after = kết quả chạy command trên baseline DB2).
 * 1 spec: tính flag trên DB2 vs HubSpot, rồi đối chiếu THUẦN sang DB3, trả lời 4 câu + liệt kê bản ghi.
 * Read-only cả HubSpot lẫn DB. EXISTS-based nên miễn nhiễm với việc DB3 nhân đôi dòng class_user_instances.
 */
const BEFORE = { dbPrefix: 'LIB_MASTER_DB2' };
const AFTER = { dbPrefix: 'LIB_MASTER_DB3' };
const DELETE_GROUP = new Set(['NORMAL', 'REASSIGNED', 'RETAKING', 'MOVED_IN', 'BE_TRANSFERED']);
const SENTINELS = new Set(['', 'không', 'không tặng kèm', 'n/a', 'na', '-', 'none', 'null']);
const HS = axios.create({ baseURL: process.env.HUBSPOT_BASE_URL, headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` }, timeout: 30_000 });
const qs = (s: string) => `'${s.replace(/'/g, "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dropped = new Set<string>();
function normCodes(raw?: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const p of String(raw).split(';')) {
    const t = p.trim();
    if (!t) continue;
    if (/\s/.test(t) || SENTINELS.has(t.toLowerCase())) { dropped.add(t); continue; }
    out.push(t);
  }
  return out;
}

async function fetchDealsWon(ids: string[], won: Set<string>) {
  const byId = new Map<string, { codes: Set<string>; won: boolean }>();
  let notFound = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await HS.post('/crm/v3/objects/deals/batch/read', {
      properties: ['dealstage', 'lop_dang_ky_cloned_', 'lop_dang_ky_tang_kem'],
      inputs: chunk.map((id) => ({ id })),
    });
    const found = new Set<string>();
    for (const r of data.results || []) {
      found.add(r.id);
      const p = r.properties || {};
      const w = won.has(String(p.dealstage));
      byId.set(r.id, { won: w, codes: w ? new Set([...normCodes(p.lop_dang_ky_cloned_), ...normCodes(p.lop_dang_ky_tang_kem)]) : new Set() });
    }
    for (const id of chunk) if (!found.has(id)) notFound++;
    if (i % 1000 === 0) console.log(`  HubSpot ${i + chunk.length}/${ids.length}`); // eslint-disable-line no-console
  }
  return { byId, notFound };
}

/** phân loại từng cặp (uid,cid) trên AFTER: active / soft-deleted / gone */
async function classifyOnAfter(rows: { uid: string; code: string; cid: string }[]) {
  const m = new Map<string, string>();
  if (!rows.length) return m;
  const uniq = new Map<string, [string, string]>();
  for (const r of rows) uniq.set(`${r.uid}|${r.cid}`, [r.uid, r.cid]);
  const vals = [...uniq.values()].map(([u, c]) => `(${qs(u)}::uuid, ${qs(c)}::uuid)`).join(',');
  const res = await queryUatReadonly<{ uid: string; cid: string; active: boolean; anyrow: boolean }>(
    `SELECT v.uid::text uid, v.cid::text cid,
            EXISTS(SELECT 1 FROM class_user_instances c WHERE c.user_id=v.uid AND c.class_id=v.cid AND c.deleted_at IS NULL) active,
            EXISTS(SELECT 1 FROM class_user_instances c WHERE c.user_id=v.uid AND c.class_id=v.cid) anyrow
       FROM (VALUES ${vals}) v(uid, cid)`, [], AFTER);
  for (const x of res) m.set(`${x.uid}|${x.cid}`, x.active ? 'active' : x.anyrow ? 'soft-deleted' : 'gone');
  return m;
}

const mdTable = (rows: string[][], head: string[]) =>
  rows.length ? [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') : '_(không có)_';

test('verify SAPP-14127 DB2(before) → DB3(after)', async () => {
  test.skip(!isUatDbConfigured('LIB_MASTER_DB2') || !isUatDbConfigured('LIB_MASTER_DB3'), 'Thiếu DB2 hoặc DB3.');
  test.setTimeout(600_000);

  // 0) WON stage-id "Hoàn thiện hồ sơ học viên" (non-test)
  const { data: pipeData } = await HS.get('/crm/v3/pipelines/deals');
  const wonStageIds = new Set<string>();
  for (const p of pipeData.results || []) {
    if (/test/i.test(p.label)) continue;
    for (const s of p.stages || []) if (/hoàn thiện hồ sơ học viên/i.test(s.label)) wonStageIds.add(String(s.id));
  }

  // 1) Đọc DB2 (before)
  const deals = await queryUatReadonly<{ deal_uuid: string; user_id: string; hubspot_deal_id: string }>(
    `SELECT id::text deal_uuid, user_id::text user_id, hubspot_deal_id FROM user_hubspot_deals WHERE hubspot_deal_id IS NOT NULL`, [], BEFORE);
  const uhc = await queryUatReadonly<{ deal_uuid: string; class_code: string | null; is_deleted: boolean }>(
    `SELECT user_hubspot_deal_id::text deal_uuid, class_code, (deleted_at IS NOT NULL) is_deleted FROM user_hubspot_classes WHERE user_hubspot_deal_id IS NOT NULL`, [], BEFORE);
  const cui = await queryUatReadonly<{ user_id: string; class_id: string; type: string; source_type: string | null; completed: number; is_deleted: boolean }>(
    `SELECT user_id::text user_id, class_id::text class_id, upper(type) type, source_type,
            CASE WHEN (learning_progress->>'total_course_sections_completed') ~ '^[0-9]+$' THEN (learning_progress->>'total_course_sections_completed')::int ELSE 0 END completed,
            (deleted_at IS NOT NULL) is_deleted FROM class_user_instances`, [], BEFORE);
  const classes = await queryUatReadonly<{ id: string; class_code: string }>(
    `SELECT id::text id, code class_code FROM classes WHERE code IS NOT NULL`, [], BEFORE);

  // 2) Index
  const codeById = new Map<string, string>(); const idByCode = new Map<string, string>(); const opsCodes = new Set<string>();
  for (const c of classes) { codeById.set(c.id, c.class_code); if (!idByCode.has(c.class_code)) idByCode.set(c.class_code, c.id); opsCodes.add(c.class_code); }
  const uhcActiveByDeal = new Map<string, Set<string>>();
  for (const r of uhc) { if (r.is_deleted || !r.class_code) continue; (uhcActiveByDeal.get(r.deal_uuid) ?? uhcActiveByDeal.set(r.deal_uuid, new Set()).get(r.deal_uuid)!).add(r.class_code); }
  const memberActive = new Map<string, Set<string>>(); const syncByUser = new Map<string, { class_id: string; type: string; completed: number }[]>();
  for (const r of cui) {
    if (r.is_deleted) continue;
    (memberActive.get(r.user_id) ?? memberActive.set(r.user_id, new Set()).get(r.user_id)!).add(r.class_id);
    if (r.source_type === 'SYNC_DEAL_WON') (syncByUser.get(r.user_id) ?? syncByUser.set(r.user_id, []).get(r.user_id)!).push({ class_id: r.class_id, type: r.type, completed: r.completed });
  }

  // 3) HubSpot codes → per-user WON deal codes
  const { byId: hs, notFound } = await fetchDealsWon(deals.map((d) => d.hubspot_deal_id), wonStageIds);
  const userDealCodes = new Map<string, Set<string>>(); let wonQualified = 0;
  for (const d of deals) { const x = hs.get(d.hubspot_deal_id); if (!x?.won) continue; wonQualified++; const s = userDealCodes.get(d.user_id) ?? userDealCodes.set(d.user_id, new Set()).get(d.user_id)!; for (const c of x.codes) s.add(c); }

  // 4) Reconcile flags trên DB2
  const addClassCode: { uid: string; deal: string; code: string }[] = [];
  for (const d of deals) { const x = hs.get(d.hubspot_deal_id); if (!x?.won) continue; const present = uhcActiveByDeal.get(d.deal_uuid) ?? new Set<string>(); for (const c of x.codes) if (!present.has(c)) addClassCode.push({ uid: d.user_id, deal: d.hubspot_deal_id, code: c }); }

  const kindOf = (c: string) => (/^F-/.test(c) ? 'F-' : /^R-/.test(c) ? 'R-' : /\//.test(c) ? 'other' : 'plain');
  const scopeUsers = new Set(deals.map((d) => d.user_id));
  const removePlain: { uid: string; code: string; cid: string }[] = []; const removeVariant: { uid: string; code: string; cid: string }[] = [];
  const keep: { uid: string; code: string; cid: string }[] = [];
  for (const [uid, rows] of syncByUser) {
    if (!scopeUsers.has(uid)) continue;
    const dc = userDealCodes.get(uid) ?? new Set<string>();
    for (const r of rows) {
      const code = codeById.get(r.class_id) ?? '(?)';
      if (dc.has(code)) continue;
      if (r.completed === 0 && DELETE_GROUP.has(r.type)) (kindOf(code) === 'plain' ? removePlain : removeVariant).push({ uid, code, cid: r.class_id });
      else keep.push({ uid, code, cid: r.class_id });
    }
  }
  const uhcActiveByUser = new Map<string, Set<string>>();
  for (const d of deals) { const p = uhcActiveByDeal.get(d.deal_uuid); if (!p) continue; const s = uhcActiveByUser.get(d.user_id) ?? uhcActiveByUser.set(d.user_id, new Set()).get(d.user_id)!; for (const c of p) s.add(c); }
  const addStudent: { uid: string; code: string; cid: string }[] = [];
  for (const [uid, dc] of userDealCodes) { const inU = uhcActiveByUser.get(uid) ?? new Set<string>(); const mem = memberActive.get(uid) ?? new Set<string>(); for (const code of dc) { if (!inU.has(code) || !opsCodes.has(code)) continue; const cid = idByCode.get(code)!; if (!mem.has(cid)) addStudent.push({ uid, code, cid }); } }

  // 5) Đối chiếu sang DB3 (after)
  // Câu 1
  let c1applied = 0; const c1missing: string[][] = []; const c1dealAbsent: string[][] = [];
  if (addClassCode.length) {
    const vals = addClassCode.map((r) => `(${qs(r.deal)}, ${qs(r.code)})`).join(',');
    const res = await queryUatReadonly<{ did: string; code: string; deal_exists: boolean; active: boolean }>(
      `SELECT v.did did, v.code code,
              EXISTS(SELECT 1 FROM user_hubspot_deals d WHERE d.hubspot_deal_id=v.did) deal_exists,
              EXISTS(SELECT 1 FROM user_hubspot_classes c JOIN user_hubspot_deals d ON d.id=c.user_hubspot_deal_id WHERE d.hubspot_deal_id=v.did AND c.class_code=v.code AND c.deleted_at IS NULL) active
         FROM (VALUES ${vals}) v(did, code)`, [], AFTER);
    const mp = new Map(res.map((x) => [`${x.did}|${x.code}`, x]));
    for (const r of addClassCode) { const x = mp.get(`${r.deal}|${r.code}`); if (x?.active) c1applied++; else if (!x?.deal_exists) c1dealAbsent.push([r.uid, r.deal, r.code]); else c1missing.push([r.uid, r.deal, r.code]); }
  }
  const cPlain = await classifyOnAfter(removePlain);
  const cVar = await classifyOnAfter(removeVariant);
  const cKeep = await classifyOnAfter(keep);
  const cAdd = await classifyOnAfter(addStudent);
  const bk = (arr: { uid: string; code: string; cid: string }[], m: Map<string, string>, b: string) => arr.filter((r) => (m.get(`${r.uid}|${r.cid}`) ?? 'gone') === b);
  const c2plainActive = bk(removePlain, cPlain, 'active');
  const c3wrong = keep.filter((r) => (cKeep.get(`${r.uid}|${r.cid}`) ?? 'gone') !== 'active');
  const c4not = addStudent.filter((r) => (cAdd.get(`${r.uid}|${r.cid}`) ?? 'gone') !== 'active');
  const P = (a: { uid: string; code: string; cid: string }[]) => a.map((x) => [x.uid, x.code, x.cid]);

  const plainRemoved = removePlain.length - c2plainActive.length;
  const variantActive = bk(removeVariant, cVar, 'active').length;
  const report = `# Verify SAPP-14127 — DB2 (before) → DB3 (after) — 4 câu + chi tiết

- Thời điểm: ${new Date().toISOString()}
- before = DB2 \`postgres-update\` | after = DB3 \`postgres-update-2\` (DB3 = kết quả chạy command trên baseline DB2).
- Read-only. Không Email/SĐT. EXISTS-based nên không bị ảnh hưởng bởi việc DB3 nhân đôi dòng class_user_instances.
- Deal DB2 xử lý: ${deals.length} | đạt WON: ${wonQualified} | không thấy trên HubSpot: ${notFound}.

## Trả lời 4 câu
| Câu hỏi | Flag (từ DB2) | Đã áp đúng ở DB3 | Bất thường |
| --- | --- | --- | --- |
| 1. Mã lớp đã THÊM chưa? | ${addClassCode.length} | ${c1applied} có active | ${c1missing.length} thiếu + ${c1dealAbsent.length} deal không có |
| 2. HV đã bị XÓA chưa? (PLAIN đáng tin) | ${removePlain.length} | ${plainRemoved} đã xóa | **${c2plainActive.length} vẫn active** |
| 2'. XÓA nhóm VARIANT F-/R- | ${removeVariant.length} | ${removeVariant.length - variantActive} đã xóa | ${variantActive} vẫn active (thường đúng) |
| 3. HV vẫn được GIỮ chưa? | ${keep.length} | ${keep.length - c3wrong.length} vẫn active | **${c3wrong.length} bị xóa (sai)** |
| 4. HV đã THÊM vào lớp chưa? | ${addStudent.length} | ${addStudent.length - c4not.length} đã thêm | **${c4not.length} chưa** |

---
## Câu 1 — Mã lớp ĐÁNG THÊM nhưng DB3 VẪN THIẾU (${c1missing.length})
${mdTable(c1missing, ['user_id', 'hubspot_deal_id', 'class_code'])}

## Câu 2 — HV PLAIN ĐÁNG XÓA nhưng VẪN ACTIVE ở DB3 (${c2plainActive.length})
${mdTable(P(c2plainActive), ['user_id', 'class_code', 'class_id'])}

## Câu 3 — HV PHẢI GIỮ nhưng ĐÃ BỊ XÓA/MẤT ở DB3 (${c3wrong.length})
${mdTable(c3wrong.map((r) => [r.uid, r.code, r.cid, cKeep.get(`${r.uid}|${r.cid}`) ?? 'gone']), ['user_id', 'class_code', 'class_id', 'bucket'])}

## Câu 4 — HV ĐÁNG THÊM nhưng DB3 CHƯA thêm (${c4not.length})
${mdTable(c4not.map((r) => [r.uid, r.code, r.cid, cAdd.get(`${r.uid}|${r.cid}`) ?? 'gone']), ['user_id', 'class_code', 'class_id', 'bucket'])}
`;
  const outPath = path.join('outputs', 'lms-operations-automation', process.env.TASK_KEY || 'SAPP-14127', 'verify-db2-vs-db3.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`\n1) add=${addClassCode.length} applied=${c1applied} missing=${c1missing.length} dealAbsent=${c1dealAbsent.length}`);
  // eslint-disable-next-line no-console
  console.log(`2) removePlain=${removePlain.length} removed=${plainRemoved} stillActive=${c2plainActive.length} | variant=${removeVariant.length} stillActive=${variantActive}`);
  // eslint-disable-next-line no-console
  console.log(`3) keep=${keep.length} keptActive=${keep.length - c3wrong.length} wronglyRemoved=${c3wrong.length}`);
  // eslint-disable-next-line no-console
  console.log(`4) add=${addStudent.length} applied=${addStudent.length - c4not.length} notApplied=${c4not.length}`);
  // eslint-disable-next-line no-console
  console.log(`File: ${outPath}`);
});
