import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeDraft, exportProblem, defaultDraft } from '../src/core/authoring.mjs';
import { chunkId, regionOrigin } from '../src/core/coordinates.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const draft = { id: 'BOSS_UI_TEST', name: 'UI test encounter', regions: [12682], deathType: 'UNSAFE', baseRaw: null, reviewed: true };
const entrance = { ids: ['58439'], objectType: 'GAME_OBJECT', overlay: 'DEPRIORITIZED_WITH_HIGHLIGHT', direction: '', plane: '', chunks: [], reviewed: true };

test('new and saved blank drafts default to Unsafe without overwriting explicit classifications', () => {
  assert.equal(defaultDraft({ ...draft, deathType: '' }).deathType, 'UNSAFE');
  assert.equal(defaultDraft({ ...draft, deathType: undefined }).deathType, 'UNSAFE');
  assert.equal(defaultDraft({ ...draft, deathType: 'UNSAFE_HCGIM' }).deathType, 'UNSAFE_HCGIM');
  assert.equal(defaultDraft({ ...draft, deathType: 'SAFE' }).deathType, 'SAFE');
});
test('coverage and entrances export without verification flags, including older unreviewed drafts', () => {
  for (const reviewed of [undefined, false, true]) {
    const current = { ...draft, reviewed, entrance: { ...entrance, reviewed } };
    assert.equal(exportProblem(snapshot, [current]), '');
    const changed = mergeDraft(current, { regions: [12683], entrancePlane: 1 });
    assert.equal(exportProblem(snapshot, [changed]), '');
  }
});
test('removing a region also removes its draft chunk restrictions', () => {
  const point = regionOrigin(12682), other = regionOrigin(12683);
  const kept = chunkId(point.x, point.y), removed = chunkId(other.x, other.y);
  const next = mergeDraft({ ...draft, regions: [12682, 12683], chunks: [kept, removed] }, { regions: [12682] });
  assert.deepEqual(next.chunks, [kept]);
  assert.deepEqual(mergeDraft({...draft,chunks:[-1]}, {regions:[12682]}).chunks, []);
});
test('one ready encounter can export independently of an unfinished draft', () => {
  const unfinished = { ...draft, id: 'BOSS_UI_UNFINISHED', regions: [] };
  assert.equal(exportProblem(snapshot, [draft]), '');
  assert.match(exportProblem(snapshot, [draft, unfinished]), /Select 1–256 regions/);
  assert.match(exportProblem(snapshot, []), /Choose at least one/);
});
test('review readiness uses export validation for invalid IDs and upstream conflicts', () => {
  assert.match(exportProblem(snapshot, [{ ...draft, entrance: { ...entrance, ids: ['bad-id'] } }]), /Invalid entrance ID/);
  assert.match(exportProblem(snapshot, [{ ...draft, baseRaw: 'stale source' }]), /Conflict/);
});
