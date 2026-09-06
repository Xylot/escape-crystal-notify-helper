import {useEffect,useState} from 'react';
import {MoidThumbnail} from './EntrancePortraits';
import {loadEntranceModels} from './pr-models';

export default function EntranceModelReferences({ids,objectType,selection}:{ids:string[];objectType:string;selection?:string|null}) {
  const [images,setImages]=useState<string[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const key=JSON.stringify([ids,objectType,selection]);
  const hasSelection=selection!==null && (!!selection || (objectType!=='NPC' && ids.length>0));
  useEffect(()=>{
    let active=true;
    setImages([]);setError('');setLoading(hasSelection);
    if(hasSelection)loadEntranceModels(ids,objectType,selection).then(next=>{if(active)setImages(next);}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[key,retry]);
  if(!hasSelection)return null;
  return <section className="review-model-references" aria-label="Entrance model variants">
    <h4>Model images & variants</h4>
    {loading&&<p role="status" className="muted">Finding available model images…</p>}
    {error?<p role="status" className="warning">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry images</button></p>:!loading&&!images.length&&<p className="muted">No model images are available for this selection. <button onClick={()=>setRetry(n=>n+1)}>Retry images</button></p>}
    <div className="entrance-portraits">{images.map(id=><MoidThumbnail key={id} id={id} compact/>)}</div>
    {!!images.length&&<p className="muted">Available first orientations, including related variants. Detection IDs are unchanged. <a href="https://chisel.weirdgloop.org/moid/index.html" target="_blank" rel="noreferrer">MOID / Weird Gloop ↗</a></p>}
  </section>;
}
