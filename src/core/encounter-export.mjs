import {generateEntry, parseJava, maskJava, splitArgs, exportCoverage} from './java.mjs';
import {integer, chunkOrigin, regionId} from './coordinates.mjs';
import {isDungeon} from './encounter-kind.mjs';

export const ENTRANCE_FIELDS = ['entranceDangerous','entranceNotifyChunks','entranceBaseRaw'];
export const hasEntrancePolicy = change => ENTRANCE_FIELDS.some(key => change[key] !== undefined);
export const sourceEntry = raw => raw ? parseJava(`enum EscapeCrystalNotifyRegion { ${raw}; }`).entries[0] : null;
const sorted = values => [...new Set(values)].sort((a,b)=>a-b);
const chunkRegion = id => {const p=chunkOrigin(id);return regionId(p.x,p.y);};
const entranceArg = entry => entry?.optionalArgs.find(a=>maskJava(a).trim().startsWith('new EscapeCrystalNotifyRegionEntrance('));
export function notificationChunks(entry) {
  const expression=entry?.optionalArgs.map(a=>maskJava(a).trim()).find(a=>a.startsWith('List.'));
  return readChunks(expression);
}
function readChunks(expression) {
  if(!expression||expression==='null')return [];
  if(!/^List\.of\([\d,\s]*\)$/.test(expression))throw new Error('These chunk restrictions require manual Java review.');
  const body=expression.slice(expression.indexOf('(')+1,-1).trim();
  return body?body.split(',').map(Number):[];
}
export function detectionChunks(entry) {
  const raw=entranceArg(entry);
  if(!raw)return [];
  return readChunks(splitArgs(raw.slice(raw.indexOf('(')+1,-1)).find(a=>a.startsWith('List.')));
}

// One authored encounter may produce two Java entries. All export surfaces use
// this expansion; source arguments come only from their verified baselines.
export function expandEncounter(change, existing=sourceEntry(change.baseRaw), paired=sourceEntry(change.entranceBaseRaw)) {
  const single=()=>[{id:change.id,baseRaw:change.baseRaw,raw:generateEntry(change,existing)}];
  if(!hasEntrancePolicy(change))return single();
  if(isDungeon(change))throw new Error('Dungeons do not have entrance danger settings.');
  if(change.entranceDangerous!==undefined&&change.entranceDangerous!==null&&typeof change.entranceDangerous!=='boolean')throw new Error('Choose whether the entrance area is dangerous.');
  if(change.entranceBaseRaw!==undefined&&change.entranceBaseRaw!==null&&(typeof change.entranceBaseRaw!=='string'||change.entranceBaseRaw.length>20000))throw new Error('Invalid original entrance entry.');
  const entranceId=`${change.id}_ENTRANCE`;
  if(paired&&(paired.id!==entranceId||paired.regionType!=='BOSSES'||!entranceArg(paired)))throw new Error('The original entrance entry does not match this boss.');
  const origin=paired??existing;
  const hasEntrance=!!(change.entrance||entranceArg(origin));
  if(!hasEntrance)return single();
  if(change.entranceDangerous===null)throw new Error('Answer “Is the entrance area dangerous?” before exporting entrance handling.');
  if(paired&&entranceArg(existing))throw new Error('Both source entries contain entrance handling. Review this configuration manually.');
  const detection=change.entrance?.chunks??detectionChunks(origin);
  const notify=change.entranceNotifyChunks??(paired?notificationChunks(paired):[]);
  for(const [label,values] of [['Entrance notification',notify],['Entrance detection',detection]]) {
    if(!Array.isArray(values)||values.length>256)throw new Error(`Invalid ${label.toLowerCase()} chunks.`);
    values.forEach(n=>integer(n,0,4194303,`${label} chunk ID`));
  }
  if(change.entranceDangerous===false&&!notify.length)throw new Error('Select notification chunks near the non-dangerous entrance. Notifications still occur inside those chunks.');
  if(notify.length&&(!detection.length||detection.some(id=>!notify.includes(id))))throw new Error('Every object-detection chunk must be inside the entrance notification chunks. Select explicit object-detection chunks.');
  if(change.entranceRegion!==undefined)integer(change.entranceRegion,0,65535,'Entrance region');
  const areaChanged=change.entranceRegion!==undefined||change.entrance&&JSON.stringify(sorted(detection))!==JSON.stringify(sorted(detectionChunks(origin)))||change.entranceNotifyChunks!==undefined&&JSON.stringify(sorted(notify))!==JSON.stringify(sorted(notificationChunks(paired)));
  const regions=sorted([...(change.entranceRegion===undefined?[]:[change.entranceRegion]),...detection.map(chunkRegion),...notify.map(chunkRegion),...(!areaChanged?paired?.regions??[]:[])]);
  if(!regions.length)throw new Error('Choose an entrance region or entrance chunks before exporting entrance handling.');
  if(regions.length>256)throw new Error('Entrance coverage exceeds 256 regions.');
  if(notify.length&&regions.some(id=>!notify.some(chunk=>chunkRegion(chunk)===id)))throw new Error('Select notification chunks in every entrance region.');
  const arenaChunks=change.chunks??notificationChunks(existing);
  if(arenaChunks.some(id=>!change.regions.includes(chunkRegion(id))))throw new Error('Arena restriction chunks must lie inside selected arena regions. Review the arena coverage.');
  if(arenaChunks.length&&change.regions.some(id=>!arenaChunks.some(chunk=>chunkRegion(chunk)===id)))throw new Error('Select chunks in every arena region or remove arena chunk restrictions.');
  // A single constructor can represent whole-area coverage or two independently
  // restricted areas. Mixed whole-region/chunk coverage needs separate entries.
  const split=!!paired||change.entranceDangerous===false||!!arenaChunks.length!==!!notify.length;
  if(split&&regions.some(id=>change.regions.includes(id)))throw new Error('Arena and entrance share a region with incompatible notification restrictions. Review arena regions; this layout requires manual Java review.');
  const clean={...change};for(const key of ENTRANCE_FIELDS)delete clean[key];
  if(!split) {
    const coverage={regions:sorted([...change.regions,...regions]),chunks:sorted([...arenaChunks,...notify])};
    if(coverage.regions.length>256||coverage.chunks.length>256)throw new Error('Combined coverage exceeds 256 regions or chunks.');
    return [{id:change.id,baseRaw:change.baseRaw,raw:generateEntry({...clean,chunks:coverage.chunks},existing,coverage)}];
  }
  if(existing?.optionalArgs.some(a=>a.includes('Quest.')))throw new Error('Splitting quest-gated coverage requires manual Java review.');
  const bossSource=existing?{...existing,optionalArgs:existing.optionalArgs.filter(a=>a!==entranceArg(existing))}:null;
  const bossChange={...clean,entrance:undefined,entranceOverlay:undefined,entranceRegion:undefined,chunks:arenaChunks};
  // Transfer only the trusted entrance constructor, never the arena's restrictions.
  const entranceSource=paired??(entranceArg(existing)?{...existing,optionalArgs:[entranceArg(existing)]}:null);
  const entranceChange={...clean,id:entranceId,name:paired?.name??`${change.name} Entrance`,regions,chunks:notify};
  return [
    {id:change.id,baseRaw:change.baseRaw,raw:generateEntry(bossChange,bossSource,{regions:sorted(change.regions),chunks:arenaChunks})},
    {id:entranceId,baseRaw:change.entranceBaseRaw??null,raw:generateEntry(entranceChange,entranceSource,{regions,chunks:sorted(notify)})},
  ];
}
export const generateEncounter = (change,existing) => expandEncounter(change,existing).map(e=>e.raw).join(',\n');
export function encounterCoverage(change,existing) {
  if(!hasEntrancePolicy(change))return exportCoverage(change,existing);
  const entries=expandEncounter(change,existing).map(e=>sourceEntry(e.raw));
  return {regions:sorted(entries.flatMap(e=>e.regions)),chunks:entries.length===1?notificationChunks(entries[0]):undefined,
    entranceRegions:entries.length>1?entries[1].regions:sorted([...(change.entranceRegion===undefined?[]:[change.entranceRegion]),...(change.entrance?.chunks??detectionChunks(entries[0])).map(chunkRegion),...(change.entranceNotifyChunks??[]).map(chunkRegion)]),split:entries.length>1};
}
