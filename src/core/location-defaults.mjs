import {chunkId, chunkOrigin, regionId, regionOrigin} from './coordinates.mjs';
import {encounterLocations} from './encounter.mjs';

export function entranceArenaFallback(boss, draft, arena) {
  if (encounterLocations(boss).entrance.length || !draft.regions.length) return null;
  const chunks=draft.chunks?.length ? [...draft.chunks] : draft.regions.length>1
    ? draft.regions.flatMap(id=>{const p=regionOrigin(id);return Array.from({length:64},(_,i)=>chunkId(p.x+(i%8)*8,p.y+Math.floor(i/8)*8));}).sort((a,b)=>a-b) : [];
  const regions=chunks.length ? [...new Set(chunks.map(id=>{const p=chunkOrigin(id);return regionId(p.x,p.y);} ))].sort((a,b)=>a-b) : [...draft.regions];
  if(!regions.length)return null;
  const region=arena&&regions.includes(arena.region)?arena.region:regions[0],p=regionOrigin(region);
  const location=arena&&arena.region===region ? {...arena} : {x:p.x+32,y:p.y+32,region,plane:0,mapId:null,role:'location',title:'Selected arena area',source:'',revision:null,verified:false};
  return {location:{...location,caption:'Defaults to the selected arena area'},coverage:{regions,chunks}};
}

export function hasAreaSelection(boss, draft, entrance) {
  return entrance ? draft.entranceRegion!==undefined || !!draft.entrance || boss.optionalArgs.some(a=>a.includes('RegionEntrance(')) : draft.regions.length>0 || !!draft.chunks?.length;
}

export function entranceNotificationDefault(boss, draft, fallback) {
  if (!fallback || draft.entranceNotifyChunks !== undefined || draft.entrance?.ids?.length) return null;
  const args = [...(boss.optionalArgs ?? []), ...(boss.entranceEntry?.optionalArgs ?? [])];
  if (args.some(arg => arg.includes('RegionEntrance('))) return null;
  if (draft.entranceRegion !== undefined && !fallback.coverage.regions.includes(draft.entranceRegion)) return null;
  return locationAreaChange(boss, draft, fallback.location, true, fallback.coverage);
}

export function locationAreaChange(boss, draft, location, entrance, coverage) {
  if(!entrance)return coverage?{regions:[...coverage.regions],chunks:[...coverage.chunks]}:null;
  if(location.notificationChunks)coverage={regions:[location.region],chunks:location.notificationChunks};
  const change={entranceRegion:coverage&&!coverage.regions.includes(location.region)?coverage.regions[0]:location.region,entrancePlane:location.plane??0};
  if(!coverage)return change;
  return {...change,entranceNotifyChunks:[...coverage.chunks]};
}
