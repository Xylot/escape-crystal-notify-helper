import {itemIcon} from './item-icon.mjs';
import {maskJava} from './java.mjs';
import {encounterType} from './encounter-kind.mjs';

const ROOT='src/main/java/com/escapecrystalnotify/';
export const THRESHOLDS_PATH=ROOT+'EscapeCrystalNotifyThresholdDefaults.java';
export const ENCOUNTERS_PATH=ROOT+'EscapeCrystalNotifyEncounters.java';
export const METADATA_PATHS=[THRESHOLDS_PATH,ENCOUNTERS_PATH];
export const hasMetadata=c=>['recommendedSeconds','petIcon','metadataBase'].some(k=>c[k]!==undefined);
const iconPattern=/^(?:ItemID\.[A-Z][A-Z0-9_]*|[1-9]\d*)$/;
export const validInactivity=value=>Number.isInteger(value)&&value>=2&&value<=2147483647;
export const validPetIcon=value=>typeof value==='string'&&value.length<=160&&iconPattern.test(value)&&(!/^\d+$/.test(value)||Number(value)<=2147483647);
export function validateMetadata(c) {
  if(!hasMetadata(c))return;
  if(!['BOSSES','RAIDS'].includes(encounterType(c)))throw new Error('Inactivity time and pet icons apply only to bosses and raids.');
  if(!validInactivity(c.recommendedSeconds))throw new Error('Recommended inactivity time must be a whole number of seconds, at least 2.');
  if(!validPetIcon(c.petIcon))throw new Error('Choose a pet icon using an ItemID constant or a positive item ID.');
  if(!c.metadataBase||typeof c.metadataBase.canonicalId!=='string'||! /^(BOSS|RAIDS)_[A-Z0-9_]+$/.test(c.metadataBase.canonicalId)||!Number.isInteger(c.metadataBase.recommendedSeconds)||!iconPattern.test(c.metadataBase.petIcon??''))throw new Error('Sync plugin metadata before editing the inactivity time or pet icon.');
}

// Scan only the named method's switch. Comments retain their source offsets.
function switchBody(source,method) {
  if(typeof source!=='string')throw new Error('Sync plugin to load inactivity times and pet icons.');
  const mask=maskJava(source,true);
  const header=new RegExp('static\\s+(?:int|EscapeCrystalNotifyRegion)\\s+'+method+'\\s*\\([^)]*\\)\\s*\\{\\s*switch\\s*\\([^{}]*\\)\\s*\\{').exec(mask);
  if(!header)throw new Error(`Unsupported ${method} metadata method; review the Java source.`);
  const start=header.index+header[0].length;
  let end=start,depth=1;
  for(;end<mask.length;end++){if(mask[end]==='{')depth++;if(mask[end]==='}'&&!--depth)break;}
  if(depth)throw new Error('Unclosed metadata switch.');
  return {start,end,body:mask.slice(start,end)};
}
const parsedSwitches=new Map();
function groups(source,method) {
  const key=method+'\0'+source;
  if(parsedSwitches.has(key))return parsedSwitches.get(key);
  const scope=switchBody(source,method),result=[];
  const pattern=/((?:\s*case\s+[A-Z][A-Z0-9_]*\s*:\s*)+)return\s+([A-Za-z0-9_.]+)\s*;/g;
  let match;
  while((match=pattern.exec(scope.body))) {
    const labels=[...match[1].matchAll(/case\s+([A-Z][A-Z0-9_]*)\s*:/g)].map(m=>({id:m[1],start:scope.start+match.index+m.index,end:scope.start+match.index+m.index+m[0].length}));
    result.push({labels,value:match[2],start:labels[0].start,end:scope.start+match.index+match[0].length});
  }
  const ids=result.flatMap(g=>g.labels.map(l=>l.id));
  if(new Set(ids).size!==ids.length||[...scope.body.matchAll(/\bcase\b/g)].length!==ids.length)throw new Error(`Unsupported or duplicate ${method} metadata cases.`);
  const defaultAt=scope.body.search(/\bdefault\s*:/);
  if(defaultAt<0||scope.body.slice(0,defaultAt).replace(pattern,'').trim())throw new Error(`Unsupported ${method} switch statements.`);
  const parsed={...scope,groups:result};
  if(parsedSwitches.size>=16)parsedSwitches.delete(parsedSwitches.keys().next().value);
  parsedSwitches.set(key,parsed);
  return parsed;
}
export function metadataFor(id,sources) {
  const encounters=sources?.[ENCOUNTERS_PATH],thresholds=sources?.[THRESHOLDS_PATH];
  const aliases=groups(encounters,'canonical');
  // The plugin's default canonicalization strips a terminal entrance suffix.
  const fallback=maskJava(encounters.slice(aliases.start,aliases.end)).split(/\bdefault\s*:/)[1]?.replace(/\s+/g,'');
  if(fallback!=='returnregion.name().endsWith("_ENTRANCE")?EscapeCrystalNotifyRegion.valueOf(region.name().replaceFirst("_ENTRANCE$","")):region;')throw new Error('Unsupported encounter canonicalization.');
  const alias=aliases.groups.find(g=>g.labels.some(l=>l.id===id));
  if(alias&&!/^EscapeCrystalNotifyRegion\.[A-Z0-9_]+$/.test(alias.value))throw new Error('Unsupported canonical encounter.');
  const canonicalId=alias?alias.value.split('.')[1]:id.replace(/_ENTRANCE$/,'');
  const seconds=groups(thresholds,'seconds'),icons=groups(encounters,'icon');
  const value=(scope,fallback)=>scope.groups.find(g=>g.labels.some(l=>l.id===canonicalId))?.value??scope.body.match(/default\s*:\s*return\s+([\w.]+)\s*;/)?.[1]??fallback;
  let recommended=value(seconds);
  if(recommended==='DEFAULT_CRYSTAL_THRESHOLD_SECONDS')recommended=maskJava(thresholds).match(/\bDEFAULT_CRYSTAL_THRESHOLD_SECONDS\s*=\s*(\d+)\s*;/)?.[1];
  const result={canonicalId,recommendedSeconds:Number(recommended),petIcon:value(icons)};
  if(!/^\d+$/.test(recommended??'')||!iconPattern.test(result.petIcon??''))throw new Error('Unsupported inactivity time or pet icon source.');
  return result;
}
export function withMetadata(draft,sources) {
  if(!['BOSSES','RAIDS'].includes(encounterType(draft))||!sources?.[THRESHOLDS_PATH]||!sources?.[ENCOUNTERS_PATH]||draft.metadataBase)return draft;
  const metadataBase=metadataFor(draft.id,sources);
  return {...draft,metadataBase,...(draft.baseRaw?{recommendedSeconds:metadataBase.recommendedSeconds,petIcon:metadataBase.petIcon}:{recommendedSeconds:2,petIcon:''})};
}
function formatSharedReturn(source,method,id) {
  const scope=groups(source,method),group=scope.groups.find(g=>g.labels.some(l=>l.id===id));
  if(!group||group.labels.length<2)return source;
  const last=group.labels.at(-1),tail=source.slice(last.end,group.end);
  // Only reflow an inline return, leaving comments and existing line breaks intact.
  if(!/^[\t ]+return\b/.test(tail))return source;
  const caseIndent=source.slice(source.lastIndexOf('\n',group.start-1)+1,group.start);
  const returnIndent=source.slice(scope.start,scope.end).match(/^[\t ]+return\b/m)?.[0].replace(/return$/,'')??caseIndent+(caseIndent.includes('\t')?'\t':'    ');
  const eol=source.includes('\r\n')?'\r\n':'\n';
  return source.slice(0,last.end)+tail.replace(/^[\t ]+/,eol+returnIndent)+source.slice(group.end);
}
function setCase(source,method,id,value) {
  const scope=groups(source,method),old=scope.groups.find(g=>g.labels.some(l=>l.id===id));
  if(old?.value===String(value))return source;
  // Remove just this case from a shared return group, or the complete lone case.
  if(old){
    const label=old.labels.find(l=>l.id===id);
    let start=label.start,end=old.labels.length===1?old.end:label.end;
    const lineStart=source.lastIndexOf('\n',start-1)+1,lineEnd=source.indexOf('\n',end);
    if(/^[\t ]*$/.test(source.slice(lineStart,start))&&lineEnd>=0&&/^[\t \r]*$/.test(source.slice(end,lineEnd))){start=lineStart;end=lineEnd+1;}
    source=source.slice(0,start)+source.slice(end);
  }
  const next=groups(source,method),target=next.groups.find(g=>g.value===String(value));
  const eol=source.includes('\r\n')?'\r\n':'\n';
  const caseIndent=source.slice(next.start,next.end).match(/^[\t ]+(?=case\b)/m)?.[0]??'            ';
  const following=method==='seconds'?next.groups.find(g=>Number(g.value)>Number(value)):null;
  const at=target?(target.labels.find(l=>l.id.localeCompare(id)>0)?.start??target.labels.at(-1).end):following?.start??(next.start+next.body.search(/\bdefault\s*:/));
  if(at<next.start)throw new Error(`Missing ${method} default case.`);
  const text=target&&at===target.labels.at(-1).end?`${eol}${caseIndent}case ${id}:`:`case ${id}:${target?'':` return ${value};`}${eol}${caseIndent}`;
  return formatSharedReturn(source.slice(0,at)+text+source.slice(at),method,id);
}
export function applyMetadata(sources,changes) {
  const selected=changes.filter(hasMetadata);
  if(!selected.length)return {};
  const planned=new Map();
  for(const c of selected) {
    validateMetadata(c);
    const current=metadataFor(c.id,sources),base=c.metadataBase;
    if(['canonicalId','recommendedSeconds','petIcon'].some(k=>current[k]!==base[k]))throw new Error(`Conflict: ${c.id} inactivity time or pet icon changed upstream. Sync and review its metadata.`);
    const prior=planned.get(current.canonicalId);
    if(prior&&(prior.recommendedSeconds!==c.recommendedSeconds||prior.petIcon!==c.petIcon))throw new Error(`Conflicting settings for shared encounter ${current.canonicalId}.`);
    planned.set(current.canonicalId,c);
  }
  let thresholds=sources[THRESHOLDS_PATH],encounters=sources[ENCOUNTERS_PATH];
  for(const [id,c] of planned) {
    thresholds=setCase(thresholds,'seconds',id,c.recommendedSeconds);
    // Keep explicit aliases in existing threshold groups consistent as well.
    const aliases=groups(sources[THRESHOLDS_PATH],'seconds').groups.flatMap(g=>g.labels).filter(l=>l.id!==id&&metadataFor(l.id,sources).canonicalId===id);
    for(const alias of aliases)thresholds=setCase(thresholds,'seconds',alias.id,c.recommendedSeconds);
    encounters=setCase(encounters,'icon',id,itemIcon(c.petIcon));
  }
  return {[THRESHOLDS_PATH]:thresholds,[ENCOUNTERS_PATH]:encounters};
}
