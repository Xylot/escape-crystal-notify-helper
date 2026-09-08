import { bossKey,supportFor } from './catalog.mjs';
import {isDungeon} from './encounter-kind.mjs';
import {DUNGEON_ALIASES} from './dungeons.mjs';
const EXCLUDED_ENCOUNTERS=new Map([
  ...['Callisto','Chaos Elemental','Chaos Fanatic','Scorpia','Venenatis',"Vet'ion",'Revenant maledictus'].map(name=>[bossKey(name),'Beyond the Escape Crystal’s Wilderness level limit.']),
  ...['Gemstone Crab','Tempoross'].map(name=>[bossKey(name),'This encounter is not dangerous.']),
  [bossKey("Phosani's Nightmare"),'Already covered by existing plugin support.'],
]);
export function encounterExclusion(boss){
  return [boss.name,boss.wikiTitle,boss.id?.replace(/^BOSS_/,'')].filter(Boolean).map(name=>EXCLUDED_ENCOUNTERS.get(bossKey(name))).find(Boolean)??null;
}
export function buildLibrary(candidates,imports,entries,drafts){
  return createLibraryResolver(candidates,imports,entries)(drafts);
}

// Support matching depends on source/catalog data, not on authoring controls.
export function createLibraryResolver(candidates,imports,entries){
  const input=new Map(candidates.map(b=>[b.id,b]));
  imports.forEach(b=>input.set(b.id,{...input.get(b.id),...b}));
  const merged=new Map();
  for(const b of input.values()){
    const support=isDungeon(b)?entries.filter(e=>bossKey(DUNGEON_ALIASES[e.id]??e.wikiTitle??e.name)===bossKey(b.wikiTitle)||bossKey(e.name)===bossKey(b.name)):supportFor(b,entries);
    const direct=support.find(e=>(!isDungeon(b)||e.regionType==='DUNGEONS')&&(bossKey(e.name)===bossKey(b.name)||bossKey(DUNGEON_ALIASES[e.id]??e.wikiTitle??e.name)===bossKey(b.wikiTitle)));
    const row={...b,...(direct??{}),wikiTitle:b.wikiTitle,maps:b.maps??[],links:b.links??[],warnings:b.warnings??[],categories:b.categories,locationTitles:b.locationTitles,supportKnown:entries.length>0,supportedBy:support.map(e=>({id:e.id,name:e.name}))};
    merged.set(row.id,row);
  }
  for(const entry of entries.filter(e=>['BOSSES','DUNGEONS'].includes(e.regionType)))if(!merged.has(entry.id))merged.set(entry.id,{...entry,maps:[],links:[],warnings:[],wikiTitle:DUNGEON_ALIASES[entry.id]??entry.wikiTitle??entry.name,...(isDungeon(entry)?{categories:['Dungeons']}:{}),supportedBy:[{id:entry.id,name:entry.name}],supportKnown:true});
  const catalog=merged;
  const entrances=new Map(entries.filter(e=>e.regionType==='BOSSES'&&e.optionalArgs?.some(a=>a.includes('EscapeCrystalNotifyRegionEntrance('))).map(e=>[e.id,e]));
  return drafts=>{
  const merged=new Map(catalog);
  for(const draft of Object.values(drafts))if(!merged.has(draft.id))merged.set(draft.id,{...draft,raw:draft.baseRaw,optionalArgs:[],maps:[],links:[],warnings:['Not present in the current catalog. Review source changes.'],wikiTitle:draft.name,...(isDungeon(draft)?{categories:['Dungeons']}:{}),supportedBy:[],supportKnown:entries.length>0});
  const pairedIds=new Set();
  for(const boss of merged.values()) {
    if(!boss.id.startsWith('BOSS_')||boss.id.endsWith('_ENTRANCE'))continue;
    const entrance=entrances.get(`${boss.id}_ENTRANCE`);
    // Keep independently saved legacy entrance drafts reachable until exported or discarded.
    if(entrance&&boss.raw&&!drafts[entrance.id]&&(!drafts[boss.id]||drafts[boss.id].entranceBaseRaw!==undefined)) {
      merged.set(boss.id,{...boss,entranceEntry:entrance});pairedIds.add(entrance.id);
    }
  }
  return [...merged.values()].filter(b=>!pairedIds.has(b.id)&&!encounterExclusion(b)).sort((a,b)=>a.name.localeCompare(b.name));
  };
}
