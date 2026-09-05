import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import { primaryBossImage, resolveBossImage, createImageCache, IMAGE_STORAGE } from '../src/core/boss-images.mjs';

test('portrait comes from the first NPC/monster infobox image, never an unrelated article image', () => {
  assert.equal(primaryBossImage(Parser, '[[File:Banner.png]]\n{{Infobox Monster|image=[[File:Boss.png|250px]]}}'), 'File:Boss.png');
  assert.equal(primaryBossImage(Parser, '{{Infobox NPC|image2=[[File:Second.png]]|image1=[[File:First.png]]}}'), 'File:First.png');
  assert.equal(primaryBossImage(Parser, '{{Infobox Monster|image=Boss.png}}'), 'File:Boss.png');
  assert.equal(primaryBossImage(Parser, '{{Infobox Item|image=[[File:Sword.png]]}}'), null);
  assert.equal(primaryBossImage(Parser, '{{Infobox NPC|name=No portrait}}'), null);
});

test('resolved image retains canonical article, actual thumbnail, dimensions and file attribution', async () => {
  const image = await resolveBossImage(Parser, 'Alias', async params => {
    assert.equal(params.titles, 'File:Boss.png');
    assert.equal(params.redirects, '1');
    return { query: { pages: [{ imageinfo: [{ url: 'original', thumburl: 'thumbnail', thumbwidth: 320, thumbheight: 180, descriptionurl: 'file-page' }] }] } };
  }, async title => { assert.equal(title, 'Alias'); return { title: 'Canonical boss', text: '{{Infobox Monster|image=[[File:Boss.png]]}}' }; });
  assert.deepEqual(image, { url: 'thumbnail', width: 320, height: 180, source: 'https://oldschool.runescape.wiki/w/Canonical_boss', filePage: 'file-page' });
});

test('missing infobox and missing file use fallback without unrelated API requests', async () => {
  assert.equal(await resolveBossImage(Parser, 'Boss', () => assert.fail('No file to resolve'), async () => ({ text: '[[File:Logo.png]]' })), null);
  assert.equal(await resolveBossImage(Parser, 'Boss', async () => ({ query: { pages: [{ missing: true }] } }), async () => ({ text: '{{Infobox Monster|image=Gone.png}}' })), null);
});

const portrait = { url: 'portrait', width: 320, height: 240, source: 'article', filePage: 'file' };
function memory(initial = {}) {
  let value = JSON.stringify(initial);
  return { getItem: key => { assert.equal(key, IMAGE_STORAGE); return value; }, setItem: (key, next) => { assert.equal(key, IMAGE_STORAGE); value = next; } };
}

test('requests deduplicate normalized titles and remain fresh for seven days across reloads', async () => {
  let count = 0, time = 100;
  const storage = memory(), resolve = async () => { count++; return portrait; };
  const cache = createImageCache({ resolve, storage, now: () => time });
  const [a, b] = await Promise.all([cache.get('The_boss'), cache.get('The boss')]);
  assert.deepEqual(a, b); assert.equal(count, 1);
  time += 6 * 86400000;
  await createImageCache({ resolve, storage, now: () => time }).get('The boss');
  assert.equal(count, 1);
  time += 2 * 86400000;
  await cache.get('The boss');
  assert.equal(count, 2);
});

test('refresh failures retain stale images; missing and failed lookups do not loop', async () => {
  let count = 0;
  const stale = { ...portrait, fetchedAt: 1 };
  const cache = createImageCache({ storage: memory({ boss: stale }), now: () => 9 * 86400000, resolve: async () => { count++; throw Error('Offline'); } });
  assert.deepEqual(cache.peek('Boss'), stale);
  assert.deepEqual(await cache.get('Boss'), stale);
  assert.deepEqual(await cache.get('Boss'), stale);
  assert.equal(count, 1);
  assert.equal(await cache.get('Missing'), null);
  assert.equal(await cache.get('Missing'), null);
  assert.equal(count, 2);
});

test('at most four lookups run concurrently, even with queued duplicates', async () => {
  let active = 0, peak = 0, count = 0;
  const cache = createImageCache({ resolve: async () => {
    count++; peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--; return portrait;
  } });
  await Promise.all([...Array.from({ length: 12 }, (_, i) => cache.get(`Boss ${i}`)), cache.get('Boss 11')]);
  assert.equal(peak, 4); assert.equal(count, 12);
});

test('unavailable and malformed persistent storage never prevent image resolution', async () => {
  for (const storage of [{ getItem() { throw Error('Blocked'); }, setItem() { throw Error('Full'); } }, { getItem: () => 'null', setItem() {} }]) {
    const cache = createImageCache({ storage, resolve: async () => portrait });
    assert.equal((await cache.get('Boss')).url, portrait.url);
  }
});
