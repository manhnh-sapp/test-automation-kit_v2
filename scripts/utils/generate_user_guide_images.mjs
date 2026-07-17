// SAPP Academy — User Guide board renderer (HTML/CSS + Playwright)
// Thay renderer GDI+ cũ (generate_user_guide_images.ps1). Render 8 board theo
// SAPP Academy Design System: gold #FFB700 + warm ink #1A1916, Be Vietnam Pro,
// dark phase-band có gold corner-glow, card radius 16, GATE = viền gold + gold-wash.
//
// Chạy: node scripts/utils/generate_user_guide_images.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outDir = path.join(repoRoot, 'docs', 'user-guide-images');
const logoB64 = readFileSync(path.join(repoRoot, 'docs', 'brand', 'logo-sapp.png')).toString('base64');
const logo = `data:image/png;base64,${logoB64}`;

// DS accent palette (semantic tokens + brand gold)
const C = { info: '#2A6FDB', gold: '#FFB700', amber: '#F59E0B', success: '#1F8A5B', danger: '#D64545', ink: '#3D3A33' };

const boards = [
  {
    file: 'main-flow.png', number: '1', title: 'QA Workflow', role: 'Team QA',
    inputs: ['Jira Story', 'Confluence Requirement', 'Figma Design', 'Swagger/OpenAPI', 'Excel baseline'],
    steps: [
      { icon: 'IN', c: C.info, title: '1.1 Requirement intake', body: 'Jira, Confluence, Figma, Swagger' },
      { icon: 'AI', c: C.info, title: '1.2 AI generate testcase', body: 'Sinh testcase và test data draft' },
      { icon: 'XL', c: C.success, title: '1.3 Excel source of truth', body: 'QA review trên file Excel' },
      { icon: 'OK', gate: true, title: 'GATE: QA CONFIRMATION', body: 'Approve trước khi publish Jira/Xray' },
      { icon: 'XR', c: C.amber, title: '1.4 Auto Publish Jira/Xray', body: 'Test issue + optional Test Set' },
      { icon: 'EX', c: C.info, title: '1.5 Execute từ Xray', body: 'Phase 2 mặc định kéo testcase từ Xray' },
      { icon: 'TE', c: C.success, title: '1.6 Đẩy Test Execution', body: 'PASSED/FAILED → Xray + link Test Plan' },
      { icon: 'BG', c: C.danger, title: '1.7 Triage & Jira bug', body: 'Rerun xác nhận + evidence' },
      { icon: 'RR', c: C.success, title: '1.8 Dev fix & Re-run', body: 'Attach evidence, update report' },
    ],
    outputs: ['Excel (gen/publish)', 'Xray Test + Test Execution', 'Test Plan sprint (roll-up)', 'Execution evidence', 'Jira bug nếu đủ điều kiện', 'PASS report'],
  },
  {
    file: 'qa-environment.png', number: '0', title: 'QA Setup', role: 'Team QA',
    inputs: ['VS Code', 'AI chat extension', 'Node.js >= 18', 'Playwright runtime', 'Jira/Confluence/Figma quyền đọc'],
    steps: [
      { icon: 'VS', c: C.info, title: '0.1 Mở đúng workspace root', body: 'Không mở nhầm folder con' },
      { icon: 'AI', c: C.ink, title: '0.2 AI đọc prompt/rule', body: 'Sinh testcase, report, evidence' },
      { icon: 'KIT', c: C.success, title: '0.3 Kit workspace', body: 'prompt_templates, scripts, profiles, outputs' },
      { icon: 'RT', c: C.amber, title: '0.4 Runtime test', body: 'Playwright, app test, API test' },
      { icon: 'DB', gate: true, title: 'DB: CHỈ UAT READ-ONLY', body: 'Verify read-only UAT qua guarded client; không dựng state bằng DB' },
    ],
    outputs: ['Không in secret', 'Không commit .env', 'DB: chỉ UAT read-only', 'Dùng test account', 'Output theo TASK_KEY'],
  },
  {
    file: 'output-structure.png', number: 'A', title: 'Output Map', role: 'Workspace',
    inputs: ['PROJECT_OUTPUT_DIR', 'TASK_KEY', 'RUN_ID khi cần', 'task.md', 'Excel baseline'],
    steps: [
      { icon: 'RQ', c: C.info, title: 'requirements/', body: 'Jira, Confluence, Figma, Swagger snapshot' },
      { icon: 'TC', c: C.success, title: 'test-cases/', body: 'Markdown + Excel source of truth' },
      { icon: 'RP', c: C.amber, title: 'reports/', body: 'Phase 1, execution, publish summary' },
      { icon: 'EV', c: C.ink, title: 'test-results/', body: 'Screenshot, video, trace, response' },
      { icon: 'CH', c: C.info, title: 'change/regen/', body: 'Partial rerun diff, impact, approved merge' },
      { icon: 'MD', c: C.danger, title: 'task.md', body: 'Status board và decision log' },
    ],
    outputs: ['Không lẫn story', 'Không ghi đè TASK_KEY khác', 'Excel là baseline (gen/publish)', 'Xray = nguồn execute mặc định', 'Cleanup qua partial rerun'],
  },
  {
    file: 'phase1-quality-gate.png', number: '1', title: 'Phase 1', role: 'Testcase generation',
    inputs: ['Jira/Confluence', 'Figma', 'Swagger/OpenAPI', 'Business Rules', 'Existing testcase nếu có'],
    steps: [
      { icon: 'SRC', c: C.info, title: '1.1 AI đọc source', body: 'Requirement, rule, design, API' },
      { icon: 'TC', c: C.info, title: '1.2 Generate testcase', body: 'Group theo business flow' },
      { icon: 'XL', c: C.success, title: '1.3 Export Excel', body: 'Excel là source of truth' },
      { icon: 'QA', c: C.amber, title: '1.4 QA review', body: 'Coverage, risk, expected, gap' },
      { icon: 'OK', gate: true, title: 'GATE: QA APPROVAL', body: 'Chỉ publish khi Excel đã approve' },
      { icon: 'XR', c: C.ink, title: '1.5 Publish Xray', body: 'Test issue + optional Test Set' },
    ],
    outputs: ['Testcase Markdown', 'Excel source of truth', 'Coverage summary', 'Jira publish summary', 'Xray Test/Test Set'],
  },
  {
    file: 'phase2-execution-loop.png', number: '2', title: 'Phase 2', role: 'Execution',
    inputs: ['Testcase từ Xray (mặc định)', 'Test account', 'App/API URL', 'Playwright runtime', 'Setup hook nếu có'],
    steps: [
      { icon: 'XR', c: C.success, title: '2.1 Pull từ Xray', body: 'Kéo testcase về canonical local' },
      { icon: 'PRE', c: C.info, title: '2.2 Resolve preconditions', body: 'UI/API/factory/fixture/hook' },
      { icon: 'DB', gate: true, title: 'DB: UAT READ-ONLY', body: 'Verify read-only qua guarded client; không dựng state' },
      { icon: 'RUN', c: C.ink, title: '2.3 Run FE/API', body: 'Playwright execute thật' },
      { icon: 'EV', c: C.amber, title: '2.4 Capture evidence', body: 'Screenshot, video, trace, response' },
      { icon: 'CL', c: C.info, title: '2.5 Classify + push Xray', body: 'PASSED/FAILED/TO DO → Test Execution' },
    ],
    outputs: ['Test Execution trên Xray', 'Test Plan sprint (roll-up)', 'setup_failure nếu setup lỗi', 'Execution summary', 'Evidence path', 'Bug candidate'],
  },
  {
    file: 'jira-bug-evidence.png', number: 'B', title: 'Jira Bug', role: 'Bug readiness',
    inputs: ['Fail candidate', 'Expected result', 'Actual result', 'Evidence', 'Rerun result'],
    steps: [
      { icon: 'EX', c: C.info, title: 'B.1 Execute thật', body: 'Không phải skip hoặc thiếu bước' },
      { icon: 'RR', c: C.ink, title: 'B.2 Rerun xác nhận', body: 'Loại flaky/setup/data issue' },
      { icon: 'ER', c: C.success, title: 'B.3 Expected rõ', body: 'Theo Excel/requirement/API/design' },
      { icon: 'EV', c: C.amber, title: 'B.4 Evidence rõ', body: 'Ảnh/video/log/trace' },
      { icon: 'OK', gate: true, title: 'GATE: BUG READY', body: 'Chỉ log nếu là product bug thật' },
      { icon: 'BG', c: C.danger, title: 'B.5 Log Jira bug', body: 'Description đủ 4 phần' },
    ],
    outputs: ['Precondition', 'Steps', 'Actual', 'Expected', 'Ảnh/video evidence', 'Không log setup/data/automation'],
  },
  {
    file: 'partial-rerun-flow.png', number: 'P', title: 'Partial Rerun', role: 'Requirement changed',
    inputs: ['Requirement đổi', 'Figma đổi', 'Swagger đổi', 'Local spec đổi', 'Baseline testcase đã có'],
    steps: [
      { icon: 'SRC', c: C.amber, title: 'P.1 Source changed', body: 'Chỉ nội dung thay đổi' },
      { icon: 'DIFF', c: C.info, title: 'P.2 Prepare Review', body: 'Diff, impact, testcase draft' },
      { icon: 'OK', gate: true, title: 'GATE: HUMAN APPROVAL', body: 'Không tự merge testcase' },
      { icon: 'AP', c: C.success, title: 'P.3 Apply approved', body: 'Merge NEW/UPDATED/DEPRECATED' },
      { icon: 'RUN', c: C.ink, title: 'P.4 Partial execute', body: 'Chỉ chạy subset affected' },
      { icon: 'XR', c: C.danger, title: 'P.5 Optional Xray Cleanup', body: 'Label stale/restore, không hard delete' },
    ],
    outputs: ['Review checklist', 'Impact matrix', 'Updated Excel baseline', 'Partial execution report', 'Xray cleanup summary'],
  },
  {
    file: 'phase-selection.png', number: 'S', title: 'Prompt Map', role: 'Run đúng nhánh',
    inputs: ['Story mới', 'Excel đã approve', 'Cần execute', 'Bug/case đã fix', 'Tài liệu nguồn đổi'],
    steps: [
      { icon: 'P1', c: C.info, title: 'S.1 Story mới', body: 'run_phase1_template.md' },
      { icon: 'XR', c: C.success, title: 'S.2 Excel approved', body: 'phase1/04_auto_publish_jira.md' },
      { icon: 'P2', c: C.amber, title: 'S.3 Execute', body: 'run_phase2_template.md' },
      { icon: 'RR', c: C.ink, title: 'S.4 Bug/case đã fix', body: 'run_phase_re-run_template.md' },
      { icon: 'PR', c: C.info, title: 'S.5 Source changed', body: 'partial-rerun prepare review' },
      { icon: 'CL', c: C.danger, title: 'S.6 Excel đổi sau publish', body: 'run_xray_test_cleanup.md' },
    ],
    outputs: ['Không dùng nhầm Re-run', 'Publish cần QA approve', 'Execute mặc định từ Xray', 'Partial rerun cho source change', 'Cleanup Xray là nhánh phụ'],
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chevron = `<svg class="chev" width="20" height="11" viewBox="0 0 20 11" fill="none"><path d="M1 1l9 8 9-8" stroke="#E6A300" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function boardHtml(b) {
  const inputs = b.inputs.map((i) => `<li>${esc(i)}</li>`).join('');
  const outputs = b.outputs.map((o) => `<li>${esc(o)}</li>`).join('');
  const steps = b.steps.map((s, i) => {
    const chip = s.gate
      ? `<div class="chip gatechip">${esc(s.icon)}</div>`
      : `<div class="chip" style="background:${s.c}">${esc(s.icon)}</div>`;
    const card = `<div class="step${s.gate ? ' gate' : ''}">${chip}<div class="txt"><div class="st-title">${esc(s.title)}</div><div class="st-body">${esc(s.body)}</div></div></div>`;
    const arrow = i < b.steps.length - 1 ? `<div class="arrow">${chevron}</div>` : '';
    return card + arrow;
  }).join('');

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#FFB700;--gold-600:#E6A300;--ink:#1A1916;--wash:#FAF8F3;--card:#FFFFFF;
  --b-subtle:#E6E0D5;--b-soft:#EFE9DD;--t1:#1A1916;--t2:#57534A;--t3:#79736A;--gold-wash:#FFF9EC;--gold-800:#946800;}
body{font-family:'Be Vietnam Pro',system-ui,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;background:var(--wash);}
.board{width:1520px;background:var(--wash);padding:32px;display:grid;
  grid-template-columns:308px 248px 1fr 248px;gap:20px;align-items:stretch;}

/* Phase band — dark ink + gold corner-glow */
.phase{position:relative;overflow:hidden;background:var(--ink);border-radius:24px;padding:34px 30px;
  color:#fff;display:flex;flex-direction:column;box-shadow:0 16px 40px rgba(26,25,22,.16);}
.phase::before{content:'';position:absolute;inset:0;
  background:radial-gradient(115% 80% at 100% 0%, rgba(255,183,0,.32), rgba(255,183,0,0) 55%);}
.phase::after{content:'';position:absolute;left:-40px;bottom:-60px;width:180px;height:180px;
  background:radial-gradient(circle, rgba(255,183,0,.12), rgba(255,183,0,0) 70%);}
.phase>*{position:relative;z-index:1}
.eyebrow-row{display:flex;align-items:center;gap:10px}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.num{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 7px;
  background:var(--gold);color:var(--ink);font-weight:800;font-size:13px;border-radius:999px}
.p-title{font-size:42px;line-height:1.04;font-weight:800;letter-spacing:-.02em;margin-top:16px;color:#fff}
.p-accent{display:block;width:46px;height:4px;background:var(--gold);border-radius:999px;margin-top:16px}
.p-role{margin-top:16px;color:#C9C2B5;font-size:15px;font-weight:500}
.p-link{margin-top:12px;color:#EFE9DD;font-size:13px;width:fit-content;padding-bottom:2px;
  border-bottom:1px solid rgba(255,255,255,.4)}
.p-foot{margin-top:auto;padding-top:28px}
.logo-chip{background:#fff;border-radius:12px;padding:9px 13px;display:inline-flex;
  box-shadow:0 8px 22px rgba(0,0,0,.28)}
.logo-chip img{height:32px;display:block}
.motto{margin-top:16px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}

/* Input / Output columns */
.col{background:var(--card);border:1px solid var(--b-subtle);border-radius:16px;padding:24px 22px;
  box-shadow:0 2px 6px rgba(26,25,22,.06)}
.col-eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);
  margin-bottom:18px;display:flex;align-items:center;gap:8px}
.col-eyebrow::before{content:'';width:16px;height:3px;border-radius:999px;background:var(--gold)}
.dotlist{list-style:none}
.dotlist li{position:relative;padding-left:20px;margin-bottom:15px;color:var(--t1);font-size:14.5px;
  font-weight:500;line-height:1.42}
.dotlist li:last-child{margin-bottom:0}
.dotlist li::before{content:'';position:absolute;left:0;top:7px;width:8px;height:8px;border-radius:50%;
  background:var(--gold)}

/* Flow */
.flow{display:flex;flex-direction:column;justify-content:center}
.step{background:var(--card);border:1px solid var(--b-soft);border-radius:14px;padding:13px 16px;
  display:flex;align-items:center;gap:14px;box-shadow:0 2px 6px rgba(26,25,22,.06)}
.step.gate{background:var(--gold-wash);border:1.5px solid var(--gold);box-shadow:0 8px 22px rgba(255,183,0,.20)}
.chip{width:40px;height:40px;flex:0 0 auto;border-radius:11px;color:#fff;font-weight:800;font-size:12px;
  letter-spacing:.02em;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(26,25,22,.16)}
.gatechip{background:var(--gold);color:var(--ink)}
.txt{min-width:0}
.st-title{font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--t1)}
.step.gate .st-title{color:var(--gold-800)}
.st-body{font-size:12.5px;font-weight:500;color:var(--t3);margin-top:2px;line-height:1.35}
.arrow{display:flex;justify-content:center;padding:5px 0}
</style></head>
<body>
<div class="board" id="board">
  <aside class="phase">
    <div class="eyebrow-row"><span class="eyebrow">Phase</span><span class="num">${esc(b.number)}</span></div>
    <div class="p-title">${esc(b.title)}</div>
    <span class="p-accent"></span>
    <div class="p-role">${esc(b.role)}</div>
    <div class="p-link">User Guide</div>
    <div class="p-foot">
      <div class="logo-chip"><img src="${logo}" alt="SAPP Academy"></div>
      <div class="motto">Advance your career</div>
    </div>
  </aside>
  <section class="col"><div class="col-eyebrow">Inputs</div><ul class="dotlist">${inputs}</ul></section>
  <section class="flow">${steps}</section>
  <section class="col"><div class="col-eyebrow">Outputs</div><ul class="dotlist">${outputs}</ul></section>
</div>
</body></html>`;
}

// Sơ đồ traceability Xray (thay mermaid trong USER_GUIDE 5.5.0)
function traceabilityHtml() {
  const org = (a, t, s) => `<div class="tnode org" style="--a:${a}"><div class="tn-t">${esc(t)}</div><div class="tn-s">${esc(s)}</div></div>`;
  const chev = (lbl) => `<div class="tchev"><svg width="22" height="12" viewBox="0 0 22 12" fill="none"><path d="M1 1l10 9 10-9" stroke="#E6A300" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${lbl ? `<span>${esc(lbl)}</span>` : ''}</div>`;
  const line = (a, html) => `<div class="tnode line" style="--a:${a}">${html}</div>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#FFB700;--ink:#1A1916;--wash:#FAF8F3;--b-subtle:#E6E0D5;--b-soft:#EFE9DD;--t1:#1A1916;--t2:#57534A;--t3:#79736A;}
body{font-family:'Be Vietnam Pro',system-ui,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;background:var(--wash)}
.diagram{width:1120px;background:var(--wash);padding:40px 48px}
.dhead{text-align:center;margin-bottom:24px}
.deyebrow{color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.dsub{color:var(--t1);font-size:19px;font-weight:700;letter-spacing:-.01em;margin-top:6px}
.tgroup{background:#fff;border:1px solid var(--b-subtle);border-radius:16px;padding:18px 20px;box-shadow:0 2px 6px rgba(26,25,22,.06)}
.tg-eyebrow{font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);display:flex;align-items:center;gap:8px}
.tg-eyebrow::before{content:'';width:16px;height:3px;border-radius:999px;background:var(--gold)}
.trow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px}
.tnode.org{background:var(--wash);border:1px solid var(--b-soft);border-left:4px solid var(--a);border-radius:12px;padding:13px 15px}
.tn-t{font-weight:700;color:var(--t1);font-size:15px;letter-spacing:-.01em}
.tn-s{color:var(--t3);font-size:12.5px;margin-top:3px}
.tchev{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 0}
.tchev span{color:var(--t2);font-size:12.5px;font-weight:600}
.tcenter{display:flex;justify-content:center}
.tnode.hub{background:var(--gold);color:var(--ink);border-radius:16px;padding:15px 44px;font-size:23px;font-weight:800;letter-spacing:.03em;box-shadow:0 8px 24px rgba(255,183,0,.35);display:flex;flex-direction:column;align-items:center;text-align:center}
.tnode.hub span{font-size:12.5px;font-weight:600;letter-spacing:0;margin-top:2px;color:#6B4C00}
.tnode.line{background:#fff;border:1px solid var(--b-subtle);border-left:5px solid var(--a);border-radius:14px;padding:14px 22px;font-size:16px;color:var(--t1);box-shadow:0 2px 6px rgba(26,25,22,.06);text-align:center;width:fit-content;max-width:680px;margin:0 auto}
.tnode.line b{font-weight:800}
.tnode.line .sm{color:var(--t3);font-size:13px;font-weight:500}
.chipset{display:inline-flex;gap:8px;margin-left:12px;vertical-align:middle}
.chipset i{font-style:normal;font-weight:800;font-size:12.5px;padding:3px 11px;border-radius:999px}
.chipset .pass{background:#E9F6EF;color:#14613F}
.chipset .fail{background:#FBEAEA;color:#9E2C2C}
.chipset .todo{background:#F2EEE6;color:#57534A}
</style></head><body>
<div class="diagram" id="diagram">
  <div class="dhead"><span class="deyebrow">Mô hình Xray · Traceability</span><div class="dsub">1 task chạy trọn bộ testcase — Test → Test Plan → Test Execution</div></div>
  <div class="tgroup">
    <div class="tg-eyebrow">Test gắn với</div>
    <div class="trow">
      ${org(C.info, 'Task cha (requirement)', 'Coverage — panel "Test Coverage"')}
      ${org(C.ink, 'Test Repository folder', 'nhóm chức năng')}
      ${org(C.amber, 'Precondition [PRE-NN]', 'tiền điều kiện dùng chung')}
    </div>
  </div>
  ${chev('')}
  <div class="tcenter"><div class="tnode hub">TEST<span>testcase · để Open</span></div></div>
  ${chev('được gom vào (roll-up theo sprint)')}
  ${line(C.success, '<b>Test Plan</b> — 1 sprint <span class="sm">(QA tạo tay đầu sprint)</span>')}
  ${chev('chứa mỗi lần chạy')}
  ${line(C.info, '<b>Test Execution</b> — 1 lần chạy = toàn bộ TC')}
  ${chev('sinh kết quả')}
  ${line(C.gold, '<b>Test Run</b><span class="chipset"><i class="pass">PASS</i><i class="fail">FAIL</i><i class="todo">TO DO</i></span>')}
</div></body></html>`;
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const b of boards) {
    await page.setContent(boardHtml(b), { waitUntil: 'networkidle' });
    try { await page.evaluate(() => document.fonts.ready); } catch {}
    await page.waitForTimeout(150);
    const el = await page.$('#board');
    await el.screenshot({ path: path.join(outDir, b.file) });
    console.log('generated', b.file);
  }
  await page.setContent(traceabilityHtml(), { waitUntil: 'networkidle' });
  try { await page.evaluate(() => document.fonts.ready); } catch {}
  await page.waitForTimeout(150);
  const dia = await page.$('#diagram');
  await dia.screenshot({ path: path.join(outDir, 'xray-traceability.png') });
  console.log('generated xray-traceability.png');
  await browser.close();
};
run().then(() => console.log('done')).catch((e) => { console.error(e); process.exit(1); });
