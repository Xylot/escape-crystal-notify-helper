import { api, fetchPage, wikiTitle, wikiUrl } from './wiki.mjs';

export function primaryBossImage(Parser, text, object = false) {
  const root = Parser.parse(text);
  for (const token of root.querySelectorAll('template')) {
    if (!(object ? /^infobox (scenery|object|npc)$/i : /^infobox (monster|npc)$/i).test(String(token.name).replace(/^Template:/i, '').replaceAll('_', ' ').trim())) continue;
    const args = Object.fromEntries(token.getAllArgs().map(arg => [arg.name.trim().toLowerCase(), String(arg.lastChild).trim()]));
    const key = ['image', ...Object.keys(args).filter(k => /^image\d+$/.test(k)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))].find(k => args[k]);
    if (!key) continue;
    const value = args[key];
    const linked = value.match(/\[\[(?:File|Image):([^\]|]+)(?:\||\]\])/i);
    const file = linked?.[1] ?? (/^(?:File:)?[^{}<>|\[\]\n]+\.(?:png|webp|jpe?g|gif)$/i.test(value) ? value.replace(/^File:/i, '') : null);
    if (file) return `File:${file.trim()}`;
  }
  return null;
}

export async function resolveBossImage(Parser, title, request = api, read = fetchPage, object = false) {
  const page = await read(title);
  const file = primaryBossImage(Parser, page.text, object);
  if (!file) return null;
  const data = await request({ action: 'query', titles: file, prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '960', redirects: '1', formatversion: '2' });
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  if (!info?.url || !info.descriptionurl) return null;
  const original=Number.isFinite(info.width)&&info.width<=960;
  return { url: original?info.url:info.thumburl || info.url, width: original?info.width:info.thumbwidth || info.width, height: original?info.height:info.thumbheight || info.height, source: wikiUrl(page.title), filePage: info.descriptionurl };
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
export const IMAGE_STORAGE = 'escape-crystal-images:v2';
export function createImageCache({ resolve, storage, now = Date.now, concurrency = 4 }) {
  let cached = {};
  try { cached = JSON.parse(storage?.getItem(IMAGE_STORAGE) || '{}'); } catch { /* Private browsing or a damaged cache must not affect editing. */ }
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) cached = {};
  const pending = new Map(), attempted = new Set(), queue = [];
  let active = 0;
  const keyOf = title => wikiTitle(title).toLowerCase();
  const peek = title => {
    const value = cached[keyOf(title)];
    return value && typeof value.url === 'string' && typeof value.filePage === 'string' && Number.isFinite(value.fetchedAt) ? value : null;
  };
  function drain() {
    while (active < concurrency && queue.length) {
      active++;
      const { title, key, finish } = queue.shift();
      let refreshed = false;
      Promise.resolve().then(() => resolve(title)).then(image => {
        if (image) {
          refreshed = true;
          cached[key] = { ...image, fetchedAt: now() };
          try { storage?.setItem(IMAGE_STORAGE, JSON.stringify(cached)); } catch { /* Memory cache remains available. */ }
        }
        return peek(title);
      }).catch(() => peek(title)).then(image => {
        active--; pending.delete(key); if (!refreshed) attempted.add(key); finish(image); drain();
      });
    }
  }
  return {
    peek,
    get(title) {
      const key = keyOf(title), saved = peek(title);
      if (saved && now() - saved.fetchedAt < WEEK || attempted.has(key)) return Promise.resolve(saved);
      if (pending.has(key)) return pending.get(key);
      const promise = new Promise(finish => queue.push({ title, key, finish }));
      pending.set(key, promise); drain(); return promise;
    },
  };
}
