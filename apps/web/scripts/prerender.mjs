// Post-build prerender: render the SSR marketing bundle to a string, inject it
// (plus OG/Twitter meta) into a COPY of the built dist/index.html, and write
// dist/marketing.html. dist/index.html is left UNTOUCHED as the SPA shell.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const dist = path.join(webRoot, 'dist');
const ssrEntry = path.join(dist, 'ssr', 'entry-marketing.js');
const shellPath = path.join(dist, 'index.html');
const outPath = path.join(dist, 'marketing.html');

if (!existsSync(ssrEntry)) {
  console.error(`[prerender] missing SSR bundle at ${ssrEntry}. Did "vite build --ssr" run?`);
  process.exit(1);
}
if (!existsSync(shellPath)) {
  console.error('[prerender] missing dist/index.html. Did "vite build" run?');
  process.exit(1);
}

const mod = await import(pathToFileURL(ssrEntry).href);
const { render, MARKETING_SITE_URL, META_TITLE, META_DESCRIPTION, OG_IMAGE_PATH } = mod;

const html = render();
const ogUrl = `${MARKETING_SITE_URL}/`;
const ogImage = `${MARKETING_SITE_URL}${OG_IMAGE_PATH}`;

const head = [
  `<title>${META_TITLE}</title>`,
  `<meta name="description" content="${META_DESCRIPTION}" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:title" content="${META_TITLE}" />`,
  `<meta property="og:description" content="${META_DESCRIPTION}" />`,
  `<meta property="og:url" content="${ogUrl}" />`,
  `<meta property="og:image" content="${ogImage}" />`,
  `<meta name="twitter:card" content="summary_large_image" />`,
  `<meta name="twitter:title" content="${META_TITLE}" />`,
  `<meta name="twitter:description" content="${META_DESCRIPTION}" />`,
  `<meta name="twitter:image" content="${ogImage}" />`,
].join('\n    ');

let out = readFileSync(shellPath, 'utf8');
out = out.replace(/<title>[^<]*<\/title>/, head);
out = out.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

writeFileSync(outPath, out, 'utf8');
console.log(`[prerender] wrote ${outPath} (${out.length} bytes)`);
