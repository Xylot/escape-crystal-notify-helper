import {isDungeon} from './encounter-kind.mjs';
import { regionId,regionOrigin,chunkOrigin } from './coordinates.mjs';
import { splitArgs,maskJava } from './java.mjs';

export function originalEntranceChunks(optionalArgs=[]) {
  const entrance=optionalArgs.find(s=>maskJava(s).trim().startsWith('new EscapeCrystalNotifyRegionEntrance('));
  if(!entrance)return [];
  const args=splitArgs(entrance.slice(entrance.indexOf('(')+1,entrance.lastIndexOf(')')));
  const list=args.find(a=>/^List\.of\([\d,\s]*\)$/.test(a));
  return list?list.slice(list.indexOf('(')+1,-1).split(',').map(s=>Number(s.trim())).filter(Number.isInteger):[];
}
export function sameLocation(a,b){
  return a.region===b.region && (a.plane??0)===(b.plane??0) && (a.mapId===null||b.mapId===null||a.mapId===b.mapId);
}
// Maps feed their current view back into the editor. Preserve identity when
// that view has not changed, otherwise it becomes a render/effect feedback loop.
export function mergeEvidenceContext(context, kind, location) {
  if (JSON.stringify(context[kind]) === JSON.stringify(location)) return context;
  return {...context, [kind]:location};
}
export function encounterLocations(boss){
  const dedupe=locations=>locations.filter((m,i,all)=>all.findIndex(n=>n.x===m.x&&n.y===m.y&&n.plane===m.plane&&n.mapId===m.mapId)===i);
  const entrance=dedupe(boss.maps.filter(m=>m.role==='entrance'));
  const words=boss.name.toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3);
  // Prefer a boss-specific cave over a broad island/overworld map. Still a candidate.
  const score=m=>(m.role==='arena'?100:0)+words.filter(w=>m.title.toLowerCase().includes(w)).length*20+(/cave|lair|chamber|dungeon/i.test(m.title)?15:0);
  const arena=dedupe(boss.maps.filter(m=>m.role!=='entrance')).sort((a,b)=>score(b)-score(a));
  const pluginLocation=(x,y,role)=>({x,y,region:regionId(x,y),plane:null,mapId:null,role,caption:'Current plugin coverage',source:'https://github.com/Xylot/escape-crystal-notify',title:'Plugin source',revision:null,verified:false});
  if(!entrance.length)for(const id of originalEntranceChunks(boss.optionalArgs)){
    const p=chunkOrigin(id),next=pluginLocation(p.x+4,p.y+4,'entrance');
    if(!entrance.some(l=>sameLocation(l,next)))entrance.push(next);
  }
  if(!arena.length)for(const id of boss.regions){const p=regionOrigin(id);arena.push(pluginLocation(p.x+32,p.y+32,'location'));}
  return {arena,entrance,shared:!!arena[0]&&!!entrance[0]&&sameLocation(arena[0],entrance[0])};
}
export function suggestedArenaRegions(boss){
 if(boss.raw||boss.regions.length)return [...boss.regions];
 if(isDungeon(boss)||boss.supportedBy?.length)return [];
 const {arena}=encounterLocations(boss);
 const words=boss.name.toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3);
 const confident=arena.filter(m=>m.role==='arena'||(/cave|lair|chamber|dungeon/i.test(m.title)&&words.some(w=>m.title.toLowerCase().includes(w))));
 const ids=[...new Set(confident.map(m=>m.region))];
 return ids.length===1?ids:[];
}
