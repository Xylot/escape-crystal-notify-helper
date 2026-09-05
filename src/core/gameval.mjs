const PATH='runelite-api/src/main/java/net/runelite/api/gameval';
export function parseGameval(source,file,revision){
  return source.split('\n').flatMap((line,index)=>{const m=line.match(/public static final int ([A-Z][A-Z0-9_]*)\s*=\s*(\d+);/);return m?[{name:m[1],id:m[2],file,objectType:file==='NpcID'?'NPC':'GAME_OBJECT',source:`https://github.com/runelite/runelite/blob/${revision}/${PATH}/${file}.java#L${index+1}`}]:[];});
}
export function searchGameval(entries,query){
  const words=query.toUpperCase().split(/[^A-Z0-9]+/).filter(w=>w.length>2&&!['THE','BOSS','ENTRANCE','CAVE','LAIR'].includes(w));
  if(!words.length)return [];
  return entries.map(e=>({...e,score:words.filter(w=>e.name.includes(w)).length*10+(/ENTRANCE|ENTRY|DOOR|GATE|PORTAL/.test(e.name)?6:0)})).filter(e=>words.some(w=>e.name.includes(w))||words.includes(e.id)).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,40);
}
let cached;
export async function loadGameval(){
  if(cached)return cached;
  cached=(async()=>{
    const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`RuneLite request failed (${r.status}). Try again.`);return r;};
    const {sha}=await (await get('https://api.github.com/repos/runelite/runelite/commits/master')).json();
    const lists=await Promise.all(['ObjectID','ObjectID1','NpcID'].map(async file=>parseGameval(await (await get(`https://raw.githubusercontent.com/runelite/runelite/${sha}/${PATH}/${file}.java`)).text(),file,sha)));
    return lists.flat();
  })().catch(e=>{cached=undefined;throw e;});
  return cached;
}
