// Preview-only Square sandbox connection check. Never returns credentials.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Not available' });
  }
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const applicationId = process.env.SQUARE_APPLICATION_ID;
  if (!token || !applicationId) {
    return res.status(503).json({ connected: false, reason: 'Sandbox credentials missing' });
  }
  try {
    const response = await fetch('https://connect.squareupsandbox.com/v2/locations', {
      headers: { Authorization: 'Bearer ' + token, 'Square-Version': '2025-10-16' },
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.json();
    return res.status(response.ok ? 200 : 502).json({
      connected: response.ok && Array.isArray(body.locations),
      environment: 'sandbox',
      locationsAvailable: response.ok && Array.isArray(body.locations) ? body.locations.length : 0,
      error: response.ok ? undefined : 'Square rejected the sandbox request'
    });
  } catch {
    return res.status(502).json({ connected: false, error: 'Square sandbox connection failed' });
  }
};
