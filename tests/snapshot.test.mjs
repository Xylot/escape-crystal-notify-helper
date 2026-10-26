import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSnapshots,pluginFetchedAt,wikiFetchedAt} from '../src/core/snapshot.mjs';
const snapshot=(plugin,wiki,name)=>({version:1,generatedAt:plugin,pluginFetchedAt:plugin,wikiFetchedAt:wiki,baseCommit:name,source:name,entries:[name],metadataSources:{name},candidates:[name],dungeons:[name],catalog:{fetchedAt:wiki},warnings:[]});
const early='2026-10-20T00:00:00Z',middle='2026-10-23T00:00:00Z',late='2026-10-26T00:00:00Z';

test('newer local plugin cannot hide newly published wiki encounters',()=>{
  const published=snapshot(middle,middle,'published'),saved=snapshot(late,early,'saved');
  const merged=mergeSnapshots(published,saved);
  assert.equal(merged.source,'saved');assert.equal(merged.metadataSources,saved.metadataSources);
  assert.equal(merged.candidates,published.candidates);assert.equal(merged.dungeons,published.dungeons);
  assert.equal(pluginFetchedAt(merged),late);assert.equal(wikiFetchedAt(merged),middle);
});
test('newer local wiki cannot retain older plugin code',()=>{
  const published=snapshot(middle,middle,'published'),saved=snapshot(early,late,'saved');
  const merged=mergeSnapshots(published,saved);
  assert.equal(merged.source,'published');assert.equal(merged.candidates,saved.candidates);
});
test('legacy snapshots date wiki data from its catalog, not a later plugin sync',()=>{
  const published=snapshot(middle,middle,'published'),saved=snapshot(late,early,'saved');
  delete saved.pluginFetchedAt;delete saved.wikiFetchedAt;
  const merged=mergeSnapshots(published,saved);
  assert.equal(merged.baseCommit,'saved');assert.equal(merged.catalog,published.catalog);
  assert.equal(merged.generatedAt,published.generatedAt);
});
test('missing and invalid legacy dates cannot replace published data',()=>{
  const published=snapshot(middle,middle,'published'),saved=snapshot('invalid','invalid','saved');
  assert.equal(mergeSnapshots(published,saved).source,'published');
  delete saved.catalog;assert.equal(mergeSnapshots(published,saved).candidates,published.candidates);
  assert.equal(mergeSnapshots(published),published);
});
