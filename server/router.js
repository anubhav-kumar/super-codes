// Tiny method + path router. Invalid path params → no match (callers return 404).
import { CHAT_ID_RE, ULID_RE, ASSET_FILE_RE } from '../lib/constants.js';

const PARAM_RES = { chatId: CHAT_ID_RE, assetId: ULID_RE, file: ASSET_FILE_RE };

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    routes.push({ method, segments: pattern.split('/').slice(1), handler });
  }

  function matchPath(segments, parts) {
    if (segments.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.startsWith(':')) {
        const name = seg.slice(1);
        let value;
        try {
          value = decodeURIComponent(parts[i]);
        } catch {
          return null;
        }
        const re = PARAM_RES[name];
        if (re && !re.test(value)) return null;
        params[name] = value;
      } else if (seg !== parts[i]) {
        return null;
      }
    }
    return params;
  }

  // → { handler, params } | { allow: string[] } (405) | null (404)
  function match(method, pathname) {
    const parts = pathname.split('/').slice(1);
    const allowed = new Set();
    for (const r of routes) {
      const params = matchPath(r.segments, parts);
      if (!params) continue;
      if (r.method === method) return { handler: r.handler, params };
      allowed.add(r.method);
    }
    if (method === 'HEAD' && allowed.has('GET')) {
      for (const r of routes) {
        if (r.method !== 'GET') continue;
        const params = matchPath(r.segments, parts);
        if (params) return { handler: r.handler, params };
      }
    }
    if (allowed.size === 0) return null;
    if (allowed.has('GET')) allowed.add('HEAD');
    allowed.add('OPTIONS');
    return { allow: [...allowed] };
  }

  return { add, match };
}
