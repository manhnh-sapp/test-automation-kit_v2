'use strict';

/*
 * learn_reporter.js — Playwright reporter TỰ ĐỘNG thu learning data sau MỖI lần chạy test.
 * Để không phải nhớ gọi `npm run learn` thủ công (nguyên nhân knowledge/ từng trống dù chạy nhiều task).
 *
 * VÌ SAO LÀ REPORTER, KHÔNG PHẢI globalTeardown (đã đo thật, đừng đổi):
 *   globalTeardown chạy TRƯỚC khi reporter json ghi file → results.json CHƯA tồn tại → metrics trắng.
 *   Reporter `onEnd` (khai SAU reporter json trong config) thì results.json đã ghi xong. Vì vậy trong
 *   playwright.config.js reporter này PHẢI đứng CUỐI danh sách.
 *
 * An toàn: never-throw (lỗi thu học liệu KHÔNG được làm đỏ test run), và bỏ qua khi:
 *   - LEARN_AFTER_RUN=0            → tắt thủ công
 *   - thiếu TASK context           → không biết ghi cho task nào
 *   - 0 test chạy                  → khỏi ghi record rác
 *   - đang ở CI                    → CI có bước metrics riêng ở job merge-report (tránh ghi 2 lần)
 * learn_task.js vốn idempotent nên chạy lại cũng không nhân đôi dữ liệu.
 */

const path = require('path');
const { spawnSync } = require('child_process');

class LearnReporter {
  onBegin(_config, suite) { this._planned = suite ? suite.allTests().length : 0; }

  onEnd(result) {
    try {
      if (process.env.LEARN_AFTER_RUN === '0') return;
      if (process.env.CI) { return; } // CI: metrics thu ở job merge-report
      const task = process.env.TASK_KEY;
      const pod = process.env.PROJECT_OUTPUT_DIR;
      if (!task || !pod) return;
      if (!this._planned) return;                               // không có test nào → bỏ qua
      if (result && result.status === 'interrupted') return;     // run bị ngắt → dữ liệu không đủ tin

      const r = spawnSync(process.execPath, [path.join(__dirname, 'learn_task.js'), '--task', task, '--project-out', pod], { encoding: 'utf8' });
      const lines = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).filter((l) => l.startsWith('[learn]'));
      console.log(lines.length ? `\n${lines.join('\n')}` : '\n[learn] (không thu được — xem `npm run learn` để chẩn đoán)');
    } catch (e) {
      console.log(`\n[learn] bỏ qua (lỗi thu học liệu, KHÔNG ảnh hưởng kết quả test): ${e.message}`);
    }
  }
}

module.exports = LearnReporter;
