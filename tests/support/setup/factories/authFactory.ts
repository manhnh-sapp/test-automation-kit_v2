import { request, type APIRequestContext } from '@playwright/test';
import { SetupFailure } from '../contracts/preconditionTypes';

export interface AuthSession {
  token: string;
  role?: string;
  /** Request context đã gắn Authorization, dùng cho các factory/API tiếp theo. */
  context: APIRequestContext;
}

function requiredEnv(key: string, preconditionId?: string): string {
  const value = process.env[key];
  if (!value) {
    throw new SetupFailure(`Thiếu env ${key} để tạo auth session.`, { preconditionId });
  }
  return value;
}

/**
 * Factory cho Precondition Type = `auth_session`, Setup Strategy = `api`.
 * Login qua API, trả token + APIRequestContext đã gắn Authorization.
 * Session thường read-only → cleanup 'none'. KHÔNG hardcode credential; đọc từ env.
 *
 * Template: đổi loginPath/payload/response shape theo project thật.
 */
export async function createAuthSession(
  opts: { usernameEnv?: string; passwordEnv?: string; preconditionId?: string } = {},
): Promise<AuthSession> {
  const baseURL = requiredEnv('API_BASE_URL', opts.preconditionId);
  const username = requiredEnv(opts.usernameEnv || 'API_USERNAME', opts.preconditionId);
  const password = requiredEnv(opts.passwordEnv || 'API_PASSWORD', opts.preconditionId);
  const loginPath = process.env.API_LOGIN_PATH || '/api/v1/auth/login';

  const anon = await request.newContext({ baseURL });
  try {
    const res = await anon.post(loginPath, { data: { username, password } });
    if (!res.ok()) {
      throw new SetupFailure(`Login ${loginPath} trả ${res.status()}.`, {
        preconditionId: opts.preconditionId,
      });
    }
    const body = (await res.json()) as { token?: string; accessToken?: string; role?: string };
    const token = body.token || body.accessToken;
    if (!token) {
      throw new SetupFailure('Login không trả token.', { preconditionId: opts.preconditionId });
    }
    const context = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    return { token, role: body.role, context };
  } finally {
    await anon.dispose();
  }
}
