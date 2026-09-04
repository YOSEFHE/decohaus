export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const source = process.env.DECOHAUS_OBSERVER_URL || 'https://decohaus.ir/wp-json/decohaus-observer/v1/snapshot';

  try {
    const upstream = await fetch(source, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'user-agent': 'DecoHaus-Relay/1.0'
      },
      redirect: 'follow',
      cache: 'no-store'
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({
        error: 'upstream_error',
        upstream_status: upstream.status,
        upstream_body_preview: text.slice(0, 500)
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'invalid_upstream_json' });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json({
      relay: {
        service: 'DecoHaus Secure Relay',
        version: '1.0.0',
        generated_at_utc: new Date().toISOString()
      },
      snapshot: data
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({
      error: 'relay_fetch_failed',
      message: error instanceof Error ? error.message : 'unknown_error'
    });
  }
}
