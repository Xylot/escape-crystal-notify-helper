import {isDungeon} from './core/encounter-kind.mjs';
import {MoidThumbnail} from './EntrancePortraits';
import {prepareModels} from './pr-models';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Boss, Draft, EvidenceContexts } from './types';
import { encounterLocations } from './core/encounter.mjs';
import { cleanChanges, stableJSON } from './core/pr-evidence.mjs';
import { wikiUrl } from './core/wiki.mjs';
import { prJSON, signIn, signOut, PRFailure } from './pr-client';
import { renderEvidence, type EvidenceImage } from './pr-screenshots';
import { Icon } from './Icons';

const HISTORY='escape-crystal-pr-history:v1';
const statusText:Record<string,string>={prepared:'Ready to create',working:'Finishing submission…','creating-fork':'Creating your fork…','uploading-screenshots':'Uploading screenshots…','committing-code':'Committing boss changes…','creating-pr':'Creating your pull request…',complete:'Pull request created',closed:'Pull request closed',merged:'Pull request merged',retry:'Submission needs a retry'};
function remember(signature:string,record:any){try{const saved=JSON.parse(localStorage.getItem(HISTORY)||'{}');saved[signature]={id:record.id,revision:record.revision,pr:record.pr,status:record.status};localStorage.setItem(HISTORY,JSON.stringify(saved));}catch{/* Server status remains authoritative. */}}

export default function PRComposer({drafts,bosses,contexts,onClose}:{drafts:Draft[];bosses:Boss[];contexts:EvidenceContexts;onClose:()=>void}){
  const [login,setLogin]=useState(''),[preview,setPreview]=useState<any>(null),[images,setImages]=useState<EvidenceImage[]>([]),[title,setTitle]=useState(''),[introduction,setIntroduction]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const mounted=useRef(true);
  const input=useMemo(()=>{
    const evidence:Record<string,any>={},sources:Record<string,string[]>={};
    for(const d of drafts){const b=bosses.find(b=>b.id===d.id);if(!b)continue;const locations=encounterLocations(b),saved=contexts[d.id];
      const arena=saved?.arena??locations.arena[0],entrance=saved?.entrance??locations.entrance[0];
      evidence[d.id]={arena,entrance:entrance?{...entrance,plane:d.entrancePlane??entrance.plane??0,region:d.entranceRegion??entrance.region}:undefined};
      sources[d.id]=[wikiUrl(b.wikiTitle)];
    }
    return {changes:cleanChanges(drafts),contexts:evidence,sources};
  },[drafts,bosses,contexts]);
  const signature=stableJSON({input,imageSelections:drafts.map(d=>contexts[d.id]?.entranceImage),categories:bosses.filter(b=>drafts.some(d=>d.id===b.id)).map(b=>[b.id,b.categories])});
  useEffect(()=>{mounted.current=true;prJSON('/session').then(user=>{if(mounted.current)setLogin(user.login);}).catch(()=>{});return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setPreview(null);setImages([]);setError('');},[signature]);
  const handleError=(e:unknown)=>{if(!mounted.current)return;setError((e as Error).message);if(e instanceof PRFailure&&e.status===401)setLogin('');};
  async function connect(redirect=false){setError('');setBusy('Connecting to GitHub…');try{setLogin(await signIn(redirect));}catch(e){handleError(e);}finally{if(mounted.current)setBusy('');}}
  async function prepare(){
    setBusy('Checking the latest plugin source…');setError('');setImages([]);
    try{
      setBusy('Finding entrance model variants…');
      const presentation=await prepareModels(drafts,bosses,contexts);
      setBusy('Checking the latest plugin source…');
      const result=await prJSON('/prepare',{...input,presentation});if(!mounted.current)return;
      setPreview(result);setTitle(result.title);setIntroduction(result.introduction);remember(signature,result);
      if(!result.pr){const next=await renderEvidence(result.evidence.panels,value=>{if(mounted.current)setBusy(value);});if(mounted.current)setImages(next);}
    }catch(e){handleError(e);}finally{if(mounted.current)setBusy('');}
  }
  async function create(){
    if(!preview||images.length!==preview.evidence.panels.length)return;
    setBusy('Starting your submission…');setError('');
    const poll=window.setInterval(()=>prJSON(`/submissions/${preview.id}`).then(r=>{if(mounted.current){setBusy(statusText[r.status]||'Working…');if(r.pr){setPreview(r);remember(signature,r);}}}).catch(()=>{}),2000);
    try{
      const result=await prJSON(`/submissions/${preview.id}/submit`,{title,introduction,images:images.map(({id,png})=>({id,png}))});
      if(mounted.current){setPreview(result);remember(signature,result);if(result.status==='working')setError('This submission is still running. Use Check status before retrying.');}
    }catch(e){handleError(e);}finally{clearInterval(poll);if(mounted.current)setBusy('');}
  }
  async function check(){setError('');setBusy('Checking GitHub status…');try{const result=await prJSON(`/submissions/${preview.id}`);if(!mounted.current)return;setPreview(result);remember(signature,result);if(!result.pr)setError(result.error||statusText[result.status]||'You can retry this submission.');}catch(e){handleError(e);}finally{if(mounted.current)setBusy('');}}
  const complete=!!preview?.pr;
  const closed=preview?.pr?.state==='closed'&&!preview?.pr?.merged,merged=!!preview?.pr?.merged;
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="pr-title" className="modal pr-composer">
    <button className="close" onClick={onClose} aria-label="Close pull request preview">×</button>
    <div className="eyebrow">CONTRIBUTE ON GITHUB</div><h2 id="pr-title">{closed?'Your pull request was closed':merged?'Your pull request was merged':complete?'Your pull request is ready':'Create a pull request'}</h2>
    <p>{drafts.length===1?drafts[0].name:`${drafts.length} encounters`} · Your local drafts stay saved.</p>
    {!login?<div className="pr-connect"><h3>Connect your GitHub account</h3><p>Authorize public-repository access to create a branch in your fork and open a PR. GitHub credentials stay on the backend.</p><button className="primary" disabled={!!busy} onClick={()=>connect()}>Sign in with GitHub</button><button onClick={()=>connect(true)}>Continue in this tab</button></div>:<div className="pr-account"><span>Signed in as <strong>{login}</strong></span><button disabled={!!busy} onClick={async()=>{await signOut();setLogin('');}}>Sign out</button></div>}
    {error&&<div role="alert" className="export-issue"><strong>Needs attention</strong><p>{error}</p></div>}
    {busy&&<p role="status" className="pr-progress"><span className="loading-spinner"/>{busy}</p>}
    {login&&(!complete||closed)&&<button disabled={!!busy} onClick={prepare}>{closed?'Prepare a new PR':preview?'Refresh preview & screenshots':'Prepare PR preview'}</button>}
    {preview&&<>
      <div className="pr-target"><strong>{preview.repo}</strong><span>Base: {preview.branch} · {preview.baseSha.slice(0,7)}</span></div>
      {complete?<div className="pr-success"><Icon name="check" size={28}/><h3>Pull request #{preview.pr.number} · {closed?'Closed':merged?'Merged':'Open'}</h3><a className="primary" href={preview.pr.url} target="_blank" rel="noreferrer">Open pull request ↗</a><p>{closed?'This PR was closed without merging. You can prepare a new PR from the same saved draft.':merged?'This draft revision has been merged. Edit the encounter to prepare another revision.':'This draft revision already has an open PR. If you closed it on GitHub, check its status to prepare another.'}</p><button disabled={!!busy||!login} onClick={check}>Check GitHub status</button></div>:<>
        <label className="field">PR title<input value={title} maxLength={200} disabled={!!busy} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="field">Introduction<textarea rows={3} value={introduction} maxLength={6000} disabled={!!busy} onChange={e=>setIntroduction(e.target.value)}/></label>
      </>}
      <h3>Encounter changes</h3><div className="pr-summary">{preview.changes.map((c:any)=><article key={c.id}><h4>{c.name}</h4><p>Regions: {c.regions.join(', ')} · {c.deathType}</p><p>{isDungeon(c)?'Dungeon':'Arena'} chunks: {c.chunks?.join(', ')||'Whole regions'}</p>{!isDungeon(c)&&<p>Entrance: {c.entrance?`${c.entrance.objectType} · ${c.entrance.ids.join(', ')} · chunks ${c.entrance.chunks.join(', ')||'none'}`:'Existing settings preserved, if present'}</p>}{!!preview.presentation?.[c.id]?.images.length&&<><h5>Entrance model references & variants</h5><div className="entrance-portraits">{preview.presentation[c.id].images.map((id:string)=><MoidThumbnail key={id} id={id}/>)}</div><p className="muted">Related forms are shown for reference. Detection IDs are unchanged.</p></>}<div className="pr-sources">{preview.evidence.sources[c.id].map((source:string)=><a key={source} href={source} target="_blank" rel="noreferrer">{decodeURIComponent(new URL(source).pathname.slice(3)).replaceAll('_',' ')}{new URL(source).search?' · revision':''} ↗</a>)}</div></article>)}</div>
      <h3>Region & chunk screenshots</h3><p className="muted">Editor selections, not in-game verification. Images are stored on a separate evidence branch in your fork.</p>
      <div className="pr-images">{images.map(image=><figure key={image.id}><img src={image.url} alt={image.id.replaceAll('_',' ')}/><figcaption>{image.id.replaceAll('_',' ')}</figcaption></figure>)}</div>
      {!complete&&images.length!==preview.evidence.panels.length&&!busy&&<p className="export-issue">Screenshots are incomplete. Refresh the preview to retry before submitting.</p>}
      <details className="review-code"><summary>Exact code diff</summary><pre>{preview.patch}</pre></details>
      <details className="review-code"><summary>Generated PR description</summary><pre>{preview.body.replace(preview.introduction,introduction)}</pre></details>
      {!complete&&<footer className="pr-actions"><button disabled={!!busy} onClick={check}>Check status</button><button className="primary" disabled={!!busy||!login||!title.trim()||images.length!==preview.evidence.panels.length} onClick={create}>Create pull request</button><p>Creates branches and commits in your fork, then a ready-for-review PR. Nothing is merged.</p></footer>}
    </>}
  </section></div>;
}
