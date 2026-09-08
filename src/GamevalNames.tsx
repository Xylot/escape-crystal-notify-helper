import {useEffect,useMemo,useState} from 'react';
import {gamevalMatches,indexGameval,loadGameval} from './core/gameval.mjs';

export function useGamevalNames(){
  const [entries,setEntries]=useState<any[]|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setError('');
    loadGameval().then(values=>{if(active)setEntries(values);}).catch(reason=>{if(active)setError((reason as Error).message);});
    return()=>{active=false;};
  },[attempt]);
  const index=useMemo(()=>entries?indexGameval(entries):null,[entries]);
  return {index,error,retry:()=>setAttempt(n=>n+1)};
}
export type GamevalLookup=ReturnType<typeof useGamevalNames>;

export default function GamevalNames({lookup,ids,objectType='GAME_OBJECT'}:{lookup:GamevalLookup;ids:string[];objectType?:string}){
  if(!lookup.index)return null;
  const matches=gamevalMatches(lookup.index,ids,objectType);
  return <span className="gameval-labels">{matches.length?matches.map(entry=><a className="gameval-name" key={`${entry.file}.${entry.name}`} href={entry.source} target="_blank" rel="noreferrer">{entry.file}.{entry.name} = {entry.id} ↗</a>):<span className="muted">No RuneLite gameval constant found for {ids.join(', ')}.</span>}</span>;
}
