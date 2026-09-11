import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJava,isNotifyRegion} from '../src/core/java.mjs';
import {buildLibrary} from '../src/core/library.mjs';
import {existingDraft,editableDraft,applySection,changedSections,sectionUnchanged,readEntrance} from '../src/core/editing.mjs';
import {expandEncounter,generateEncounter,sourceEntry} from '../src/core/encounter-export.mjs';
import {proposalDraft} from '../src/core/fresh-edit.mjs';
import {cleanChanges} from '../src/core/pr-evidence.mjs';
import {proposalStates,stateDifferences} from '../src/core/pr-states.mjs';
import {applyProposal,validateProposal,PLUGIN_REPO} from '../src/core/proposal.mjs';
import {entranceOverlay,mergeDraft,exportProblem} from '../src/core/authoring.mjs';
import {chunkOrigin,regionId} from '../src/core/coordinates.mjs';

// Exercise the same model functions called by App and EncounterEditor. This is
// an offline integration test, not a browser click or visual-layout test.
// An explicit path must exist: never silently fall back to an older snapshot.
const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url),'utf8'));
const source=process.env.PLUGIN_REGION_SOURCE
  ? readFileSync(process.env.PLUGIN_REGION_SOURCE,'utf8') : snapshot.source;
const entries=parseJava(source).entries;
const bosses=entries.filter(entry=>entry.regionType==='BOSSES');
const byId=new Map(entries.map(entry=>[entry.id,entry]));
// Maintainer-confirmed source mistakes, not blanket permission for the generator
// to add regions. Only these exact source region lists may be corrected.
const confirmedCoverage=[
  {id:'BOSS_BRYOPHYTA',original:[12955],missing:12698},
  {id:'BOSS_MAGGOT_KING',original:[11645],missing:10618},
];
const corrections=new Map();
for(const known of confirmedCoverage) {
  const entry=byId.get(known.id);
  if(!entry||JSON.stringify(entry.regions)!==JSON.stringify(known.original))continue;
  const entrance=readEntrance(entry.optionalArgs);
  const entranceRegions=entrance.value?.chunks.map(id=>{const point=chunkOrigin(id);return regionId(point.x,point.y);})??[];
  assert.ok(entranceRegions.includes(known.missing),`${known.id}: confirmed correction no longer matches entrance chunks; review the source`);
  const regions=[...entry.regions,known.missing].sort((a,b)=>a-b);
  const raw=entry.raw.slice(0,entry.raw.lastIndexOf(',')+1)+` ${regions.join(', ')})`;
  corrections.set(entry.id,{...entry,regions,raw});
}
const expectedById=new Map(entries.map(entry=>[entry.id,corrections.get(entry.id)??entry]));
const library=buildLibrary([...snapshot.candidates,...(snapshot.dungeons??[])],[],entries,{})
  .filter(row=>row.raw&&row.regionType==='BOSSES');
const visibleIds=new Set(library.flatMap(row=>[row.id,...(row.entranceEntry?[row.entranceEntry.id]:[])]));
// Source entries excluded from discovery must still be checked; no boss skips.
const rows=[...library,...bosses.filter(entry=>!visibleIds.has(entry.id))];
const reload=value=>JSON.parse(JSON.stringify(value));
const proposal=changes=>({version:2,repository:PLUGIN_REPO,baseCommit:'0'.repeat(40),changes});
const expectedFor=row=>[expectedById.get(row.id),...(row.entranceEntry?[expectedById.get(row.entranceEntry.id)]:[])];
const sourceWith=expected=>expected.reduce((result,entry)=>result.replace(byId.get(entry.id).raw,entry.raw),source);
const definition=raw=>{const {raw:original,start,end,...fields}=sourceEntry(raw);return fields;};

function assertExport(row,draft,phase) {
  const expected=expectedFor(row);
  const exported=proposalDraft(reload(draft));
  const expanded=expandEncounter(exported);
  assert.deepEqual(expanded.map(entry=>entry.id),expected.map(entry=>entry.id),`${phase}: entry membership`);
  for(const entry of expanded)assert.equal(entry.raw,expectedById.get(entry.id).raw,`${phase}: ${entry.id} unexpected Java difference`);
  assert.equal(generateEncounter(exported),expected.map(entry=>entry.raw).join(',\n'),`${phase}: preview`);
  const json=reload(proposal(cleanChanges([exported])));
  validateProposal(json);
  assert.equal(exportProblem({source,baseCommit:json.baseCommit},json.changes),'',`${phase}: UI blocks export`);
  assert.equal(applyProposal(source,json),sourceWith(expected),`${phase}: unexpected proposal difference`);
  const {before,after}=proposalStates(json.changes)[row.id];
  const missing=expectedById.get(row.id).regions.filter(region=>!byId.get(row.id).regions.includes(region));
  assert.deepEqual(stateDifferences(before,after),{added:missing.length?[`Regions: ${missing.join(', ')}`]:[],removed:[]},`${phase}: unexpected PR difference`);
}

test('boss round-trip inventory covers every current Java boss exactly once',t=>{
  assert.ok(bosses.length>0,'The source must contain bosses');
  const covered=rows.flatMap(row=>expectedFor(row).map(entry=>entry.id));
  assert.equal(new Set(covered).size,covered.length,'A source entry is tested more than once');
  assert.deepEqual([...covered].sort(),bosses.map(entry=>entry.id).sort());
  if(!process.env.PLUGIN_REGION_SOURCE) {
    assert.deepEqual(snapshot.entries.filter(entry=>entry.regionType==='BOSSES').map(entry=>entry.id).sort(),bosses.map(entry=>entry.id).sort(),'UI snapshot boss inventory differs from its Java source');
    for(const entry of snapshot.entries.filter(entry=>entry.regionType==='BOSSES')) {
      const {id,name,regionType,deathType,regions,optionalArgs}=entry;
      assert.deepEqual({id,name,regionType,deathType,regions,optionalArgs},definition(byId.get(id).raw),`${id}: UI snapshot differs from its Java source`);
    }
  }
  t.diagnostic(`${bosses.length} Java boss entries; ${library.length} library encounters; ${library.filter(row=>row.entranceEntry).length} entrance pairs; ${rows.length-library.length} source-only entries. Source: ${process.env.PLUGIN_REGION_SOURCE??'public/data/snapshot.json'}`);
  t.diagnostic(`${corrections.size} confirmed SOURCE COVERAGE DISCREPANCIES (expected corrections, not helper regressions).`);
  for(const [id,expected] of corrections)t.diagnostic(`SOURCE COVERAGE DISCREPANCY — ${id}: source regions [${byId.get(id).regions.join(', ')}]; expected generated regions [${expected.regions.join(', ')}]. Entrance chunks require the added region; maintainer confirmed the source is wrong.`);
  for(const entry of bosses) {
    const entrance=readEntrance(entry.optionalArgs);
    if(entrance.raw&&!entrance.value)t.diagnostic(`PRESERVED ONLY — ${entry.id}: UI cannot fully author this entrance. Source constructor: ${entrance.raw}`);
  }
});

for(const row of rows)test(`boss UI round trip: ${row.id}`,()=>{
  const original=existingDraft(row),saved=reload(original);
  assert.deepEqual(changedSections(saved),[],'Loading marks the draft changed');
  assertExport(row,saved,'load and browser-storage reload');

  for(const order of [['details','coverage','entrance'],['entrance','coverage','details']]) {
    let draft=reload(saved);
    for(const section of order) {
      const working=editableDraft(draft);
      assert.equal(sectionUnchanged(draft,working,section),true,`${section}: untouched form is dirty`);
      draft=reload(applySection(draft,working,section));
      assert.deepEqual(changedSections(draft),[],`${section}: applying unchanged fields is dirty`);
      assertExport(row,draft,`apply ${order.join(' → ')} / ${section}`);
    }
  }

  // A real edit must affect only its field plus confirmed coverage corrections.
  // Restoring it must retain those corrections and all source entrance options.
  const renamed=applySection(saved,{...editableDraft(saved),name:`${saved.name} edited`},'details');
  assert.deepEqual(changedSections(renamed),['details']);
  const changed=parseJava(applyProposal(source,proposal(cleanChanges([renamed])))).entries;
  for(const entry of changed) {
    const originalEntry=entry.id===row.id?expectedById.get(entry.id):byId.get(entry.id);
    if(entry.id===row.id) {
      assert.equal(entry.name,renamed.name);
      assert.deepEqual(entry.regions,originalEntry.regions,'Renaming changed region coverage');
      assert.deepEqual(entry.optionalArgs,originalEntry.optionalArgs,'Renaming changed constructor options');
      assert.equal(entry.deathType,originalEntry.deathType);
    } else assert.equal(entry.raw,originalEntry.raw,`Renaming changed ${entry.id}`);
  }
  const restored=applySection(renamed,{...editableDraft(renamed),name:saved.name},'details');
  assertExport(row,restored,'edit then restore');

  const entranceSource=row.entranceEntry??row;
  if(entranceSource.optionalArgs.some(arg=>/EscapeCrystalNotifyRegionEntranceOverlayType\.(PRIORITIZED_WITH_HIGHLIGHT|DEPRIORITIZED_WITH_HIGHLIGHT)/.test(arg))) {
    const originalOverlay=entranceOverlay(saved);
    const alternate=originalOverlay==='PRIORITIZED_WITH_HIGHLIGHT'?'DEPRIORITIZED_WITH_HIGHLIGHT':'PRIORITIZED_WITH_HIGHLIGHT';
    const changed=applySection(saved,mergeDraft(editableDraft(saved),{entranceOverlay:alternate}),'entrance');
    assert.deepEqual(changedSections(changed),['entrance']);
    const generated=expandEncounter(changed).find(entry=>entry.id===entranceSource.id);
    assert.deepEqual(definition(generated.raw),definition(expectedById.get(entranceSource.id).raw.replace(originalOverlay,alternate)),'Priority edit changed more than its overlay and confirmed coverage');
    const restored=applySection(changed,mergeDraft(editableDraft(changed),{entranceOverlay:originalOverlay}),'entrance');
    assertExport(row,restored,'change entrance priority then restore');
  }
  if(row.entranceEntry) {
    const changed=applySection(saved,{...editableDraft(saved),entranceDangerous:!saved.entranceDangerous},'entrance');
    const generated=parseJava(`enum EscapeCrystalNotifyRegion { ${generateEncounter(changed)}; }`).entries;
    assert.equal(isNotifyRegion(generated.find(entry=>entry.id===row.entranceEntry.id)),!saved.entranceDangerous,'Danger answer did not change the Java flag');
    const restored=applySection(changed,{...editableDraft(changed),entranceDangerous:saved.entranceDangerous},'entrance');
    assertExport(row,restored,'change entrance danger then restore');
  }
  assert.deepEqual(saved,original,'UI hydration mutated the saved draft');
});

test('all current bosses export together with only confirmed source coverage corrections',()=>{
  // Keep each batch inside the proposal limit if the catalog grows past 100.
  let result=source;
  for(let start=0;start<rows.length;start+=100) {
    const changes=rows.slice(start,start+100).map(row=>proposalDraft(reload(existingDraft(row))));
    result=applyProposal(result,reload(proposal(cleanChanges(changes))));
  }
  assert.equal(result,sourceWith([...expectedById.values()]));
});
