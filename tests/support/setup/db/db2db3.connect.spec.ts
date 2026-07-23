import { test, expect } from '@playwright/test';
import { isUatDbConfigured, queryUatReadonly } from './uatPgClient';

/** Check connect DB2 + DB3 (bỏ DB1) + snapshot nhanh. Read-only, guarded (allowlist localhost). */
async function snapshot(opts: { dbPrefix: string }) {
  const [id] = await queryUatReadonly<{ db: string }>('SELECT current_database() AS db', [], opts);
  const [d] = await queryUatReadonly<{ deals: string; uhc_active: string; sync_active: string; sync_deleted: string }>(
    `SELECT (SELECT count(*) FROM user_hubspot_deals)::text deals,
            (SELECT count(*) FROM user_hubspot_classes WHERE deleted_at IS NULL)::text uhc_active,
            (SELECT count(*) FROM class_user_instances WHERE source_type='SYNC_DEAL_WON' AND deleted_at IS NULL)::text sync_active,
            (SELECT count(*) FROM class_user_instances WHERE source_type='SYNC_DEAL_WON' AND deleted_at IS NOT NULL)::text sync_deleted`,
    [], opts,
  );
  return { db: id.db, ...d };
}

test('check connect DB2 + DB3 + snapshot', async () => {
  test.skip(!isUatDbConfigured('LIB_MASTER_DB2') || !isUatDbConfigured('LIB_MASTER_DB3'), 'Thiếu DB2 hoặc DB3.');
  test.setTimeout(120_000);
  const db2 = await snapshot({ dbPrefix: 'LIB_MASTER_DB2' });
  const db3 = await snapshot({ dbPrefix: 'LIB_MASTER_DB3' });
  const L = (s: string) => console.log(s); // eslint-disable-line no-console
  L(`DB2 = ${db2.db} | DB3 = ${db3.db}`);
  L(`user_hubspot_deals            : DB2=${db2.deals}  DB3=${db3.deals}  (Δ=${+db3.deals - +db2.deals})`);
  L(`user_hubspot_classes active   : DB2=${db2.uhc_active}  DB3=${db3.uhc_active}  (Δ=${+db3.uhc_active - +db2.uhc_active})`);
  L(`SYNC_DEAL_WON active          : DB2=${db2.sync_active}  DB3=${db3.sync_active}  (Δ=${+db3.sync_active - +db2.sync_active})`);
  L(`SYNC_DEAL_WON soft-deleted    : DB2=${db2.sync_deleted}  DB3=${db3.sync_deleted}  (Δ=${+db3.sync_deleted - +db2.sync_deleted})`);
  expect(db2.db).toBe('postgres-update');
  expect(db3.db).toBe('postgres-update-2');
});
