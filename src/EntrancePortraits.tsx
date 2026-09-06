import {useEffect,useState} from 'react';
import {loadGameval} from './core/gameval.mjs';
import {moidImage,parseMoidSelection} from './core/moid-images.mjs';
import {loadParentVariantImages} from './pr-models';

export function MoidThumbnail({id,onSelect,selected=false,compact=false}:{id:string;onSelect?:(id:string)=>void;selected?:boolean;compact?:boolean}){
  const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
  const [variants,setVariants]=useState<string[]>([]),[resolving,setResolving]=useState(false);
  useEffect(()=>{setFailed(false);setLoaded(false);setVariants([]);},[id]);
  useEffect(()=>{
    if(!failed)return;
    let active=true;setResolving(true);
    loadParentVariantImages(id).then(images=>{if(active)setVariants(images);}).catch(()=>{if(active)setVariants([]);}).finally(()=>{if(active)setResolving(false);});
    return()=>{active=false;};
  },[failed,id]);
  const image=moidImage(id);
  const collage=failed&&variants.length>0;
  return <figure className={`moid-image${compact?' compact':''}${selected?' chosen':''}`}>
    <a href={image.source} target="_blank" rel="noreferrer" aria-label={`View object ${id} in MOID`}>
      {collage?<span className="moid-collage" style={{gridTemplateColumns:`repeat(${Math.ceil(Math.sqrt(variants.length))},minmax(0,1fr))`}} aria-label={`Object ${id}: collage of ${variants.length} variants`}>{variants.map(variant=><span key={variant} className="moid-collage-cell"><img src={moidImage(variant).url} alt={`Variant ${variant}, first orientation`} title={`Variant ${variant}`} decoding="async" onError={()=>setVariants(current=>current.filter(value=>value!==variant))}/></span>)}</span>:failed?<span className="moid-missing" role="status">{resolving?'Finding variant images…':'No image available'}</span>:<img src={image.url} alt={`Object ${id}, first orientation`} loading="lazy" decoding="async" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>}
    </a>
    <figcaption>Object {id}{collage&&<span>{variants.length} variants · collage</span>}{onSelect&&<button type="button" disabled={!(loaded&&!failed)&&!collage} aria-pressed={selected} onClick={()=>onSelect(id)}>{selected?'Selected image':'Use image'}</button>}</figcaption>
  </figure>;
}

export default function EntrancePortraits({ids,objectType,selection,onSelect,compactPicker=false}:{compactPicker?:boolean;name?:string;ids:string[];objectType:string;selection?:string|null;onSelect?:(id:string|null|undefined)=>void}){
  const [numeric,setNumeric]=useState<string[]>([]),[query,setQuery]=useState(''),[candidates,setCandidates]=useState<string[]>([]),[error,setError]=useState('');
  const key=JSON.stringify([ids,objectType]);
  useEffect(()=>{
    let alive=true;setNumeric(objectType==='NPC'?[]:ids.filter(id=>/^\d{1,9}$/.test(id)));
    if(objectType!=='NPC'&&ids.some(id=>id.startsWith('ObjectID.'))){
      loadGameval().then(symbols=>{if(alive)setNumeric([...new Set([...ids.filter(id=>/^\d{1,9}$/.test(id)),...symbols.filter((s:any)=>ids.includes(`${s.file}.${s.name}`)).map((s:any)=>s.id)])]);}).catch(()=>{});
    }
    return()=>{alive=false;};
  },[key]);
  const displayed=selection===null?[]:selection?[selection]:numeric;
  return <section className="entrance-reference">
    {onSelect&&<><h3>Entrance reference image</h3><p className="muted">Choose a visual reference without changing detection IDs.</p></>}
    <div className="entrance-portraits">{displayed.map(id=><MoidThumbnail key={id} id={id}/>)}</div>
    {!!displayed.length&&<p className="muted">{selection?'Custom visual reference · entrance IDs are unchanged':'Images for selected object IDs'} · <a href="https://chisel.weirdgloop.org/moid/index.html" target="_blank" rel="noreferrer">MOID / Weird Gloop ↗</a></p>}
    {onSelect&&<>
      {!displayed.length&&<p className="muted">{selection===null?'Reference image hidden.':'No object image selected. You can look up a reference below.'}</p>}
      <details className="reference-image-picker" open={!compactPicker}><summary>Change reference image</summary><div className="moid-selection-actions"><button type="button" aria-pressed={selection===undefined} onClick={()=>onSelect(undefined)}>Use entrance IDs</button><button type="button" aria-pressed={selection===null} onClick={()=>onSelect(null)}>No image</button></div>
      <label className="field">Image object ID or MOID URL<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="58440 or 58439-58442"/></label>
      <button type="button" onClick={()=>{try{setCandidates(parseMoidSelection(query));setError('');}catch(e){setError((e as Error).message);}}}>Find images</button>
      {error&&<p role="alert" className="export-issue">{error}</p>}
      <div className="entrance-portraits">{candidates.map(id=><MoidThumbnail key={id} id={id} selected={selection===id} onSelect={onSelect}/>)}</div></details>
    </>}
  </section>;
}
