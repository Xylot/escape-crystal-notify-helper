import {chunkId,regionId} from './coordinates.mjs';
import {entranceObjectCandidates,objectsInEntranceChunks,DUMPER} from './region-objects.mjs';

// Saved map context and a freshly loaded suggestion may describe the same choice.
// Compare coverage and placements, rather than display titles or source revisions.
export function uniqueEntranceMapChoices(choices) {
  const unique=[],indexes=new Map();
  const numbers=values=>[...new Set(values)].sort((a,b)=>a-b);
  for(const choice of choices){
    const location=choice.location;
    const objects=[...new Set((location.entranceObjects??[]).map(object=>`${object.id}:${object.x}:${object.y}`))].sort();
    const key=JSON.stringify([location.plane??0,String(location.tiles?.mapId??location.mapId??''),numbers(choice.regions),numbers(choice.chunks),objects]);
    const index=indexes.get(key);
    if(index===undefined){indexes.set(key,unique.length);unique.push({...choice});continue;}
    const previous=unique[index];
    if(previous.current&&!choice.current)unique[index]={...previous,label:choice.label};
    else if(choice.current)unique[index]={...choice,label:previous.label};
  }
  return unique;
}

// Suggestions are placements, not assertions that an object belongs to a boss.
// Consolidate placements by notification chunk and plane, retaining every object.
/** @param {any} data @param {{name:string,regions:number[],chunks?:number[],plane?:number,selectedIds?:string[],arena?:any}} options */
export function entranceMapSuggestions(data, {name,regions,chunks=[],plane=0,selectedIds=[],arena}) {
  const words=name.toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>2&&!['the','boss'].includes(word));
  const selected=new Set(selectedIds.map(String));
  const rows=objectsInEntranceChunks(entranceObjectCandidates(data,regions,[],plane),chunks);
  const candidates=rows.filter(row=>row.entrance).map(row=>{
    const names=[row.name,...row.forms.map(form=>form.name??'')].join(' ').toLowerCase();
    const score=(selected.has(String(row.id))||row.forms.some(form=>selected.has(String(form.locId)))?100:0)
      +words.filter(word=>names.includes(word)).length*20
      +(row.actions.some(action=>/^enter$/i.test(action))?10:0);
    return {row,score};
  }).sort((a,b)=>b.score-a.score||a.row.name.localeCompare(b.row.name)||a.row.x-b.row.x||a.row.y-b.row.y||a.row.id-b.row.id);
  const seen=new Set();
  const groups=new Map();
  for(const {row} of candidates){
    const key=`${row.id}:${row.x}:${row.y}:${row.level}`;
    if(seen.has(key))continue;
    seen.add(key);
    const groupKey=`${chunkId(row.x,row.y)}:${row.level}`;
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(row);
  }
  return [...groups.values()].slice(0,30).map(objects=>{
    const row=objects[0],ids=[...new Set(objects.map(object=>object.id))].sort((a,b)=>a-b);
    const title=`${[...new Set(objects.map(object=>object.name))].join(' / ')} · ${ids.length===1?'Object':'Objects'} ${ids.join(', ')}`;
    return {
    x:row.x,y:row.y,pinX:row.x,pinY:row.y,region:regionId(row.x,row.y),plane:row.level,
    mapId:arena?.mapId??null,...(arena?.tiles&&arena.tiles.plane===row.level?{tiles:arena.tiles}:{}),
    role:'entrance',title,caption:`Possible entrance · ${title}`,
    source:`https://github.com/${DUMPER}/blob/${data.sha}/data/regions.json`,revision:null,verified:false,
    notificationChunks:[chunkId(row.x,row.y)],
    entranceObjects:objects.map(object=>({id:String(object.id),name:object.name,x:object.x,y:object.y})),
  };});
}
