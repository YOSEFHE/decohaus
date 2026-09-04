function decodeEntities(s = '') {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s = '') {
  return decodeEntities(s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function one(html, re) {
  const m = html.match(re);
  return m ? decodeEntities((m[1] || '').trim()) : null;
}

function many(html, re, map = x => x) {
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(map(m));
  return out;
}

function attrs(tag = '') {
  const out = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag)) !== null) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

async function fetchText(url) {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'user-agent': 'DecoHaus-Audit/1.0' }
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, final_url: r.url, ms: Date.now() - started, headers: Object.fromEntries(r.headers.entries()), text };
  } catch (e) {
    return { ok: false, status: 0, final_url: url, ms: Date.now() - started, headers: {}, text: '', error: e instanceof Error ? e.message : 'fetch_failed' };
  }
}

function analyzeHtml(url, f) {
  const html = f.text || '';
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
  const htmlAttrs = attrs(htmlTag);
  const links = many(html, /<link\b[^>]*>/gi, m => attrs(m[0]));
  const metas = many(html, /<meta\b[^>]*>/gi, m => attrs(m[0]));
  const canonical = links.find(x => (x.rel || '').toLowerCase() === 'canonical')?.href || null;
  const hreflang = links.filter(x => (x.rel || '').toLowerCase() === 'alternate' && x.hreflang).map(x => ({ lang: x.hreflang, href: x.href || null }));
  const description = metas.find(x => (x.name || '').toLowerCase() === 'description')?.content || null;
  const robots = metas.find(x => (x.name || '').toLowerCase() === 'robots')?.content || null;
  const og = {};
  for (const m of metas) if (m.property?.toLowerCase().startsWith('og:')) og[m.property.toLowerCase()] = m.content || '';
  const twitter = {};
  for (const m of metas) if (m.name?.toLowerCase().startsWith('twitter:')) twitter[m.name.toLowerCase()] = m.content || '';
  const h1 = many(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, m => stripTags(m[1])).filter(Boolean);
  const h2 = many(html, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, m => stripTags(m[1])).filter(Boolean).slice(0, 20);
  const images = many(html, /<img\b[^>]*>/gi, m => attrs(m[0]));
  const imgMissingAlt = images.filter(x => !('alt' in x) || x.alt.trim() === '').length;
  const jsonLdBlocks = many(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, m => m[1].trim()).filter(Boolean);
  const schemaTypes = [];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block);
      const walk = v => {
        if (!v) return;
        if (Array.isArray(v)) return v.forEach(walk);
        if (typeof v === 'object') {
          const t = v['@type'];
          if (typeof t === 'string') schemaTypes.push(t);
          else if (Array.isArray(t)) t.forEach(x => typeof x === 'string' && schemaTypes.push(x));
          Object.values(v).forEach(walk);
        }
      };
      walk(data);
    } catch {}
  }
  const title = one(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return {
    requested_url: url,
    status: f.status,
    ok: f.ok,
    final_url: f.final_url,
    response_ms: f.ms,
    content_type: f.headers['content-type'] || null,
    title,
    title_length: title ? title.length : 0,
    description,
    description_length: description ? description.length : 0,
    canonical,
    hreflang,
    robots_meta: robots,
    html_lang: htmlAttrs.lang || null,
    html_dir: htmlAttrs.dir || null,
    h1,
    h1_count: h1.length,
    h2,
    image_count: images.length,
    images_missing_alt: imgMissingAlt,
    og,
    twitter,
    schema_types: [...new Set(schemaTypes)],
    body_text_preview: stripTags(html).slice(0, 1200)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const base = 'https://decohaus.ir';
  const defaults = [
    '/', '/fa/', '/en/',
    '/deco_project/amirabad-fa/', '/deco_project/amirabad-en/',
    '/deco_project/gandhi-medical-fa/', '/deco_project/gandhi-medical-en/',
    '/deco_project/al-jadriya-mall-fa/', '/deco_project/al-jadriya-mall-en/',
    '/deco_project/custom-executive-table-fa/', '/deco_project/custom-executive-table-en/'
  ];
  const requested = typeof req.query.path === 'string' && req.query.path.startsWith('/') ? [req.query.path] : defaults;

  const pages = await Promise.all(requested.map(async p => {
    const url = base + p;
    const f = await fetchText(url);
    return analyzeHtml(url, f);
  }));

  const specialPaths = ['/robots.txt', '/wp-sitemap.xml', '/sitemap-images.xml'];
  const special = {};
  for (const p of specialPaths) {
    const f = await fetchText(base + p);
    special[p] = {
      status: f.status,
      ok: f.ok,
      final_url: f.final_url,
      response_ms: f.ms,
      content_type: f.headers['content-type'] || null,
      preview: (f.text || '').slice(0, 3000)
    };
  }

  const issues = [];
  for (const p of pages) {
    if (p.status !== 200) issues.push({ severity: 'high', url: p.requested_url, issue: `HTTP ${p.status}` });
    if (!p.title) issues.push({ severity: 'high', url: p.requested_url, issue: 'Missing title' });
    if (!p.description) issues.push({ severity: 'medium', url: p.requested_url, issue: 'Missing meta description' });
    if (!p.canonical) issues.push({ severity: 'high', url: p.requested_url, issue: 'Missing canonical' });
    if (p.h1_count !== 1) issues.push({ severity: 'medium', url: p.requested_url, issue: `Expected 1 H1, found ${p.h1_count}` });
    if (p.images_missing_alt > 0) issues.push({ severity: 'medium', url: p.requested_url, issue: `${p.images_missing_alt} images missing alt` });
    if (p.html_lang?.toLowerCase().startsWith('fa') && p.html_dir !== 'rtl') issues.push({ severity: 'medium', url: p.requested_url, issue: 'Persian page missing dir=rtl' });
    if (p.html_lang?.toLowerCase().startsWith('en') && p.html_dir === 'rtl') issues.push({ severity: 'medium', url: p.requested_url, issue: 'English page incorrectly RTL' });
    if (p.hreflang.length === 0) issues.push({ severity: 'medium', url: p.requested_url, issue: 'No hreflang links' });
  }
  for (const [path, s] of Object.entries(special)) if (s.status !== 200) issues.push({ severity: 'high', url: base + path, issue: `HTTP ${s.status}` });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).json({
    audit: { service: 'DecoHaus Live Audit', version: '1.0.0', generated_at_utc: new Date().toISOString() },
    pages,
    special,
    issues
  });
}
