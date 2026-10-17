// Browser-side wrapper around the M7 API. Every screen goes through here.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

// redirectOn401: false for calls where 401 means "wrong credentials", not "signed out".
async function request(path, { method = 'GET', body, redirectOn401 = true } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON error page; handled below.
  }

  if (!res.ok) {
    const error = data?.error ?? {};
    if (res.status === 401 && redirectOn401) redirectToLogin();
    throw new ApiError(
      res.status,
      error.code ?? 'INTERNAL',
      error.message ?? 'Request failed',
      error.details,
    );
  }
  return data;
}

const chatPath = (chatId) => `/chats/${encodeURIComponent(chatId)}`;

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password }, redirectOn401: false }),
  logout: () => request('/auth/logout', { method: 'POST', redirectOn401: false }),
  me: () => request('/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/me/password', {
      method: 'PUT',
      body: { currentPassword, newPassword },
      redirectOn401: false,
    }),

  listUsers: () => request('/users'),
  createUser: (user) => request('/users', { method: 'POST', body: user }),

  listChats: (filter) => request(`/chats?filter=${encodeURIComponent(filter)}`),
  getMessages: (chatId, { before, limit } = {}) => {
    const query = new URLSearchParams();
    if (before) query.set('before', before);
    if (limit) query.set('limit', String(limit));
    const qs = query.toString();
    return request(`${chatPath(chatId)}/messages${qs ? `?${qs}` : ''}`);
  },
  sendMessage: (chatId, text) =>
    request(`${chatPath(chatId)}/messages`, { method: 'POST', body: { text } }),
  assign: (chatId, userId) =>
    request(`${chatPath(chatId)}/assign`, { method: 'PUT', body: { userId } }),
  autoAssign: (chatId) => request(`${chatPath(chatId)}/auto-assign`, { method: 'POST' }),
};

// Only same-origin paths, so ?next= cannot be used as an open redirect. Resolved with the
// browser's own URL parser, which also strips the tabs/newlines that could turn "/\t/x" into
// "//x". Browser only (uses window).
export function safeNext(next) {
  const fallback = '/chats';
  if (typeof next !== 'string' || !next.startsWith('/')) return fallback;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

// Validation errors carry per-field issues; show them in one line.
export function errorText(err) {
  const issues = err?.details?.issues;
  if (err?.code === 'VALIDATION' && Array.isArray(issues) && issues.length) {
    return issues.map((i) => i.message).join('; ');
  }
  return err?.message ?? 'Something went wrong';
}
