const { defineConfig, devices } = require('@playwright/test');
const {
  getProjectOutputDir,
  getRunId,
  getTaskKey,
  getTaskOutputDir,
  getTestResultsDir,
  loadEnvFiles,
} = require('./scripts/utils/runtime_config');

loadEnvFiles();

// --- Lane strategy (QUAN TRỌNG) ---------------------------------------------------------------
// Trong Playwright, `project` = NHÂN BẢN suite (mỗi project chạy lại mọi test khớp phạm vi), KHÔNG
// phải chia việc. Nên: lane PR mặc định chỉ `chromium-desktop`; cross-browser là LÀN RIÊNG bật bằng
// env (nightly/manual) → tránh nhân 3× số lượt chạy + 3× evidence + 3× nhiễu flaky trên mọi PR.
const CROSS_BROWSER = process.env.CROSS_BROWSER === '1';
// Khi suite lớn: chỉ chạy tập critical trên engine phụ, vd CROSS_BROWSER_GREP='@cross-browser'
// rồi tag `test('checkout @cross-browser', …)`. Bỏ trống = engine phụ chạy full lane desktop.
const XB_GREP = process.env.CROSS_BROWSER_GREP ? new RegExp(process.env.CROSS_BROWSER_GREP) : null;
// Spec hạ tầng/diagnostic dưới tests/support/** (cần DB/creds riêng, có spec đọc file lúc load) —
// KHÔNG thuộc lane suite; chạy có chủ đích bằng INFRA_VERIFY=1.
const INFRA_VERIFY = process.env.INFRA_VERIFY === '1';

// Dùng CHUNG cho MỌI project desktop — quên ignore ở 1 engine là mobile-web/load/support bị phủ chéo.
// (`load/` hiện cũng không khớp testMatch `*.spec.*`, giữ ignore làm lớp chắn dự phòng.)
const desktopIgnore = ['**/mobile-web/**', '**/load/**', '**/support/**'];
const desktop = (name, device, extra = {}) => ({ name, testIgnore: desktopIgnore, use: { ...devices[device] }, ...extra });

const projectOutputDir = getProjectOutputDir();
const taskKey = getTaskKey();
const taskOutputDir = getTaskOutputDir({ projectOutputDir, taskKey });
const runId = getRunId();
const testResultsDir = getTestResultsDir({ taskOutputDir, runId });

module.exports = defineConfig({
  testDir: './tests',
  outputDir: `${testResultsDir}/artifacts`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${testResultsDir}/playwright-report`, open: 'never' }],
    ['json', { outputFile: `${testResultsDir}/results.json` }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: process.env.PW_VIDEO || 'off',
    trace: process.env.PW_TRACE || 'off',
    // Tắt cờ automation của Chromium: một số SPA (vd LMS/Keycloak) phát hiện automation → chặn OIDC
    // redirect / loop trang login trắng. Vô hại với app khác. Xem tests/fe/support/lmsLogin.ts.
    // Đã nghiệm thu: arg này KHÔNG làm Firefox/WebKit vỡ (bị bỏ qua) → an toàn để ở global `use`.
    launchOptions: { args: ['--disable-blink-features=AutomationControlled'] },
  },
  // Desktop chạy tests/ trừ mobile-web|load|support; mobile-web chạy trên thiết bị thật (touch/UA/isMobile).
  // Không để project mobile phủ toàn bộ suite (tránh nhân 3 lần). Task-scoped scripts (automation/*.js)
  // KHÔNG dùng projects này — chúng tự emulate qua browser.newContext({ ...devices[...] }), xem
  // prompt_templates/phase2/04_execute_fe_playwright.md.
  projects: [
    desktop('chromium-desktop', 'Desktop Chrome'), // lane mặc định (PR): 1 engine, phản hồi nhanh
    // Lane cross-browser — CHỈ khi CROSS_BROWSER=1 (nightly/manual). WebKit đã có sẵn trong CI vì
    // devices['iPhone 13'] dùng engine webkit; FIREFOX phải thêm vào bước `playwright install`.
    ...(CROSS_BROWSER
      ? [
          desktop('firefox-desktop', 'Desktop Firefox', XB_GREP ? { grep: XB_GREP } : {}),
          desktop('webkit-desktop', 'Desktop Safari', XB_GREP ? { grep: XB_GREP } : {}),
        ]
      : []),
    {
      name: 'iphone-13',
      testDir: './tests/mobile-web',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'pixel-7',
      testDir: './tests/mobile-web',
      use: { ...devices['Pixel 7'] },
    },
    // Opt-in (INFRA_VERIFY=1): spec hạ tầng/diagnostic — không chạy trong lane suite/PR.
    ...(INFRA_VERIFY ? [{ name: 'infra-verify', testDir: './tests/support', use: { ...devices['Desktop Chrome'] } }] : []),
  ],
});
