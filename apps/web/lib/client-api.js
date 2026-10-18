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

// F3: `id` is the chat's opaque publicId (chat.id), never the phone number.
export const chatPath = (id) => `/chats/${encodeURIComponent(id)}`;

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

  // F4: optional tag filter.
  listChats: (filter, { tag } = {}) =>
    request(
      `/chats?filter=${encodeURIComponent(filter)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`,
    ),
  getMessages: (id, { before, limit } = {}) => {
    const query = new URLSearchParams();
    if (before) query.set('before', before);
    if (limit) query.set('limit', String(limit));
    const qs = query.toString();
    return request(`${chatPath(id)}/messages${qs ? `?${qs}` : ''}`);
  },
  sendMessage: (id, text) =>
    request(`${chatPath(id)}/messages`, { method: 'POST', body: { text } }),

  // F2: media. createUpload → uploadFile (straight to S3) → sendMedia.
  createUpload: (id, { mimeType, size, filename }) =>
    request(`${chatPath(id)}/uploads`, { method: 'POST', body: { mimeType, size, filename } }),
  sendMedia: (id, { type, uploadId, caption, filename }) =>
    request(`${chatPath(id)}/messages`, {
      method: 'POST',
      body: { type, uploadId, caption: caption || undefined, filename },
    }),
  // Same-origin URL that redirects to a short-lived S3 link after an access check.
  mediaUrl: (id, messageId) =>
    `/api${chatPath(id)}/messages/${encodeURIComponent(messageId)}/media`,
  assign: (id, userId) => request(`${chatPath(id)}/assign`, { method: 'PUT', body: { userId } }),
  autoAssign: (id) => request(`${chatPath(id)}/auto-assign`, { method: 'POST' }),

  // F4: client attributes. `id` is chat.id. Nothing here is ever sent to WhatsApp.
  updateDescription: (id, description, version) =>
    request(`${chatPath(id)}/description`, { method: 'PUT', body: { description, version } }),
  addTag: (id, tag) => request(`${chatPath(id)}/tags`, { method: 'POST', body: { tag } }),
  removeTag: (id, tag) =>
    request(`${chatPath(id)}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }),
  listNotes: (id, { before, limit } = {}) => {
    const query = new URLSearchParams();
    if (before) query.set('before', before);
    if (limit) query.set('limit', String(limit));
    const qs = query.toString();
    return request(`${chatPath(id)}/notes${qs ? `?${qs}` : ''}`);
  },
  createNote: (id, body) => request(`${chatPath(id)}/notes`, { method: 'POST', body: { body } }),
  editNote: (id, noteId, body) =>
    request(`${chatPath(id)}/notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      body: { body },
    }),
  deleteNote: (id, noteId) =>
    request(`${chatPath(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' }),
  // F4 phase 3: tag catalog (GET for everyone; the rest admin only).
  listTagCatalog: () => request('/tags'),
  addCatalogTag: (name) => request('/tags', { method: 'POST', body: { name } }),
  removeCatalogTag: (name) => request(`/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  setTagSettings: (catalogOnly) => request('/tags', { method: 'PATCH', body: { catalogOnly } }),

  // I3 demo: WhatsApp onboarding through Embedded Signup (admin only).
  waOnboardingStatus: () => request('/wa/onboarding'),
  waOnboardingStart: () => request('/wa/onboarding/start', { method: 'POST' }),
  waOnboardingComplete: ({ code, state, wabaId, phoneNumberId }) =>
    request('/wa/onboarding/complete', {
      method: 'POST',
      body: { code, state, wabaId, phoneNumberId },
    }),
  waOnboardingRetry: (pin) => request('/wa/onboarding/retry', { method: 'POST', body: { pin } }),
  waOnboardingDisconnect: () => request('/wa/onboarding/disconnect', { method: 'POST' }),
};

// Only same-origin targets, so ?next= cannot be used as an open redirect. Resolved with the
// browser's own URL parser (which strips tabs/newlines), and returned as an absolute URL:
// a relative path could normalize to "//host" (e.g. "/.//evil.com") and be re-read as
// protocol-relative. Browser only (uses window).
export function safeNext(next) {
  const fallback = '/chats';
  if (typeof next !== 'string' || !next.startsWith('/')) return fallback;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.href : fallback;
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

// F2: uploads a file to the presigned S3 POST form. XHR rather than fetch for upload progress.
// onProgress(0..1); `signal` aborts. Resolves when S3 accepts the file.
export function uploadFile({ url, fields }, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', file); // must be the last field
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, 'UPLOAD_FAILED', 'The file could not be uploaded'));
    xhr.onerror = () => reject(new ApiError(0, 'UPLOAD_FAILED', 'The file could not be uploaded'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload cancelled'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
