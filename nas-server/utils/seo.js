/**
 * seo.js — crawlable pages for search engines.
 *
 * The public site is a single-page "desktop" app: before JavaScript runs,
 * the homepage contains ~24 characters of text and no links, and every
 * project lives behind an onClick inside a window. Search engines had one
 * thin URL to index. This module renders, from the public site data:
 *
 *   /work/<slug>/   one real page per public project (title, client, year,
 *                   credits, description, photos) — renderProjectPage
 *   /work/          an index of all projects — renderWorkIndex
 *   sitemap.xml     every page, with image entries — renderSitemap
 *   homepage block  a plain-HTML project index for #root — renderHomepageIndex
 *
 * The NAS serves the first three live (server.js, /seo/*; Netlify proxies
 * /work/* and /sitemap.xml to it), so a newly published project is
 * crawlable at once, without a Netlify deploy. scripts/build.mjs uses
 * renderHomepageIndex to put real links in index.html at deploy time.
 * Each project page links to /#project/<ID>, which opens it in the archive.
 */

const SITE = 'https://aldocarrera.com';

const CREW_FIELDS = [
  ['Talent', 'crewTalent'], ['Styling', 'crewStylist'], ['Hair', 'crewHair'],
  ['Makeup', 'crewMakeup'], ['Art Direction', 'crewArtDirection'],
  ['Set Design', 'crewSetDesign'], ['Production', 'crewProduction'],
  ['Agency', 'crewAgency'], ['Photo Assistant', 'crewPhotoAssistant'],
  ['Digital Tech', 'crewDigitalTech'],
];

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const slugify = (s) => String(s || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

const sized = (url, w, webp = true) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}w=${w}${webp ? '&f=webp' : ''}` : '';

export function projectPages(data) {
  const used = new Set();
  return (data.projects || [])
    .filter(p => p.public !== false && (p.images || []).length)
    .map(p => {
      let slug = slugify(p.name), n = 2;
      while (used.has(slug)) slug = `${slugify(p.name)}-${n++}`;
      used.add(slug);
      const images = (p.images || []).filter(i => !i.rejected && i.blobPath);
      const credits = CREW_FIELDS.map(([label, key]) => [label, (p[key] || '').trim()]).filter(([, v]) => v);
      const what = [p.type, 'photography'].filter(Boolean).join(' ').toLowerCase();
      const summary = (p.description || '').trim() ||
        `${p.name}${p.client ? ` for ${p.client}` : ''} — ${what} by Aldo Carrera${p.location ? `, ${p.location}` : ''}${p.year ? `, ${p.year}` : ''}.` +
        (credits.length ? ` ${credits.slice(0, 3).map(([l, v]) => `${l}: ${v}`).join('. ')}.` : '');
      return { p, slug, images, credits, summary };
    });
}

function shell({ title, description, canonical, image, jsonLd, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description.slice(0, 300))}"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description.slice(0, 300))}"/>
${image ? `<meta property="og:image" content="${esc(image)}"/>\n<meta name="twitter:image" content="${esc(image)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<link rel="preconnect" href="https://api.aldocarrera.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"/>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root { --paper:#f6f4ef; --ink:#1a1a1a; --muted:#77736b; --rule:#dcd7cc; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter,system-ui,sans-serif; line-height:1.5; }
  a { color:inherit; }
  .wrap { max-width:1200px; margin:0 auto; padding:32px 20px 64px; }
  header.site { display:flex; justify-content:space-between; align-items:baseline; gap:16px; flex-wrap:wrap;
    font-family:"IBM Plex Mono",monospace; font-size:12px; letter-spacing:.06em; text-transform:uppercase; margin-bottom:40px; }
  header.site a { text-decoration:none; }
  .eyebrow { font-family:"IBM Plex Mono",monospace; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  h1 { font-size:clamp(28px,5vw,48px); font-weight:500; letter-spacing:-.02em; margin:8px 0 16px; line-height:1.05; }
  .summary { max-width:680px; color:#3a3833; }
  dl.credits { display:grid; grid-template-columns:max-content 1fr; gap:4px 16px; font-size:14px; margin:24px 0; }
  dl.credits dt { color:var(--muted); }
  dl.credits dd { margin:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; margin-top:32px; }
  .grid img { width:100%; height:auto; display:block; background:#e9e5dc; }
  .cta { display:inline-block; margin-top:8px; font-family:"IBM Plex Mono",monospace; font-size:12px; letter-spacing:.06em; text-transform:uppercase; }
  ul.index { list-style:none; padding:0; margin:24px 0; display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:20px; }
  ul.index img { width:100%; aspect-ratio:4/5; object-fit:cover; display:block; background:#e9e5dc; }
  ul.index .t { margin-top:8px; font-weight:500; }
  ul.index .m { font-size:13px; color:var(--muted); }
  ul.index a { text-decoration:none; }
  footer { margin-top:56px; padding-top:20px; border-top:1px solid var(--rule); font-size:13px; color:var(--muted); }
</style>
</head>
<body>
<div class="wrap">
<header class="site"><a href="/">Aldo Carrera — Photography</a><nav><a href="/work/">Work</a> · <a href="/">Archive</a></nav></header>
${body}
<footer>Aldo Carrera — fashion &amp; campaign photographer, Los Angeles. <a href="/">Open the full archive</a></footer>
</div>
</body>
</html>
`;
}

function personLd(data) {
  const ig = (data.settings?.instagram || '').replace(/^@/, '');
  return {
    '@type': 'Person',
    '@id': `${SITE}/#person`,
    name: 'Aldo Carrera',
    url: SITE,
    jobTitle: 'Fashion & Campaign Photographer',
    address: { '@type': 'PostalAddress', addressLocality: 'Los Angeles', addressRegion: 'CA', addressCountry: 'US' },
    ...(ig ? { sameAs: [`https://www.instagram.com/${ig}`] } : {}),
  };
}

function projectPage(data, { p, slug, images, credits, summary }, all) {
  const canonical = `${SITE}/work/${slug}/`;
  const meta = [p.client, p.type, p.month || p.year, p.location].filter(Boolean).join(' · ');
  const alt = (i) => `${p.name}${p.client ? ` for ${p.client}` : ''} — photograph ${i + 1} by Aldo Carrera`;
  const others = all.filter(o => o.slug !== slug).slice(0, 12);
  const body = `
<main>
  <div class="eyebrow">${esc(meta)}</div>
  <h1>${esc(p.name)}</h1>
  <p class="summary">${esc(summary)}</p>
  ${credits.length ? `<dl class="credits"><dt>Photography</dt><dd>Aldo Carrera</dd>${credits.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
  <a class="cta" href="/#project/${encodeURIComponent(p.id)}">↗ View in the archive</a>
  <div class="grid">
    ${images.map((img, i) => `<img src="${esc(sized(img.blobPath, 800))}" alt="${esc(alt(i))}" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async"/>`).join('\n    ')}
  </div>
</main>
<section>
  <h2 class="eyebrow" style="margin-top:56px">More work</h2>
  <ul class="index">${others.map(indexItem).join('')}</ul>
</section>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd(data),
      {
        '@type': 'ImageGallery',
        '@id': `${canonical}#gallery`,
        name: p.name,
        url: canonical,
        description: summary,
        creator: { '@id': `${SITE}/#person` },
        ...(p.year ? { dateCreated: String(p.year) } : {}),
        ...(p.client ? { sourceOrganization: { '@type': 'Organization', name: p.client } } : {}),
        image: images.slice(0, 20).map((img, i) => ({
          '@type': 'ImageObject',
          contentUrl: sized(img.blobPath, 1600, false),
          name: alt(i),
          creator: { '@id': `${SITE}/#person` },
          creditText: 'Aldo Carrera',
          copyrightNotice: '© Aldo Carrera',
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Work', item: `${SITE}/work/` },
          { '@type': 'ListItem', position: 2, name: p.name, item: canonical },
        ],
      },
    ],
  };
  return shell({
    title: `${p.name}${p.client && !p.name.toLowerCase().includes(p.client.toLowerCase()) ? ` — ${p.client}` : ''} | Aldo Carrera Photography`,
    description: summary,
    canonical,
    image: images[0] ? sized(images[0].blobPath, 1200, false) : `${SITE}/og-image.jpg`,
    jsonLd,
    body,
  });
}

function indexItem({ p, slug, images }) {
  const cover = images.find(i => i.cover) || images[0];
  return `<li><a href="/work/${slug}/">${cover ? `<img src="${esc(sized(cover.blobPath, 400))}" alt="${esc(`${p.name} — Aldo Carrera`)}" loading="lazy" decoding="async"/>` : ''}<div class="t">${esc(p.name)}</div><div class="m">${esc([p.client, p.year].filter(Boolean).join(' · '))}</div></a></li>`;
}

function workIndex(data, pages) {
  const canonical = `${SITE}/work/`;
  return shell({
    title: 'Work — Aldo Carrera, Fashion & Campaign Photographer, Los Angeles',
    description: `Fashion, editorial and campaign photography by Aldo Carrera, Los Angeles. ${pages.length} projects${pages.length ? ` including ${pages.slice(0, 4).map(x => x.p.name).join(', ')}` : ''}.`,
    canonical,
    image: `${SITE}/og-image.jpg`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        personLd(data),
        {
          '@type': 'CollectionPage',
          '@id': `${canonical}#page`,
          url: canonical,
          name: 'Work — Aldo Carrera',
          about: { '@id': `${SITE}/#person` },
          hasPart: pages.map(x => ({ '@type': 'ImageGallery', name: x.p.name, url: `${SITE}/work/${x.slug}/` })),
        },
      ],
    },
    body: `
<main>
  <div class="eyebrow">Selected work · Los Angeles</div>
  <h1>Fashion &amp; campaign photography by Aldo Carrera</h1>
  ${data.about?.bio ? `<p class="summary">${esc(data.about.bio)}</p>` : ''}
  <ul class="index">${pages.map(indexItem).join('')}</ul>
</main>`,
  });
}

/* Plain-HTML index placed inside #root on the homepage: real links for
   crawlers' link discovery; React replaces it as soon as the app mounts. */
function homepageIndex(data, pages) {
  // Hidden for visitors with JavaScript (the app replaces it within a moment);
  // crawlers read the links from the HTML either way.
  return `<style>html.js #seo-index{display:none}</style><script>document.documentElement.classList.add('js')</script><div id="seo-index" style="max-width:900px;margin:0 auto;padding:48px 20px;font-family:Inter,system-ui,sans-serif;color:#1a1a1a">
  <h1 style="font-weight:500">Aldo Carrera — Fashion &amp; Campaign Photographer, Los Angeles</h1>
  ${data.about?.bio ? `<p>${esc(data.about.bio)}</p>` : ''}
  <h2>Selected work</h2>
  <ul>${pages.map(x => `<li><a href="/work/${x.slug}/">${esc(x.p.name)}${x.p.client ? ` — ${esc(x.p.client)}` : ''}${x.p.year ? ` (${esc(x.p.year)})` : ''}</a></li>`).join('')}</ul>
  <p><a href="/work/">All work</a>${data.settings?.contactEmail ? ` · <a href="mailto:${esc(data.settings.contactEmail)}">${esc(data.settings.contactEmail)}</a>` : ''}</p>
</div>`;
}

function sitemap(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const url = (loc, extra = '', lastmod = today) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>${extra}\n  </url>`;
  const imgs = (images) => images.slice(0, 50).map(i =>
    `\n    <image:image><image:loc>${esc(sized(i.blobPath, 1600, false))}</image:loc></image:image>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[
  url(`${SITE}/`),
  url(`${SITE}/work/`),
  ...pages.map(x => url(`${SITE}/work/${x.slug}/`, imgs(x.images), (x.p.updatedAt || '').slice(0, 10) || today)),
].join('\n')}
</urlset>
`;
}

export function renderProjectPage(data, slug) {
  const pages = projectPages(data);
  const page = pages.find(x => x.slug === slug);
  return page ? projectPage(data, page, pages) : null;
}
export const renderWorkIndex      = (data) => workIndex(data, projectPages(data));
export const renderSitemap        = (data) => sitemap(projectPages(data));
export const renderHomepageIndex  = (data) => homepageIndex(data, projectPages(data));
