function decodeEntities(s = '') {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function attrs(tag = '') {
  const out = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag)) !== null) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function absolute(base, url) {
  try { return new URL(url, base).href; } catch { return null; }
}

async function fetchResource(url, accept = '*/*') {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: { accept, 'user-agent': 'DecoHaus-Performance-Audit/1.0' }
    });
    const buf = await r.arrayBuffer();
    return {
      url,
      final_url: r.url,
      ok: r.ok,
      status: r.status,
      ms: Date.now() - started,
      bytes: buf.byteLength,
      content_type: r.headers.get('content-type'),
      cache_control: r.headers.get('cache-control'),
      content_encoding: r.headers.get('content-encoding'),
      text: (r.headers.get('content-type') || '').match(/text|javascript|json|xml|css|html/) ? new TextDecoder().decode(buf) : null,
    };
  } catch (e) {
    return { url, final_url: url, ok: false, status: 0, ms: Date.now() - started, bytes: 0, error: e instanceof Error ? e.message : 'fetch_failed' };
  }
}

function parseHtml(base, html) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0]));
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => attrs(m[0]));
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => attrs(m[0]));
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1] || '');
  const viewport = html.match(/<meta\b[^>]*name=["']viewport["'][^>]*>/i)?.[0] || null;

  const css = links
    .filter(x => (x.rel || '').toLowerCase().split(/\s+/).includes('stylesheet') && x.href)
    .map(x => ({ url: absolute(base, x.href), media: x.media || null }));
  const preloads = links
    .filter(x => (x.rel || '').toLowerCase().split(/\s+/).includes('preload'))
    .map(x => ({ as: x.as || null, href: absolute(base, x.href || ''), fetchpriority: x.fetchpriority || null }));
  const js = scripts.filter(x => x.src).map(x => ({
    url: absolute(base, x.src),
    defer: 'defer' in x,
    async: 'async' in x,
    type: x.type || null,
  }));
  const img = images.map(x => ({
    src: absolute(base, x.src || ''),
    srcset: x.srcset || null,
    loading: x.loading || 'eager-default',
    fetchpriority: x.fetchpriority || null,
    width: x.width || null,
    height: x.height || null,
    decoding: x.decoding || null,
    alt_present: 'alt' in x && x.alt.trim() !== '',
  }));

  return {
    viewport: viewport ? attrs(viewport) : null,
    css,
    js,
    images: img,
    preloads,
    inline_css_bytes: styles.reduce((n, s) => n + Buffer.byteLength(s), 0),
    google_fonts_refs: (html.match(/fonts\.googleapis\.com/gi) || []).length,
    gstatic_refs: (html.match(/fonts\.gstatic\.com/gi) || []).length,
  };
}

function summarizeCss(cssText = '') {
  const media = [...cssText.matchAll(/@media\s*\(([^)]*)\)/gi)].map(m => m[1].trim());
  const imports = [...cssText.matchAll(/@import\s+(?:url\()?['"]?([^'"\)\s;]+)[^;]*;/gi)].map(m => m[1]);
  return {
    media_queries: [...new Set(media)].slice(0, 30),
    imports,
    has_reduced_motion: /prefers-reduced-motion/i.test(cssText),
    uses_aspect_ratio: /aspect-ratio\s*:/i.test(cssText),
    uses_clamp: /clamp\s*\(/i.test(cssText),
    uses_container_queries: /@container/i.test(cssText),
  };
}

async function analyzePage(path) {
  const base = 'https://decohaus.ir';
  const url = base + path;
  const htmlFetch = await fetchResource(url, 'text/html');
  const html = htmlFetch.text || '';
  const parsed = parseHtml(htmlFetch.final_url || url, html);

  const cssUnique = [...new Set(parsed.css.map(x => x.url).filter(Boolean))];
  const jsUnique = [...new Set(parsed.js.map(x => x.url).filter(Boolean))];
  const imageUnique = [...new Set(parsed.images.map(x => x.src).filter(Boolean))];

  const [cssRes, jsRes, imageRes] = await Promise.all([
    Promise.all(cssUnique.slice(0, 12).map(u => fetchResource(u, 'text/css,*/*;q=0.8'))),
    Promise.all(jsUnique.slice(0, 12).map(u => fetchResource(u, 'text/javascript,*/*;q=0.8'))),
    Promise.all(imageUnique.slice(0, 14).map(u => fetchResource(u, 'image/avif,image/webp,image/*,*/*;q=0.8'))),
  ]);

  const cssAnalysis = cssRes.map(r => ({ ...r, analysis: summarizeCss(r.text || '') }));
  const totalCss = cssRes.reduce((n, r) => n + (r.bytes || 0), 0);
  const totalJs = jsRes.reduce((n, r) => n + (r.bytes || 0), 0);
  const totalImages = imageRes.reduce((n, r) => n + (r.bytes || 0), 0);
  const slowResources = [...cssRes, ...jsRes, ...imageRes]
    .filter(r => r.ms >= 500)
    .sort((a,b) => b.ms - a.ms)
    .slice(0, 10)
    .map(r => ({ url: r.final_url || r.url, ms: r.ms, bytes: r.bytes, content_type: r.content_type }));

  const issues = [];
  if (htmlFetch.ms > 1200) issues.push({ severity: 'medium', issue: `HTML response ${htmlFetch.ms}ms` });
  if (!parsed.viewport) issues.push({ severity: 'high', issue: 'Missing viewport meta' });
  if (totalCss > 180 * 1024) issues.push({ severity: 'medium', issue: `CSS payload ${(totalCss/1024).toFixed(0)}KB` });
  if (totalJs > 180 * 1024) issues.push({ severity: 'medium', issue: `JS payload ${(totalJs/1024).toFixed(0)}KB` });
  if (totalImages > 2.5 * 1024 * 1024) issues.push({ severity: 'medium', issue: `Initial image payload ${(totalImages/1024/1024).toFixed(2)}MB` });
  if (parsed.images.filter(x => x.loading !== 'lazy').length > 3) issues.push({ severity: 'low', issue: 'More than 3 non-lazy images' });
  if (!parsed.images.some(x => (x.fetchpriority || '').toLowerCase() === 'high')) issues.push({ severity: 'low', issue: 'No image fetchpriority=high' });
  if (!parsed.preloads.some(x => x.as === 'image')) issues.push({ severity: 'low', issue: 'No image preload detected' });
  if (parsed.google_fonts_refs > 0) issues.push({ severity: 'low', issue: 'Google Fonts referenced in HTML' });
  if (parsed.js.some(x => !x.defer && !x.async && x.type !== 'module')) issues.push({ severity: 'medium', issue: 'Potential render-blocking script detected' });

  return {
    path,
    html: {
      status: htmlFetch.status,
      response_ms: htmlFetch.ms,
      bytes: htmlFetch.bytes,
      content_type: htmlFetch.content_type,
      cache_control: htmlFetch.cache_control,
    },
    document: {
      viewport: parsed.viewport,
      css_count: cssUnique.length,
      js_count: jsUnique.length,
      image_count: imageUnique.length,
      inline_css_bytes: parsed.inline_css_bytes,
      preloads: parsed.preloads,
      non_lazy_images: parsed.images.filter(x => x.loading !== 'lazy').length,
      lazy_images: parsed.images.filter(x => x.loading === 'lazy').length,
      high_priority_images: parsed.images.filter(x => (x.fetchpriority || '').toLowerCase() === 'high').length,
      images_without_dimensions: parsed.images.filter(x => !(x.width && x.height)).length,
      google_fonts_refs: parsed.google_fonts_refs,
      gstatic_refs: parsed.gstatic_refs,
    },
    payload: {
      css_bytes: totalCss,
      js_bytes: totalJs,
      sampled_image_bytes: totalImages,
      total_sampled_bytes: htmlFetch.bytes + totalCss + totalJs + totalImages,
    },
    css: cssAnalysis.map(r => ({
      url: r.final_url || r.url,
      status: r.status,
      ms: r.ms,
      bytes: r.bytes,
      cache_control: r.cache_control,
      analysis: r.analysis,
    })),
    js: jsRes.map(r => ({ url: r.final_url || r.url, status: r.status, ms: r.ms, bytes: r.bytes, cache_control: r.cache_control })),
    images: imageRes.map(r => ({ url: r.final_url || r.url, status: r.status, ms: r.ms, bytes: r.bytes, content_type: r.content_type, cache_control: r.cache_control })),
    slow_resources: slowResources,
    issues,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const requested = typeof req.query.path === 'string' && req.query.path.startsWith('/')
    ? [req.query.path]
    : ['/fa/', '/en/', '/fa/projects/amirabad/', '/fa/projects/gandhi-medical/'];

  const pages = [];
  for (const p of requested) pages.push(await analyzePage(p));

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).json({
    audit: { service: 'DecoHaus Performance & Mobile Audit', version: '1.0.0', generated_at_utc: new Date().toISOString() },
    pages,
  });
}
