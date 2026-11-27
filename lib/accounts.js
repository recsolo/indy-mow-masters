const COOKIE_OPTIONS = '; Path=/api; HttpOnly; Secure; SameSite=Strict';

function cookies(req) {
  return Object.fromEntries((req.headers?.cookie || '').split(';').filter(Boolean).map(part => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator).trim(), part.slice(separator + 1)];
  }));
}

function setSession(res, session) {
  res.setHeader('Set-Cookie', [
    'imm_access=' + session.access_token + '; Max-Age=' + Math.min(session.expires_in || 3600, 3600) + COOKIE_OPTIONS,
    'imm_refresh=' + session.refresh_token + '; Max-Age=2592000' + COOKIE_OPTIONS
  ]);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', ['imm_access=; Max-Age=0' + COOKIE_OPTIONS, 'imm_refresh=; Max-Age=0' + COOKIE_OPTIONS]);
}

async function supabase(path, {token, method = 'GET', body, prefer} = {}) {
  const headers = {apikey: process.env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(process.env.SUPABASE_URL + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = Error('Account request failed');
    error.status = response.status;
    error.code = data?.code || data?.error_code;
    throw error;
  }
  return data;
}

async function account(req, res) {
  const stored = cookies(req);
  let token = stored.imm_access;
  let user;
  if (token) {
    try {
      user = await supabase('/auth/v1/user', {token});
    } catch (error) {
      if (![401, 403].includes(error.status)) throw error;
    }
  }
  if (!user && stored.imm_refresh) {
    try {
      const session = await supabase('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:{refresh_token:stored.imm_refresh}});
      setSession(res, session);
      token = session.access_token;
      user = session.user;
    } catch (error) {
      if (![400, 401, 403].includes(error.status)) throw error;
      clearSession(res);
    }
  }
  if (!user) return null;
  const owner = await supabase('/rest/v1/rpc/portal_is_owner', {token, method:'POST', body:{}});
  return {user, token, owner:owner === true};
}

function sameOrigin(req) {
  const origin = req.headers?.origin;
  return typeof origin === 'string' && origin === 'https://' + req.headers.host;
}

function parseBody(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return {}; }
}

module.exports = {account, supabase, setSession, clearSession, sameOrigin, parseBody};
