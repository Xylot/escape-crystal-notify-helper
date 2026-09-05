export const DUMPER='Xylot/osrs-world-map-object-dumper';
let pending;
export async function loadRegionObjects(){
 if(pending)return pending;
 pending=(async()=>{
  const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`Object dump request failed (${r.status}). Try again.`);return r.json();};
  const {sha}=await get(`https://api.github.com/repos/${DUMPER}/commits/main`);
  const base=`https://raw.githubusercontent.com/${DUMPER}/${sha}/data`;
  const [regions,types,meta]=await Promise.all(['regions.json','loc-types.json','meta.json'].map(f=>get(`${base}/${f}`)));
  return {regions,types,meta,sha};
 })().catch(e=>{pending=undefined;throw e;});return pending;
}
/** @param {any} data @param {number} region @param {{x:number,y:number}|null} point @param {number|null} plane */
export function regionObjectCandidates(data,region,point,plane=null){
 if(!Number.isInteger(region)||region<0||region>65535)throw new Error('Enter a region ID from 0 to 65535.');
 return (data.regions[String(region)]?.locs??[]).filter(o=>plane===null||o.level===plane).map(o=>{
  const definition=data.types[String(o.id)]??{};
  const forms=definition.forms??[];
  const actions=[...new Set([...(definition.actions??[]),...forms.flatMap(f=>f.actions??[])].filter(Boolean))];
  const name=definition.displayName??definition.name??'Unknown object';
  const entrance=/entrance|door|gate|portal|stairs|ladder/i.test(name)||actions.some(a=>/^(enter|open|unblock|climb|pass|go-through)/i.test(a));
  const distance=point?Math.hypot(o.x-point.x,o.y-point.y):null;
  return {...o,name,definition,forms,actions,entrance,distance};
 }).sort((a,b)=>Number(b.entrance)-Number(a.entrance)||(a.distance??0)-(b.distance??0)||a.id-b.id);
}
export function objectGamevalNames(entries,ids){
 const wanted=new Set(ids.map(String));return entries.filter(e=>e.objectType==='GAME_OBJECT'&&wanted.has(e.id));
}
