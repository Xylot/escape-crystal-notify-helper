import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeDraft, exportProblem } from '../src/core/authoring.mjs';
import { chunkId, regionOrigin } from '../src/core/coordinates.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/snapshot.json', import.meta.url)));
const draft = { id: 'BOSS_UI_TEST', name: 'UI test encounter', regions: [12682], deathType: 'UNSAFE', baseRaw: null, reviewed: true };
const entrance = { ids: ['58439'], objectType: 'GAME_OBJECT', overlay: 'DEPRIORITIZED_WITH_HIGHLIGHT', direction: '', plane: '', chunks: [], reviewed: true };

test('coverage and entrance reviews can be completed in either order', () => {
  const coverageFirst = mergeDraft(draft, { entrance });
  assert.equal(coverageFirst.reviewed, true);
  assert.equal(coverageFirst.entrance.reviewed, true);
  const entranceFirst = mergeDraft({ ...draft, reviewed: false, entrance }, { reviewed: true });
  assert.equal(entranceFirst.entrance.reviewed, true);
  assert.equal(exportProblem(snapshot, [coverageFirst]), '');
});
test('coverage changes reset only coverage review; entrance context resets entrance review', () => {
  const changed = mergeDraft({ ...draft, entrance }, { regions: [12683] });
  assert.equal(changed.reviewed, false);
  assert.equal(changed.entrance.reviewed, true);
  const moved = mergeDraft({ ...draft, entrance, entranceRegion: 12582 }, { entranceRegion: 12583 });
  assert.equal(moved.reviewed, true);
  assert.equal(moved.entrance.reviewed, false);
  assert.equal(mergeDraft(draft, { regions: [12682] }).reviewed, true);
  assert.equal(mergeDraft({ ...draft, entrance, entrancePlane: 0 }, { entrancePlane: 1 }).entrance.reviewed, false);
});
test('removing a region also removes its draft chunk restrictions', () => {
  const point = regionOrigin(12682), other = regionOrigin(12683);
  const kept = chunkId(point.x, point.y), removed = chunkId(other.x, other.y);
  const next = mergeDraft({ ...draft, regions: [12682, 12683], chunks: [kept, removed] }, { regions: [12682] });
  assert.deepEqual(next.chunks, [kept]);
  assert.equal(next.reviewed, false);
  assert.deepEqual(mergeDraft({...draft,chunks:[-1]}, {regions:[12682]}).chunks, []);
});
test('one ready encounter can export independently of an unfinished draft', () => {
  const unfinished = { ...draft, id: 'BOSS_UI_UNFINISHED', reviewed: false };
  assert.equal(exportProblem(snapshot, [draft]), '');
  assert.match(exportProblem(snapshot, [draft, unfinished]), /Review coverage/);
  assert.match(exportProblem(snapshot, []), /Choose at least one/);
});
test('review readiness uses export validation for invalid IDs and upstream conflicts', () => {
  assert.match(exportProblem(snapshot, [{ ...draft, entrance: { ...entrance, ids: ['bad-id'] } }]), /Invalid entrance ID/);
  assert.match(exportProblem(snapshot, [{ ...draft, baseRaw: 'stale source' }]), /Conflict/);
});
