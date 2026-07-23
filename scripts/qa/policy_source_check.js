#!/usr/bin/env node
'use strict';

/*
 * policy_source_check.js (F3) — giữ 1 NGUỒN policy duy nhất: RULE_GLOBAL.md là canonical.
 *
 * KHÔNG bắt trùng-văn-bản (core_rules.md CỐ Ý là digest → paraphrase lại là bình thường, không phải lỗi).
 * Thay vào đó ÉP QUY ƯỚC chống drift:
 *   - core_rules.md PHẢI khai RULE_GLOBAL.md là canonical (khi mâu thuẫn theo RULE_GLOBAL) — mất dòng này = CHẶN.
 *   - Mỗi mục digest NÊN trỏ nguồn "(Đầy đủ: RULE_GLOBAL …)" — thiếu nhiều = CẢNH BÁO (drift dễ xảy ra).
 * Cách này bắt đúng rủi ro "instruction drift" mà không phạt việc tóm tắt hợp lệ.
 *
 * Dùng: node scripts/qa/policy_source_check.js   (exit 1 nếu mất pointer canonical)
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const RULE_GLOBAL = path.join(rc.REPO_ROOT, 'RULE_GLOBAL.md');
const CORE = path.join(rc.REPO_ROOT, '.agent', 'rules', 'core_rules.md');

const problems = [];
const warns = [];

if (!fs.existsSync(RULE_GLOBAL)) problems.push('Thiếu RULE_GLOBAL.md (nguồn policy canonical).');
if (!fs.existsSync(CORE)) {
  warns.push('.agent/rules/core_rules.md không tồn tại (bỏ qua check digest).');
} else {
  const core = fs.readFileSync(CORE, 'utf8');
  // Pointer canonical BẮT BUỘC: nhắc RULE_GLOBAL.md là nguồn đầy đủ / khi mâu thuẫn theo nó.
  const hasCanonicalPointer = /RULE_GLOBAL\.md/.test(core) &&
    /(canonical|đầy đủ|khi mâu thuẫn|theo\s+`?RULE_GLOBAL)/i.test(core);
  if (!hasCanonicalPointer) {
    problems.push('core_rules.md KHÔNG còn khai RULE_GLOBAL.md là canonical → nguy cơ 2 nguồn policy drift. Thêm lại dòng "Rule canonical đầy đủ: RULE_GLOBAL.md — khi mâu thuẫn theo RULE_GLOBAL.md".');
  }
  // Mỗi bullet digest nên trỏ nguồn.
  const bullets = core.split(/\r?\n/).filter((l) => /^\s*[-*]\s/.test(l));
  const withRef = bullets.filter((l) => /Đầy đủ|RULE_GLOBAL|prompt gen|§/i.test(l)).length;
  if (bullets.length >= 5 && withRef / bullets.length < 0.4) {
    warns.push(`Chỉ ${withRef}/${bullets.length} bullet digest trỏ nguồn "(Đầy đủ: RULE_GLOBAL …)" → nên bổ sung ref để chống drift.`);
  }
}

for (const w of warns) console.log(`[policy] ⚠ ${w}`);
if (problems.length) {
  console.error('[policy] ✗ Vi phạm 1-nguồn-policy (F3):');
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log('[policy] ✓ RULE_GLOBAL.md canonical; core_rules.md là digest có pointer. OK.');
