// Сборка index.html из assets/js/site-data.json
// Запуск из корня проекта: node assets/js/build.mjs
// Обновляет: прайс (29 строк), JSON-LD, служебные метатеги, телефон во всех блоках, год.
// При production=true и заданном domain создаёт robots.txt и sitemap.xml.

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const htmlPath = resolve(root, 'index.html');
const data = JSON.parse(readFileSync(resolve(here, 'site-data.json'), 'utf8'));

const NB = ' ';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => 'от' + NB + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + '₽';
const base = (data.domain || '').replace(/\/+$/, '');
const abs = (p) => (base ? base + p : null);

function replaceBlock(html, name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error(`Нет маркера build:${name} в index.html`);
  return html.replace(re, `$1\n${content}\n$2`);
}

/* ---------- Прайс ---------- */
const total = data.groups.reduce((s, g) => s + g.items.length, 0);

const nav = `        <nav class="price-nav" aria-label="Группы прайса">
${data.groups.map((g) => `          <a href="#${g.id}">${esc(g.title)}</a>`).join('\n')}
        </nav>`;

const groups = data.groups.map((g, i) => `          <section class="price-group" id="${g.id}" aria-labelledby="${g.id}-title">
            <h3 id="${g.id}-title"><span class="price-group__num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(g.title)}</h3>
            <table class="price-table" aria-labelledby="${g.id}-title">
              <thead><tr><th scope="col">Услуга</th><th scope="col">Стоимость</th></tr></thead>
              <tbody>
${g.items.map(([name, price]) => `                <tr><td>${esc(name)}</td><td>${money(price)}</td></tr>`).join('\n')}
              </tbody>
            </table>
          </section>`).join('\n');

const prices = `${nav}
        <div class="price-groups">
${groups}
        </div>`;

/* ---------- Служебные метатеги ---------- */
const head = [];
if (!data.production) head.push('  <meta name="robots" content="noindex, nofollow">');
if (base) {
  head.push(`  <link rel="canonical" href="${base}/">`);
  head.push(`  <meta property="og:url" content="${base}/">`);
  head.push(`  <meta property="og:image" content="${base}/assets/images/og-image.jpg">`);
  head.push('  <meta property="og:image:width" content="1200">');
  head.push('  <meta property="og:image:height" content="630">');
}

/* ---------- JSON-LD ---------- */
const id = (frag) => (base ? `${base}/#${frag}` : `/#${frag}`);
const business = {
  '@type': 'AutomotiveBusiness',
  '@id': id('business'),
  name: data.name,
  description: 'Студия детейлинга и автосвета в Иркутске: защита плёнкой, полировка, химчистка, ремонт фар и шумоизоляция.',
  telephone: data.phone,
  sameAs: [data.vk, data.gis],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Услуги Prime Station',
    itemListElement: data.groups.map((g) => ({
      '@type': 'Service',
      name: g.title,
      provider: { '@id': id('business') }
    }))
  }
};
if (base) {
  business.url = base + '/';
  if (existsSync(resolve(root, 'assets/images/logo.png'))) business.logo = abs('/assets/images/logo.png');
  business.image = abs('/assets/images/01_front_optics.jpg');
}
if (data.address.confirmed) {
  business.address = {
    '@type': 'PostalAddress',
    streetAddress: data.address.street,
    addressLocality: data.address.locality,
    addressRegion: data.address.region,
    addressCountry: data.address.country
  };
}
const website = { '@type': 'WebSite', '@id': id('website'), name: data.name, inLanguage: 'ru-RU', publisher: { '@id': id('business') } };
const webpage = {
  '@type': 'WebPage',
  '@id': id('webpage'),
  name: 'Детейлинг и автосвет в Иркутске — цены | Prime Station',
  description: 'Prime Station в Иркутске: защита плёнкой, полировка, химчистка, ремонт фар и шумоизоляция. Прайс на сайте. Запись: ' + data.phoneDisplay,
  inLanguage: 'ru-RU',
  isPartOf: { '@id': id('website') },
  about: { '@id': id('business') }
};
if (base) { website.url = base + '/'; webpage.url = base + '/'; }

const jsonld = `  <script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': [website, webpage, business] }, null, 2).replace(/^/gm, '  ')}
  </script>`;

/* ---------- Сборка ---------- */
let html = readFileSync(htmlPath, 'utf8');
html = replaceBlock(html, 'head', head.join('\n'));
html = replaceBlock(html, 'prices', prices);
html = replaceBlock(html, 'jsonld', jsonld);

// Телефон во всех блоках
html = html.replace(/tel:\+7\d{10}/g, 'tel:' + data.phone);
html = html.replace(/\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}/g, data.phoneDisplay);
// Год в подвале (JS тоже обновляет его в браузере)
html = html.replace(/(<span data-year>)\d{4}(<\/span>)/, `$1${new Date().getFullYear()}$2`);

writeFileSync(htmlPath, html);

/* ---------- robots.txt / sitemap.xml ---------- */
const robots = resolve(root, 'robots.txt');
const sitemap = resolve(root, 'sitemap.xml');
if (data.production && base) {
  writeFileSync(robots, `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  writeFileSync(sitemap, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc></url>\n</urlset>\n`);
} else {
  rmSync(robots, { force: true });
  rmSync(sitemap, { force: true });
}

console.log(`Готово: ${data.groups.length} групп, ${total} позиций прайса. ` +
  (data.production ? 'Режим: продакшен.' : 'Режим: предпросмотр (noindex).') +
  (base ? ` Домен: ${base}` : ' Домен не задан.') +
  (data.address.confirmed ? '' : ' Адрес в JSON-LD не выводится (не подтверждён).'));
if (total !== 29) console.warn(`Внимание: в прайсе ${total} позиций, по ТЗ — 29.`);
