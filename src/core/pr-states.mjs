import {editingBaseline} from './editing.mjs';
import {expandEncounter, hasEntrancePolicy, encounterCoverage} from './encounter-export.mjs';
import {originalEntranceChunks} from './encounter.mjs';
import {regionOrigin} from './coordinates.mjs';
import {evidencePlan, regionGroups} from './pr-evidence.mjs';
import {isNotifyRegion} from './java.mjs';

// Read the complete generated entry, including settings omitted by sparse edits.
export function reviewState(raw) {
  const baseline=editingBaseline(raw),entry=baseline.entry;
  return {id:entry.id,name:entry.name,regionType:entry.regionType,deathType:entry.deathType,notifyRegion:isNotifyRegion(entry),
    ...(baseline.draft.bossInstanced?{bossInstanced:true,entranceDangerous:false,arenaRegions:entry.regions,entranceRegions:entry.regions,entranceNotifyChunks:[]}:{}),
    regions:entry.regions,chunks:baseline.chunks??[],entrance:baseline.entrance.value,
    entranceRaw:baseline.entrance.raw,entranceChunks:baseline.entrance.value?.chunks??originalEntranceChunks(entry.optionalArgs),
    extraSettings:entry.optionalArgs.filter(arg=>arg!==baseline.entrance.raw&&!/^List\.of\([\d,\s]*\)$/.test(arg)&&!['null','true','false'].includes(arg))};
}

export function proposalStates(changes) {
  return Object.fromEntries(changes.map(change=>{
    let before=null;
    try {before=change.baseRaw?combinedState([change.baseRaw,...(change.entranceBaseRaw?[change.entranceBaseRaw]:[])]):null;}
    catch {throw new Error(`Conflict: ${change.id} has an invalid original entry. Refresh the plugin source.`);}
    const after=combinedState(expandEncounter(change).map(e=>e.raw));
    if(change.metadataBase){if(before)Object.assign(before,change.metadataBase);Object.assign(after,{recommendedSeconds:change.recommendedSeconds,petIcon:change.petIcon});}
    if(hasEntrancePolicy(change)&&after.entranceRaw) {
      after.arenaRegions=[...change.regions];
      after.entranceDangerous=change.entranceDangerous??after.entranceDangerous??after.notifyRegion;
      after.entranceRegions=encounterCoverage(change).entranceRegions;
      after.entranceNotifyChunks=change.entranceNotifyChunks??after.entranceNotifyChunks??[];
    }
    return [change.id,{before,after}];
  }));
}

function combinedState(raws) {
  const state=reviewState(raws[0]);
  if(raws.length>1) {
    const entranceEntry=reviewState(raws[1]);
    Object.assign(state,{entranceEntry,entrance:entranceEntry.entrance,entranceRaw:entranceEntry.entranceRaw,
      entranceChunks:entranceEntry.entranceChunks,entranceRegions:entranceEntry.regions,
      entranceNotifyChunks:entranceEntry.chunks,entranceDangerous:entranceEntry.notifyRegion});
  }
  return state;
}

export function stateDifferences(before,after) {
  const added=[],removed=[];
  const scalar=(label,a,b)=>{if(a!==b){if(a!=null)removed.push(`${label}: ${a}`);if(b!=null)added.push(`${label}: ${b}`);}};
  const list=(label,a=[],b=[])=>{const plus=b.filter(v=>!a.includes(v)),minus=a.filter(v=>!b.includes(v));if(plus.length)added.push(`${label}: ${plus.join(', ')}`);if(minus.length)removed.push(`${label}: ${minus.join(', ')}`);};
  scalar('Display name',before.name,after.name);
  scalar('Death classification',before.deathType,after.deathType);
  scalar('Recommended inactivity time (seconds)',before.recommendedSeconds,after.recommendedSeconds);
  scalar('Pet icon',before.petIcon,after.petIcon);
  list('Regions',before.regions,after.regions);
  list('Coverage chunks',before.chunks,after.chunks);
  list('Entrance regions',before.entranceRegions,after.entranceRegions);
  list('Entrance notification chunks',before.entranceNotifyChunks,after.entranceNotifyChunks);
  scalar('Entrance area dangerous',before.entranceDangerous,after.entranceDangerous);
  scalar('Boss fight instanced',before.bossInstanced??false,after.bossInstanced??false);
  scalar('Coverage mode',before.chunks.length?'Selected chunks':'Whole regions',after.chunks.length?'Selected chunks':'Whole regions');
  if((before.entrance||!before.entranceRaw)&&(after.entrance||!after.entranceRaw)) {
    scalar('Entrance',before.entrance?'Configured':null,after.entrance?'Configured':null);
    for(const [key,label] of [['overlay','Entrance priority'],['direction','Entrance direction'],['plane','Entrance plane'],['objectType','Entrance object type']])
      scalar(label,before.entrance?before.entrance[key]||'default':null,after.entrance?after.entrance[key]||'default':null);
    list('Entrance IDs',before.entrance?.ids,after.entrance?.ids);
    list('Entrance chunks',before.entrance?.chunks,after.entrance?.chunks);
  } else scalar('Entrance configuration',before.entranceRaw,after.entranceRaw);
  list('Additional settings',before.extraSettings,after.extraSettings);
  return {added,removed};
}

export function comparisonEvidence(changes,states,contexts,sources) {
  const result={panels:[],contexts:{},sources:{}};
  for(const change of changes) {
    const pair=states[change.id],supplied=contexts?.[change.id]??{};
    for(const phase of pair.before?['before','after']:['after']) {
      const state=pair[phase];
      const arena=supplied.arena;
      const entranceRegion=state.entranceRegions?.[0]??state.regions[0];
      const fallback=regionOrigin(entranceRegion);
      const entrance=supplied.entrance??{...arena,x:fallback.x+32,y:fallback.y+32,region:entranceRegion};
      const plane={GROUND:0,FIRST_FLOOR:1,SECOND_FLOOR:2}[state.entrance?.plane];
      const entranceContext={...entrance,...(plane===undefined?{}:{plane})};
      const c={...state,regions:state.arenaRegions??state.regions,entrance:state.entranceRaw?{chunks:state.entranceChunks}:undefined};
      const plan=evidencePlan([pair.before||hasEntrancePolicy(change)?c:change],{[c.id]:{arena,entrance:entranceContext}},sources);
      // Unrestricted entrance detection applies throughout the entry's coverage.
      // A selected preview location must not narrow the before/after evidence.
      if(pair.before&&state.entranceRaw&&!state.entranceChunks.length) {
        const sample=plan.panels.find(p=>p.kind==='entrance');
        plan.panels=plan.panels.filter(p=>p.kind!=='entrance');
        for(const [index,group] of regionGroups(state.entranceRegions??state.regions).entries()) {
          const xs=group.map(id=>id>>8),ys=group.map(id=>id&255);
          plan.panels.push({...sample,id:`${c.id}-entrance-${index+1}`,regions:group,minX:Math.min(...xs),maxY:Math.max(...ys),columns:Math.max(...xs)-Math.min(...xs)+1,rows:Math.max(...ys)-Math.min(...ys)+1});
        }
      }
      if(state.entranceRegions?.length) {
        const notification=evidencePlan([{...c,regions:state.entranceRegions,chunks:state.entranceNotifyChunks??[],entrance:undefined}],{[c.id]:{arena:entranceContext}},sources);
        plan.panels=plan.panels.filter(p=>p.kind!=='entrance');
        plan.panels.push(...notification.panels.map(p=>({...p,id:p.id.replace('-arena-','-notification-'),kind:'notification',detectionChunks:state.entranceChunks??[],label:state.bossInstanced?'Entrance (outside instance)':state.entranceDangerous===false?'Entrance coverage (region notifications disabled)':'Entrance notification coverage'})));
        plan.panels=plan.panels.map(p=>p.kind==='entrance'?{...p,label:'Entrance object detection'}:p);
      }
      if(state.bossInstanced)plan.panels=plan.panels.map(p=>p.kind==='arena'?{...p,label:'Arena coverage (inside instance only)'}:p);
      result.panels.push(...plan.panels.map(p=>pair.before?{...p,id:p.id.replace(`${c.id}-`,`${c.id}-${phase}-`),state:phase}:p));
      result.contexts[c.id]={...result.contexts[c.id],[phase]:plan.contexts[c.id]};
      result.sources[c.id]=[...new Set([...(result.sources[c.id]??[]),...plan.sources[c.id]])].sort();
    }
  }
  if(result.panels.length>32)throw new Error('This selection needs more than 32 screenshots. Split it into smaller PRs.');
  return result;
}
