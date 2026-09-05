import { useState,useEffect,useRef } from 'react';
import { OVERLAYS,DIRECTIONS,PLANES,OBJECT_TYPES } from './core/entrance.mjs';
import { parseIds } from './core/coordinates.mjs';
import type { Boss,Draft,Entrance as Config } from './types';
import { loadParser } from './parser';
import { findEntranceCandidates } from './core/wiki.mjs';
import {loadGameval,searchGameval} from './core/gameval.mjs';
import RegionObjects from './RegionObjects';
export default function EntranceEditor({boss,draft,update,onError}:{boss:Boss;draft:Draft;update:(d:Partial<Draft>)=>void;onError:(s:string)=>void}) {
  const [ids,setIds]=useState(draft.entrance?.ids.join(', ')??''),[chunks,setChunks]=useState(draft.entrance?.chunks.join(', ')??'');
  const [method,setMethod]=useState('region');
  const chunkInput=useRef<HTMLInputElement>(null),idInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(document.activeElement!==idInput.current)setIds(draft.entrance?.ids.join(', ')??'');},[draft.entrance?.ids]);
  const [gameQuery,setGameQuery]=useState(draft.name),[gameResults,setGameResults]=useState<any[]>([]),[gameBusy,setGameBusy]=useState(false),[gameSearched,setGameSearched]=useState(false);
  useEffect(()=>{if(document.activeElement!==chunkInput.current&&(draft.entrance?.chunks??[]).every(n=>n>=0))setChunks(draft.entrance?.chunks.join(', ')??'');},[draft.entrance?.chunks]);
  const [candidates,setCandidates]=useState<{title:string;source:string;revision:number;ids:string[];objectType:string}[]>([]),[searching,setSearching]=useState(false),[searched,setSearched]=useState(false);
  const fresh:Config={overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',objectType:'GAME_OBJECT',ids:[],chunks:[],reviewed:false};
  const config=draft.entrance??fresh;
  const edit=(part:Partial<Config>)=>update({entrance:{...config,...part,reviewed:part.reviewed??false}});
  return <div className="inspector-panel"><div className="inspector-heading"><h2>Entrance object</h2><p>Find the object, add its IDs, then review.</p></div>
    {!!boss.optionalArgs.length&&<details><summary>Existing plugin settings</summary><pre className="entrance-code">{boss.optionalArgs.join(',\n')}</pre></details>}
    {!draft.entrance?<><div className="inspector-card"><p>{boss.optionalArgs.some(a=>a.includes('RegionEntrance('))?'Existing entrance settings are preserved. Replacing them requires reviewing all settings below.':'No object selected yet. Search the region below, or enter a known ID.'}</p></div><button onClick={()=>edit({})}>Enter IDs manually</button></>:<>
      <section className="inspector-card"><h3>Selected object</h3><label className="field">Interaction type<select value={config.objectType} onChange={e=>edit({objectType:e.target.value})}>{OBJECT_TYPES.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="field">Object / NPC IDs<input ref={idInput} value={ids} onChange={e=>{setIds(e.target.value);edit({ids:e.target.value.split(/[\s,]+/).filter(Boolean)});}} placeholder="ObjectID.ENTRANCE_NAME, 12345"/></label>
      <details className="inspector-disclosure"><summary>Chunks & interaction settings</summary><label className="field">Entrance chunk IDs<input ref={chunkInput} value={chunks} onChange={e=>{setChunks(e.target.value);try{edit({chunks:parseIds(e.target.value,'chunk')});}catch(error){edit({chunks:[-1],reviewed:false});onError((error as Error).message);}}} placeholder="Leave empty for no chunk restriction"/></label>
      {([['overlay','Overlay',OVERLAYS],['direction','Approach direction',DIRECTIONS],['plane','Plane constraint',PLANES]] as const).map(([key,label,values])=><label className="field" key={key}>{label}<select value={config[key]} onChange={e=>edit({[key]:e.target.value})}>{values.map(v=><option key={v} value={v}>{v||'Constructor default'}</option>)}</select></label>)}
      </details><label className="review-check"><input type="checkbox" checked={config.reviewed} onChange={e=>edit({reviewed:e.target.checked})}/><span>Entrance reviewed<small>IDs, variants and interaction verified</small></span></label>
      <button className="text-button" onClick={()=>update({entrance:undefined})}>Remove override</button></section>
    </>}
    <div className="lookup-heading"><h3>Find an object</h3><label className="field"><span className="sr-only">Entrance search method</span><select value={method} onChange={e=>setMethod(e.target.value)}><option value="region">Nearby objects · recommended</option><option value="gameval">Gameval name or ID</option><option value="wiki">Wiki search</option></select></label></div>
    <div hidden={method!=='region'}>    <RegionObjects boss={boss} selectedRegion={draft.entranceRegion} onError={onError} onUse={id=>{const next=[...new Set([...(config.objectType==='GAME_OBJECT'?config.ids:[]),id])];setIds(next.join(', '));edit({ids:next,objectType:'GAME_OBJECT'});}}/>
</div><div hidden={method!=='gameval'}>    <div className="gameval-search"><h3>RuneLite gameval search</h3><p className="muted">Search object and NPC constants by boss, location, or numeric ID. Entrance-like names appear first.</p><form onSubmit={async e=>{e.preventDefault();setGameBusy(true);try{setGameResults(searchGameval(await loadGameval(),gameQuery));setGameSearched(true);}catch(error){onError((error as Error).message);}finally{setGameBusy(false);}}}><label className="field">Boss, location or ID<input value={gameQuery} onChange={e=>setGameQuery(e.target.value)}/></label><button disabled={gameBusy||!gameQuery.trim()}>{gameBusy?'Loading gameval…':'Search gameval IDs'}</button></form>
    {gameSearched&&!gameResults.length&&<p>No matches. Try a location or alternate boss name.</p>}<div className="gameval-results">{gameResults.map(c=><article className="evidence" key={`${c.file}.${c.name}`}><span className="badge">{c.objectType} · candidate</span><code className="gameval-name">{c.file}.{c.name}</code><strong>{c.id}</strong><a className="related" href={c.source} target="_blank" rel="noreferrer">View exact source ↗</a><button onClick={()=>{const next=[...new Set([...(config.objectType===c.objectType?config.ids:[]),c.id])];setIds(next.join(', '));edit({ids:next,objectType:c.objectType});}}>Add numeric ID for review</button></article>)}</div><p className="muted">Names suggest candidates; confirm the object and variants in game. Numeric IDs keep exports independent of Java imports.</p></div>
</div><div hidden={method!=='wiki'}>    <button className="wide" disabled={searching} onClick={async()=>{setSearching(true);try{const Parser=await loadParser();setCandidates(await findEntranceCandidates(Parser,draft.name));setSearched(true);}catch(e){onError((e as Error).message);}finally{setSearching(false);}}}>{searching?'Searching wiki…':'Find entrance candidates'}</button>
    {searched&&!candidates.length&&<p className="muted">No object/NPC IDs found in the first five search results. Use a known object page or in-game inspection.</p>}
    {candidates.map((c,i)=><article className="evidence" key={i}><span className="badge">Search candidate · unverified</span><h3>{c.title}</h3><code>{c.ids.join(', ')}</code><a className="related" href={c.source} target="_blank" rel="noreferrer">Wiki revision {c.revision} ↗</a><button onClick={()=>{setIds(c.ids.join(', '));edit({ids:c.ids,objectType:c.objectType});}}>Use IDs for review</button></article>)}
</div><details className="inspector-disclosure"><summary>About entrance verification</summary><p className="muted">Map locations and names identify candidates. Verify placed IDs and transformed variants in game. Generated constructors must pass the plugin build. Existing advanced options are preserved unless the entrance is replaced.</p></details>
  </div>;
}
