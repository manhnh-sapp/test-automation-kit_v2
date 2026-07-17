/**
 * Xray Cloud GraphQL client (no extra deps, uses https).
 *
 * Xray manual test steps (Action / Data / Expected Result), Preconditions and
 * Test Type are NOT Jira fields — they live in Xray's own store and can only be
 * written through the Xray Cloud API, authenticated with an Xray API Key
 * (XRAY_CLIENT_ID + XRAY_CLIENT_SECRET), not the Jira API token.
 *
 * Docs: https://xray.cloud.getxray.app/doc/graphql/
 */

const https = require('https');

const PLACEHOLDER = /^your-xray-client/i;

// Transient failures worth retrying: rate limits, 5xx, network blips, and the
// eventual-consistency window right after a Jira issue is created (Xray's
// GraphQL store has not indexed the new issueId yet — the cause of the
// "issueId" errors that previously needed a manual re-run).
const TRANSIENT_MESSAGE = /issue\s*id|issueid|could not be found|does not exist|not found|rate.?limit|too many requests|temporar|timeout|timed out|try again|\b(429|500|502|503|504)\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err) {
  if (!err) return false;
  if (err.transient === true) return true;
  return TRANSIENT_MESSAGE.test(String(err.message || ''));
}

function isUsableCreds(clientId, clientSecret) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  if (!id || !secret) return false;
  if (PLACEHOLDER.test(id) || PLACEHOLDER.test(secret)) return false;
  return true;
}

function httpsRequest({ baseUrl, method, path: apiPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const data = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
    const reqHeaders = {
      Accept: 'application/json',
      ...headers,
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    };
    const req = https.request(
      {
        hostname: url.hostname,
        method,
        path: `${url.pathname.replace(/\/+$/, '')}${apiPath}`,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: raw }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

class XrayCloudClient {
  constructor({ clientId, clientSecret, baseUrl, maxRetries, retryBaseMs } = {}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = (baseUrl || 'https://xray.cloud.getxray.app').replace(/\/+$/, '');
    this.token = '';
    this.maxRetries = Number.isFinite(maxRetries)
      ? maxRetries
      : (Number.parseInt(process.env.XRAY_MAX_RETRIES || '', 10) || 3);
    this.retryBaseMs = Number.isFinite(retryBaseMs)
      ? retryBaseMs
      : (Number.parseInt(process.env.XRAY_RETRY_BASE_MS || '', 10) || 500);
  }

  /**
   * Run an async op with exponential backoff, retrying ONLY transient failures
   * (rate limit / 5xx / network / post-create indexing lag). Non-transient
   * errors (bad query, auth, real not-found) fail immediately.
   *
   * Safe for the mutations here: syncManualSteps clears steps before re-adding,
   * so a retry that double-applies self-heals on the next run; the observed
   * transient window is getTest right after issue creation.
   */
  async withRetry(fn, { retries = this.maxRetries } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !isTransientError(error)) throw error;
        const wait = this.retryBaseMs * 2 ** attempt + Math.floor(Math.random() * this.retryBaseMs);
        await delay(wait);
      }
    }
    throw lastError;
  }

  async authenticate() {
    if (this.token) return this.token;
    const res = await httpsRequest({
      baseUrl: this.baseUrl,
      method: 'POST',
      path: '/api/v2/authenticate',
      headers: { 'Content-Type': 'application/json' },
      body: { client_id: this.clientId, client_secret: this.clientSecret },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Xray authenticate failed (${res.statusCode}): ${res.body.slice(0, 300)}`);
    }
    // Response body is the bearer token, JSON-encoded (quoted) string.
    this.token = res.body.replace(/^"+|"+$/g, '').trim();
    if (!this.token) throw new Error('Xray authenticate returned an empty token.');
    return this.token;
  }

  async graphql(query, variables) {
    return this.withRetry(() => this._graphqlOnce(query, variables));
  }

  async _graphqlOnce(query, variables) {
    await this.authenticate();
    const res = await httpsRequest({
      baseUrl: this.baseUrl,
      method: 'POST',
      path: '/api/v2/graphql',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: { query, variables },
    });
    let parsed;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      throw new Error(`Xray GraphQL invalid JSON (${res.statusCode}): ${res.body.slice(0, 300)}`);
    }
    if (res.statusCode < 200 || res.statusCode >= 300 || (parsed.errors && parsed.errors.length)) {
      const msg = parsed.errors ? parsed.errors.map((e) => e.message).join('; ') : res.body.slice(0, 300);
      throw new Error(`Xray GraphQL error (${res.statusCode}): ${msg}`);
    }
    return parsed.data;
  }

  /** Fetch current test type + steps for an Xray Test by its Jira numeric issue id. */
  async getTest(issueId) {
    const data = await this.graphql(
      `query($issueId: String!) {
        getTest(issueId: $issueId) {
          issueId
          testType { name kind }
          steps { id action data result }
        }
      }`,
      { issueId: String(issueId) },
    );
    return data && data.getTest ? data.getTest : null;
  }

  async setTestType(issueId, testTypeName) {
    return this.graphql(
      `mutation($issueId: String!, $testType: UpdateTestTypeInput!) {
        updateTestType(issueId: $issueId, testType: $testType) {
          issueId
          testType { name kind }
        }
      }`,
      { issueId: String(issueId), testType: { name: testTypeName } },
    );
  }

  async addStep(issueId, step) {
    return this.graphql(
      `mutation($issueId: String!, $step: CreateStepInput!) {
        addTestStep(issueId: $issueId, step: $step) { id action }
      }`,
      {
        issueId: String(issueId),
        step: {
          action: String(step.action || ''),
          data: String(step.data || ''),
          result: String(step.result || ''),
        },
      },
    );
  }

  async removeStep(stepId) {
    return this.graphql(
      `mutation($stepId: String!) { removeTestStep(stepId: $stepId) }`,
      { stepId: String(stepId) },
    );
  }

  /** Associate existing Precondition issues with a Test (native Xray, shows in "Preconditions" tab). */
  async addPreconditionsToTest(testIssueId, preconditionIssueIds) {
    return this.graphql(
      `mutation($issueId: String!, $preIds: [String]!) {
        addPreconditionsToTest(issueId: $issueId, preconditionIssueIds: $preIds) {
          addedPreconditions
          warning
        }
      }`,
      { issueId: String(testIssueId), preIds: preconditionIssueIds.map(String) },
    );
  }

  /** Return the issueIds of Preconditions currently associated with a Test. */
  async getTestPreconditionIds(testIssueId) {
    const data = await this.graphql(
      `query($issueId: String!) {
        getTest(issueId: $issueId) { preconditions(limit: 100) { results { issueId } } }
      }`,
      { issueId: String(testIssueId) },
    );
    const test = data && data.getTest;
    if (!test || !test.preconditions) return [];
    return (test.preconditions.results || []).map((p) => String(p.issueId));
  }

  async removePreconditionsFromTest(testIssueId, preconditionIssueIds) {
    if (!preconditionIssueIds.length) return null;
    return this.graphql(
      `mutation($issueId: String!, $preIds: [String]!) {
        removePreconditionsFromTest(issueId: $issueId, preconditionIssueIds: $preIds)
      }`,
      { issueId: String(testIssueId), preIds: preconditionIssueIds.map(String) },
    );
  }

  /** Set the Xray definition body of a Precondition (the text shown in the Preconditions tab). */
  async setPreconditionDefinition(preconditionIssueId, definition) {
    return this.graphql(
      `mutation($issueId: String!, $def: String) {
        updatePrecondition(issueId: $issueId, data: { definition: $def }) { issueId }
      }`,
      { issueId: String(preconditionIssueId), def: String(definition || '') },
    );
  }

  /** List a Test Repository folder (path "/" for root) and its direct subfolders. */
  async getFolder(projectId, path) {
    const data = await this.graphql(
      `query($projectId: String!, $path: String!) {
        getFolder(projectId: $projectId, path: $path) {
          name path testsCount folders
        }
      }`,
      { projectId: String(projectId), path: String(path) },
    );
    return data && data.getFolder ? data.getFolder : null;
  }

  /** Create a Test Repository folder (parent must already exist). */
  async createFolder(projectId, folderPath) {
    const data = await this.graphql(
      `mutation($projectId: String!, $path: String!) {
        createFolder(projectId: $projectId, path: $path) { folder { path } warnings }
      }`,
      { projectId: String(projectId), path: String(folderPath) },
    );
    return data ? data.createFolder : null;
  }

  /** Move Tests into a Test Repository folder (folder must exist). */
  async addTestsToFolder(projectId, folderPath, testIssueIds) {
    if (!testIssueIds.length) return null;
    const data = await this.graphql(
      `mutation($projectId: String!, $path: String!, $testIds: [String]!) {
        addTestsToFolder(projectId: $projectId, path: $path, testIssueIds: $testIds) {
          folder { path testsCount }
          warnings
        }
      }`,
      { projectId: String(projectId), path: String(folderPath), testIds: testIssueIds.map(String) },
    );
    return data ? data.addTestsToFolder : null;
  }

  /** Move any issues (e.g. Preconditions) into a Test Repository folder (creates path if missing). */
  async addIssuesToFolder(projectId, folderPath, issueIds) {
    if (!issueIds.length) return null;
    const data = await this.graphql(
      `mutation($projectId: String!, $path: String!, $issueIds: [String]!) {
        addIssuesToFolder(projectId: $projectId, path: $path, issueIds: $issueIds) {
          folder { path }
          warnings
        }
      }`,
      { projectId: String(projectId), path: String(folderPath), issueIds: issueIds.map(String) },
    );
    return data ? data.addIssuesToFolder : null;
  }

  /** Add Tests to a Test Set (native Xray membership, shows in the "Test Sets"/"Tests" tabs). */
  async addTestsToTestSet(testSetIssueId, testIssueIds) {
    return this.graphql(
      `mutation($issueId: String!, $testIds: [String]!) {
        addTestsToTestSet(issueId: $issueId, testIssueIds: $testIds) {
          addedTests
          warning
        }
      }`,
      { issueId: String(testSetIssueId), testIds: testIssueIds.map(String) },
    );
  }

  /** List the Test statuses configured on this Xray instance (name/description/final). */
  async getStatuses() {
    const data = await this.graphql('{ getStatuses { name description final } }');
    return (data && data.getStatuses) || [];
  }

  /**
   * Import execution results (creates or, with info.testExecutionKey, updates a
   * Test Execution and sets each test's run status). Uses the Xray Cloud REST
   * import endpoint (not GraphQL) with the same bearer token.
   * Docs: https://docs.getxray.app/display/XRAYCLOUD/Import+Execution+Results+-+REST+v2
   */
  async importExecution(execution) {
    return this.withRetry(async () => {
      await this.authenticate();
      const res = await httpsRequest({
        baseUrl: this.baseUrl,
        method: 'POST',
        path: '/api/v2/import/execution',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: execution,
      });
      let parsed;
      try {
        parsed = JSON.parse(res.body);
      } catch {
        parsed = { raw: res.body };
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        const detail = parsed && (parsed.error || parsed.message)
          ? (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error || parsed.message))
          : String(res.body).slice(0, 300);
        throw new Error(`Xray import execution error (${res.statusCode}): ${detail}`);
      }
      return parsed;
    });
  }

  /**
   * Make the Test a Manual test with exactly the given steps (idempotent):
   * sets test type, clears any existing steps, then adds the provided ones.
   * Returns { testType, removed, added }.
   */
  async syncManualSteps(issueId, steps, { testType = 'Manual' } = {}) {
    // getTest can transiently return null right after issue creation (indexing
    // lag). Retry a few times before concluding it is not an Xray Test.
    const current = await this.withRetry(async () => {
      const test = await this.getTest(issueId);
      if (!test) {
        const err = new Error(`Xray getTest returned null for issueId ${issueId} (indexing lag or not an Xray Test).`);
        err.transient = true;
        throw err;
      }
      return test;
    });

    const currentType = current.testType && current.testType.name;
    if (currentType !== testType) {
      await this.setTestType(issueId, testType);
    }

    let removed = 0;
    for (const existing of current.steps || []) {
      await this.removeStep(existing.id);
      removed += 1;
    }

    let added = 0;
    for (const step of steps) {
      await this.addStep(issueId, step);
      added += 1;
    }
    return { testType, removed, added };
  }
}

module.exports = { XrayCloudClient, isUsableCreds };
