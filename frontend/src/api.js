let csrfToken = null;

async function getCsrfToken() {
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.csrfToken) throw new Error(body.message || 'Unable to initialize secure session.');
  csrfToken = body.csrfToken;
  return csrfToken;
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (['POST','PUT','PATCH','DELETE'].includes(method)) headers['X-CSRF-Token'] = await getCsrfToken();
  let body = options.body;
  if (body && !isForm && typeof body !== 'string') body = JSON.stringify(body);
  const response = await fetch(`/api${path}`, { ...options, method, headers, body, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

export function assetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

export function formatDate(value, includeTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(new Date(value));
}
