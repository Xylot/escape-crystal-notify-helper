import { bossKey,supportFor } from './catalog.mjs';
const EXCLUDED_ENCOUNTERS=new Map([
  ...['Callisto','Chaos Elemental','Chaos Fanatic','Scorpia','Venenatis',"Vet'ion",'Revenant maledictus'].map(name=>[bossKey(name),'Beyond the Escape Crystal’s Wilderness level limit.']),
  ...['Gemstone Crab','Tempoross'].map(name=>[bossKey(name),'This encounter is not dangerous.']),
  [bossKey("Phosani's Nightmare"),'Already covered by existing plugin support.'],
]);
export function encounterExclusion(boss){
  return [boss.name,boss.wikiTitle,boss.id?.replace(/^BOSS_/,'')].filter(Boolean).map(name=>EXCLUDED_ENCOUNTERS.get(bossKey(name))).find(Boolean)??null;
}
export function buildLibrary(candidates,imports,entries,drafts){
  const input=new Map(candidates.map(b=>[b.id,b]));
  imports.forEach(b=>input.set(b.id,{...input.get(b.id),...b}));
  const merged=new Map();
  for(const b of input.values()){
    const support=supportFor(b,entries);
    const direct=support.find(e=>bossKey(e.name)===bossKey(b.name)||bossKey(e.wikiTitle??e.name)===bossKey(b.wikiTitle));
    const row={...b,...(direct??{}),wikiTitle:b.wikiTitle,maps:b.maps??[],links:b.links??[],warnings:b.warnings??[],categories:b.categories,locationTitles:b.locationTitles,supportKnown:entries.length>0,supportedBy:support.map(e=>({id:e.id,name:e.name}))};
    merged.set(row.id,row);
  }
  for(const entry of entries.filter(e=>e.regionType==='BOSSES'))if(!merged.has(entry.id))merged.set(entry.id,{...entry,maps:[],links:[],warnings:[],wikiTitle:entry.wikiTitle??entry.name,supportedBy:[{id:entry.id,name:entry.name}],supportKnown:true});
  for(const draft of Object.values(drafts))if(!merged.has(draft.id))merged.set(draft.id,{...draft,raw:draft.baseRaw,optionalArgs:[],maps:[],links:[],warnings:['Not present in the current catalog. Review source changes.'],wikiTitle:draft.name,supportedBy:[],supportKnown:entries.length>0});
  return [...merged.values()].filter(b=>!encounterExclusion(b)).sort((a,b)=>a.name.localeCompare(b.name));
}
