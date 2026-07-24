'use strict';

/*
 * Canonical TestCase model — điểm vào DUY NHẤT (architecture hardening #1).
 * GĐ 1a: model + parseMarkdown + validate. GĐ sau: parseXlsx / fromXray / toXlsx.
 * Consumer nên require('scripts/lib/testcase') thay vì tự parse bảng testcase.
 */

const model = require('./model');
const { parseMarkdown, parseTablesMatching } = require('./parseMarkdown');
const { validate, REQUIRED_COLS, REQUIRED_FIELDS } = require('./validate');

module.exports = {
  ...model,
  parseMarkdown, parseTablesMatching,
  validate, REQUIRED_COLS, REQUIRED_FIELDS,
};
