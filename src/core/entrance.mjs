import { integer } from './coordinates.mjs';
export const OVERLAYS=['PRIORITIZED_WITH_HIGHLIGHT','DEPRIORITIZED_WITH_HIGHLIGHT'];
export const DIRECTIONS=['','NORTHWARD','SOUTHWARD','EASTWARD','WESTWARD','NORTHWARD_INCLUSIVE','SOUTHWARD_INCLUSIVE','EASTWARD_INCLUSIVE','WESTWARD_INCLUSIVE'];
export const PLANES=['','GROUND','FIRST_FLOOR','SECOND_FLOOR'];
export const OBJECT_TYPES=['GAME_OBJECT','NPC','ANY'];
export function validateEntrance(e) {
  if(!e || !OVERLAYS.includes(e.overlay) || !DIRECTIONS.includes(e.direction) || !PLANES.includes(e.plane) || !OBJECT_TYPES.includes(e.objectType)) throw new Error('Unsupported entrance settings.');
  if(!Array.isArray(e.ids)||!e.ids.length||e.ids.length>100)throw new Error('Provide 1–100 entrance object/NPC IDs.');
  for(const id of e.ids) {
    if(typeof id!=='string'||! /^(?:\d{1,9}|(?:ObjectID|NpcID)\.[A-Z][A-Z0-9_]*)$/.test(id))throw new Error(`Invalid entrance ID: ${id}`);
    if(e.objectType==='NPC'&&id.startsWith('ObjectID.')||e.objectType==='GAME_OBJECT'&&id.startsWith('NpcID.'))throw new Error('Entrance ID namespace does not match its object type.');
  }
  if(!Array.isArray(e.chunks)||e.chunks.length>256)throw new Error('Invalid entrance chunks.');
  e.chunks.forEach(n=>integer(n,0,4194303,'Entrance chunk ID'));
}
export function entranceJava(e) {
  validateEntrance(e);
  const args=[`EscapeCrystalNotifyRegionEntranceOverlayType.${e.overlay}`];
  if(e.direction)args.push(`EscapeCrystalNotifyRegionEntranceDirection.${e.direction}`);
  args.push(e.chunks.length?`List.of(${[...new Set(e.chunks)].sort((a,b)=>a-b).join(', ')})`:'null');
  if(e.plane)args.push(`EscapeCrystalNotifyRegionEntrancePlaneLevel.${e.plane}`);
  args.push(`EscapeCrystalNotifyRegionEntranceObjectType.${e.objectType}`,...e.ids);
  return `new EscapeCrystalNotifyRegionEntrance(${args.join(', ')})`;
}
