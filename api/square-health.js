// Environment-isolated read-only Square connection check. Never returns credentials.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const live = process.env.VERCEL_ENV === 'production';
  if (process.env.VERCEL_ENV !== 'preview' && !live) {
    return res.status(404).json({ error: 'Not available' });
  }
  const environment = live ? 'production' : 'sandbox';
  const enabled = !live || process.env.SQUARE_LIVE_ENABLED === 'true';
  if (live && !enabled) return res.status(200).json({connected:false,environment,enabled:false});
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const applicationId = process.env.SQUARE_APPLICATION_ID;
  if (!token || !applicationId) {
    return res.status(503).json({ connected: false, reason: 'Square credentials missing' });
  }
  try {
    const response = await fetch((live ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com') + '/v2/locations', {
      headers: { Authorization: 'Bearer ' + token, 'Square-Version': '2025-10-16' },
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.json();
    return res.status(response.ok ? 200 : 502).json({
      connected: response.ok && Array.isArray(body.locations),
      environment, enabled,
      locationsAvailable: response.ok && Array.isArray(body.locations) ? body.locations.length : 0,
      error: response.ok ? undefined : 'Square rejected the request'
    });
  } catch {
    return res.status(502).json({ connected: false, error: 'Square connection failed' });
  }
};
