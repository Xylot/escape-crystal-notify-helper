import {chunkId,regionId} from './coordinates.mjs';

export function suggestedEntranceChange(draft, location, config) {
  if(typeof draft.entranceDangerous!=='boolean')throw new Error('Choose whether the entrance area is dangerous.');
  const objects=location.entranceObjects??[];
  if(!objects.length)throw new Error('Choose a suggestion with entrance objects.');
  const placements={};
  for(const object of objects){
    if(regionId(object.x,object.y)!==location.region)throw new Error('The suggested objects must be in the selected entrance region.');
    (placements[object.id]??=[]).push(object);
  }
  const area={entranceRegion:location.region,entrancePlane:location.plane??0,entranceNotifyChunks:[...(location.notificationChunks??[])]};
  // Choosing a suggestion replaces the old object selection and its provenance.
  const selection=selectEntranceIds({...draft,...area},{...config,objectChunks:{}},Object.keys(placements),'GAME_OBJECT',placements);
  return {...area,...selection};
}

// Coordinates belong to a placed object, including any of its transformed IDs.
// Keep this provenance in drafts so removing an ID also removes its auto chunks.
export function selectEntranceIds(draft, config, ids, objectType, placements = {}) {
  const sameType = config.objectType === objectType;
  const objectChunks = Object.fromEntries(ids.filter(id => sameType && config.objectChunks?.[id]).map(id => [id, config.objectChunks[id]]));
  for (const [id, points] of Object.entries(placements)) {
    if (ids.includes(id)) objectChunks[id] = [...new Set([...(objectChunks[id]??[]),...points.map(p => chunkId(p.x, p.y))])];
  }
  const knownChunks = Object.values(objectChunks).flat();
  const allLocated = ids.every(id => objectChunks[id]?.length);
  const fallback = sameType && config.chunks.length ? config.chunks : draft.entranceNotifyChunks ?? [];
  const chunks = [...new Set([...(!allLocated ? fallback : []), ...knownChunks])].sort((a,b)=>a-b);
  const entrance = {...config, ids, objectType, chunks, objectChunks};
  const change = {entrance};
  // Whole-area notifications need no restriction. Otherwise include the chosen
  // object's chunk without making the author return to the map.
  if (draft.entranceNotifyChunks?.length) {
    change.entranceNotifyChunks = [...new Set([...(draft.entranceNotifyChunks ?? []), ...chunks])].sort((a,b)=>a-b);
  }
  return change;
}
