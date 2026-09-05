import { bossKey,supportFor } from './catalog.mjs';
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
  return [...merged.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
