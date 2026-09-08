import test from 'node:test';
import assert from 'node:assert/strict';
import { discardEncounter } from '../src/core/draft-workspace.mjs';

test('discard removes saved manual maps that could seed the next draft', () => {
  const before = {
    drafts: { BOSS_FIRST: { id: 'BOSS_FIRST' }, BOSS_OTHER: { id: 'BOSS_OTHER' } },
    evidenceContexts: {
      BOSS_FIRST: { arena: { region: 12851 }, entrance: { region: 12582, source: 'Manual coordinates' } },
      BOSS_OTHER: { entrance: { region: 12582 } },
    },
  };
  const discarded = discardEncounter(before, 'BOSS_FIRST');
  assert.equal(discarded.drafts.BOSS_FIRST, undefined);
  assert.equal(discarded.evidenceContexts.BOSS_FIRST, undefined);
  assert.deepEqual(discarded.drafts.BOSS_OTHER, before.drafts.BOSS_OTHER);
  assert.deepEqual(discarded.evidenceContexts.BOSS_OTHER, before.evidenceContexts.BOSS_OTHER);
  // History keeps an intact revision, including the corresponding map selection.
  assert.equal(before.drafts.BOSS_FIRST.id, 'BOSS_FIRST');
  assert.equal(before.evidenceContexts.BOSS_FIRST.entrance.region, 12582);
  assert.deepEqual(JSON.parse(JSON.stringify(discarded)), discarded);
});

test('discard retains the independent entrance image preference, including no image', () => {
  for (const entranceImage of ['chosen-image', null]) {
    const discarded = discardEncounter({ drafts: {}, evidenceContexts: {
      BOSS_FIRST: { arena: { region: 12851 }, entrance: { region: 12582 }, entranceImage },
    } }, 'BOSS_FIRST');
    assert.deepEqual(discarded.evidenceContexts.BOSS_FIRST, { entranceImage });
  }
});
