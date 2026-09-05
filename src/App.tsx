import { useEffect, useMemo, useState } from 'react';
import Authoring, { type AuthoringStep } from './Authoring';
import ReviewQueue from './ReviewQueue';
import { mergeDraft } from './core/authoring.mjs';
import Discovery from './Discovery';
import { Crystal, Icon, type IconName } from './Icons';
import {suggestedArenaRegions,encounterLocations} from './core/encounter.mjs';
import { buildLibrary } from './core/library.mjs';
import { fetchBossCatalog } from './core/catalog.mjs';
import { loadParser } from './parser';
import { parseJava, enumName, generateEntry } from './core/java.mjs';
import { importWiki, extractWiki, wikiTitle, wikiUrl } from './core/wiki.mjs';
import { applyProposal, validateProposal, fullPatch, PLUGIN_REPO, JAVA_PATH } from './core/proposal.mjs';
import type { Boss, Draft, Snapshot } from './types';

const EMPTY:Snapshot={version:1,generatedAt:null,baseCommit:null,source:'',entries:[],candidates:[],warnings:[]};
const STORAGE='escape-crystal-editor:v1';
function draftOf(b:Boss):Draft {return {id:b.id,name:b.name,regions:suggestedArenaRegions(b),entranceRegion:encounterLocations(b).entrance[0]?.region,entrancePlane:encounterLocations(b).entrance[0]?.plane??undefined,deathType:b.deathType,baseRaw:b.raw,reviewed:false};}
function saveFile(name:string,text:string,type='text/plain') { const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export default function App() {
  const [snapshot,setSnapshot]=useState<Snapshot>(EMPTY),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[imports,setImports]=useState<Boss[]>([]);
  const [active,setActive]=useState('BOSS_SHELLBANE_GRYPHON'),[search,setSearch]=useState(''),[filter,setFilter]=useState('new');
  const [view,setView]=useState('discover'),[includeQuests,setIncludeQuests]=useState(false);
  const [help,setHelp]=useState(false);
  const [step,setStep]=useState<AuthoringStep>('coverage'),[category,setCategory]=useState('all');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[modal,setModal]=useState(false),[review,setReview]=useState(false);
  const [input,setInput]=useState(''),[paste,setPaste]=useState('');
  const [ready,setReady]=useState(false),[past,setPast]=useState<Record<string,Draft>[]>([]),[future,setFuture]=useState<Record<string,Draft>[]>([]);
  useEffect(()=>{
    if(!modal&&!review&&!help)return;
    const previous=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,summary')??[]).filter(e=>e.getClientRects().length>0);
    focusable()[0]?.focus();
    const listener=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setModal(false);setReview(false);setHelp(false);}
      if(event.key==='Tab'){const elements=focusable(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);document.body.style.overflow=previousOverflow;previous?.focus();};
  },[modal,review,help]);
  useEffect(()=>{ (async()=>{
    try {
      const r=await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`);if(!r.ok)throw new Error('Snapshot unavailable.');
      const initial=await r.json();setSnapshot(initial);
      const raw=localStorage.getItem(STORAGE);
      if(raw) { const saved=JSON.parse(raw);if(saved.version!==1)throw new Error('Saved drafts use an unsupported format.');setDrafts(saved.drafts??{});setImports(saved.imports??[]);if(saved.snapshot?.baseCommit && Date.parse(saved.snapshot.generatedAt??'')>Date.parse(initial.generatedAt??''))setSnapshot({...saved.snapshot,catalog:saved.snapshot.catalog??initial.catalog,candidates:saved.snapshot.catalog?saved.snapshot.candidates:initial.candidates}); }
    }catch(e){setNotice(`Could not load saved data: ${(e as Error).message}`);}finally{setReady(true);}
  })();},[]);
  useEffect(()=>{if(!ready)return;try{localStorage.setItem(STORAGE,JSON.stringify({version:1,drafts,imports,snapshot}));}catch{setNotice('Browser storage is full or unavailable. Download your proposal before leaving.');}},[drafts,imports,snapshot,ready]);
  const bosses=useMemo(()=>buildLibrary(snapshot.candidates,imports,snapshot.entries,drafts) as Boss[],[snapshot,imports,drafts]);
  const boss=bosses.find(b=>b.id===active)??bosses[0];
  const draft=useMemo(()=>boss?(drafts[boss.id]??draftOf(boss)):null,[boss,drafts]);
  const supported=(b:Boss)=>!!b.raw||!!b.supportedBy?.length;
  const unsupportedCount=bosses.filter(b=>!supported(b)).length;
  const categories=[...new Set(snapshot.candidates.flatMap(b=>b.categories??[]))].sort();
  const filtered=bosses.filter(b=>(filter==='drafts'||includeQuests||!b.categories?.some(c=>/quest/i.test(c)))&&b.name.toLowerCase().includes(search.toLowerCase())&&(category==='all'||b.categories?.includes(category))&&(filter==='all'||filter==='supported'&&supported(b)||filter==='new'&&!supported(b)||filter==='drafts'&&drafts[b.id]||filter==='unresolved'&&!b.maps.length&&!b.raw));
  const changes=Object.values(drafts), conflicts=changes.filter(c=>(snapshot.entries.find(b=>b.id===c.id)?.raw??null)!==c.baseRaw);
  function commit(next:Record<string,Draft>) {setPast(p=>[...p.slice(-49),drafts]);setFuture([]);setDrafts(next);}
  function update(partial:Partial<Draft>) {if(!draft||!boss)return;if(boss.raw&&boss.regionType!=='BOSSES'){setNotice('This entry belongs to another plugin category and is read-only here.');return;}if(!boss.raw&&boss.supportedBy?.length){setNotice('This boss is already covered by a grouped entry. Open that entry to edit coverage.');return;}commit({...drafts,[boss.id]:mergeDraft(draft,partial)});}
  function select(b:Boss) {setView('editor');setActive(b.id);setStep('coverage');window.scrollTo({top:0});if(!b.maps.length&&!b.locationsLoaded&&!busy)void loadLocations(b);}
  function openImport(){setInput('');setPaste('');setModal(true);}
  function navigateLibrary(nextFilter='new'){setView('discover');setFilter(nextFilter);setSearch('');setCategory('all');window.scrollTo({top:0});}
  async function run(label:string,fn:()=>Promise<void>){setBusy(label);setNotice('');try{await fn();}catch(e){setNotice((e as Error).message);}finally{setBusy('');}}
  async function sync(){await run('Syncing plugin',async()=>{
    const response=await fetch(`https://api.github.com/repos/${PLUGIN_REPO}/commits/master`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`GitHub returned ${response.status}. Your saved source and drafts are unchanged.`);const c=await response.json();
    const raw=await fetch(`https://raw.githubusercontent.com/${PLUGIN_REPO}/${c.sha}/${JAVA_PATH}`,{signal:AbortSignal.timeout(20000)});if(!raw.ok)throw new Error('Could not load plugin source.');const source=await raw.text();
    const entries=parseJava(source).entries.map(e=>({...e,maps:[],warnings:[],links:[],wikiTitle:e.name})) as Boss[];
    setSnapshot(s=>({...s,source,entries,baseCommit:c.sha,generatedAt:new Date().toISOString(),warnings:[]}));setNotice(`Synced ${entries.filter(e=>e.regionType==='BOSSES').length} boss entries. Draft baselines were preserved.`);
  });}
  async function discover(){await run('Loading Boss page',async()=>{
    const catalog=await fetchBossCatalog(await loadParser());
    setSnapshot(s=>({...s,candidates:catalog.bosses.map(b=>{const previous=s.candidates.find(p=>p.wikiTitle===b.wikiTitle);return {...b,maps:previous?.maps??[],links:previous?.links??[],locationsLoaded:previous?.locationsLoaded??false};}),catalog:{source:catalog.source,revision:catalog.revision,count:catalog.bosses.length,fetchedAt:new Date().toISOString()}}));
    setFilter('new');setCategory('all');setNotice(`Loaded ${catalog.bosses.length} bosses from the Boss page. Support is compared with the saved plugin source; Sync plugin to update that baseline.`);
  });}
  async function loadLocations(target:Boss=boss){if(!target)return;await run(`Loading ${target.name} locations`,async()=>{
    const result=await importWiki(await loadParser(),target.wikiTitle,target.locationTitles??[]);
    const next={...target,maps:result.maps,links:result.links,warnings:result.warnings,locationsLoaded:true};
    setImports(v=>[...v.filter(b=>b.id!==target.id),next]);setNotice(`Found ${result.maps.length} location suggestions for ${target.name}.`);
  });}
  async function doImport(){await run('Reading wiki',async()=>{
    const title=wikiTitle(input);const Parser=await loadParser();
    const result=paste.trim()?extractWiki(Parser,{title,text:paste,revision:null}):await importWiki(Parser,title);
    const existing=bosses.find(b=>b.wikiTitle.toLowerCase()===result.title.toLowerCase()||b.name.toLowerCase()===result.title.toLowerCase());
    const next:Boss={id:existing?.id??enumName(result.title),name:result.title,wikiTitle:result.title,regions:[],raw:null,deathType:'',optionalArgs:[],...result};
    setImports(v=>[...v.filter(b=>b.id!==next.id),next]);setActive(next.id);setStep('coverage');setView('editor');setModal(false);setNotice(`Imported ${next.maps.length} map suggestions. Review entrance and arena locations separately.`);
  });}
  function proposal(ids?:string[]){const selected=ids?changes.filter(c=>ids.includes(c.id)):changes;const p={version:1,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes:selected};validateProposal(p);if(conflicts.some(c=>selected.some(d=>d.id===c.id)))throw new Error('Resolve upstream conflicts before exporting.');return p;}
  function exportData(kind:string,ids?:string[]){try{
    const p=proposal(ids),after=applyProposal(snapshot.source,p);
    if(kind==='json'){saveFile('escape-crystal-proposal.json',JSON.stringify(p,null,2),'application/json');setNotice(`Proposal downloaded with ${p.changes.length} encounter${p.changes.length===1?'':'s'}.`);}
    if(kind==='patch'){saveFile('escape-crystal.patch',fullPatch(snapshot.source,after),'text/x-diff');setNotice('Patch downloaded.');}
    if(kind==='copy')navigator.clipboard.writeText(JSON.stringify(p)).then(()=>setNotice('Proposal copied. Paste it into the plugin workflow.')).catch(()=>setNotice('Clipboard unavailable; download the JSON proposal instead.'));
  }catch(e){setNotice((e as Error).message);}}
  let preview='';
  try {preview=draft&&boss?generateEntry({...draft,reviewed:true,entrance:draft.entrance?{...draft.entrance,reviewed:true}:undefined},boss.raw?boss:null)+',':'';} catch(e) {preview=(e as Error).message;}
  return <div className={`app-shell ${view==='editor'?'authoring-view':''}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar" inert={modal||review||help}><a className="brand" href="#" onClick={e=>{e.preventDefault();navigateLibrary();}}><Crystal/><span>Escape Crystal<small>COMMUNITY CONTENT EDITOR</small></span></a><div className="breadcrumb"><Icon name="compass" size={16}/><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{view==='discover'?(filter==='drafts'?'My drafts':'Discover'):boss?.name??'Encounter'}</strong></div><div className="top-actions"><span className="local-save"><span className="dot mint-dot"/> Local workspace</span><button className="primary" onClick={()=>setReview(true)}><Icon name="check" size={16}/> Review changes <span className="count">{changes.length}</span></button></div></header>
    <aside className="sidebar" inert={modal||review||help}><div className="sidebar-section-label">WORKSPACE</div><nav className="main-nav" aria-label="Workspace"><button className={view==='discover'&&filter!=='drafts'?'chosen':''} onClick={()=>navigateLibrary()}><Icon name="compass"/> Discover <Icon name="arrow" size={14}/></button><button className={view==='discover'&&filter==='drafts'?'chosen':''} onClick={()=>navigateLibrary('drafts')}><Icon name="file"/> My drafts <span className="nav-count">{changes.length}</span></button><button aria-label="Import encounter" onClick={openImport}><Icon name="plus"/><span className="wide-label">Import encounter</span><span className="narrow-label">Import</span></button></nav>
    <details className="mobile-tools"><summary>Workspace tools</summary><div><button disabled={!!busy} onClick={sync}><Icon name="sync" size={15}/> Sync plugin</button><button disabled={!!busy} onClick={discover}><Icon name="book" size={15}/> Refresh wiki catalog</button><button onClick={()=>setHelp(true)}><Icon name="compass" size={15}/> How to contribute</button></div></details><div className="sidebar-section-label">COLLECTIONS</div><nav className="collection-nav" aria-label="Boss collections">{[['Slayer bosses','feather'],['World bosses','map'],['Wilderness bosses','swords'],['Instanced bosses','layers'],['Quest bosses','book']].map(([label,icon])=><button key={label} className={view==='discover'&&category===label?'chosen':''} onClick={()=>{navigateLibrary('all');setCategory(label);if(label==='Quest bosses')setIncludeQuests(true);}}><Icon name={icon as IconName}/>{label.replace(' bosses','')}<span className="nav-count">{bosses.filter(b=>b.categories?.includes(label)).length}</span></button>)}</nav>
    <div className="sidebar-bottom"><div className="help-card"><Icon name="spark" size={23}/><h3>A way home starts with you.</h3><p>Your field notes can help protect the next adventurer.</p><button onClick={()=>setHelp(true)}>How to contribute <Icon name="arrow" size={14}/></button></div><div className="source-status"><span className={snapshot.baseCommit?'dot mint-dot':'dot gold'}/><strong>{snapshot.baseCommit?'Plugin source connected':'Reference mode'}</strong><small>{snapshot.generatedAt?`Snapshot · ${new Date(snapshot.generatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:'Sync to enable exports'}</small></div><button className="sync-button" disabled={!!busy} onClick={sync}><Icon name="sync" size={15}/> Sync plugin <span>{snapshot.baseCommit?.slice(0,7)}</span></button><button className="sync-button" disabled={!!busy} onClick={discover}><Icon name="book" size={15}/> Refresh wiki catalog</button><a className="sidebar-source" href={`https://github.com/${PLUGIN_REPO}/blob/master/${JAVA_PATH}`} target="_blank" rel="noreferrer">View plugin source <Icon name="external" size={12}/></a></div></aside>
    {notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}
    {busy&&<div className="busy" role="status">{busy}…</div>}
    <main inert={modal||review||help} id="main-content" tabIndex={-1} className={`workspace ${view==='discover'?'discovery-workspace':'editor-workspace'}`}>
      {view==='discover'?<Discovery bosses={filtered} onSelect={select} drafts={drafts} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} category={category} setCategory={setCategory} categories={categories} includeQuests={includeQuests} setIncludeQuests={setIncludeQuests} onImport={openImport} total={bosses.length} unsupported={unsupportedCount} supportedCount={bosses.length-unsupportedCount} ready={ready}/>:boss&&draft?<Authoring key={boss.id} boss={boss} draft={draft} snapshot={snapshot} saved={!!drafts[boss.id]} busy={busy} step={step} setStep={setStep} update={update} onLoad={()=>loadLocations()} onError={setNotice} onBack={()=>{setView('discover');window.scrollTo({top:0});}} onDiscard={()=>{const next={...drafts};delete next[boss.id];commit(next);}} canUndo={!!past.length} canRedo={!!future.length} onUndo={()=>{setFuture(f=>[drafts,...f]);setDrafts(past.at(-1)!);setPast(p=>p.slice(0,-1));}} onRedo={()=>{setPast(p=>[...p,drafts]);setDrafts(future[0]);setFuture(f=>f.slice(1));}} preview={preview} onExport={exportData} bosses={bosses} onSelect={select}/>:<p className="empty">Loading encounter…</p>}
    </main>
    {help&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="help-title" className="modal"><button className="close" onClick={()=>setHelp(false)} aria-label="Close guide">×</button><div className="eyebrow">THE CONTRIBUTOR’S FIELD GUIDE</div><h2 id="help-title">Give an encounter an escape plan.</h2><div className="guide-step"><Icon name="compass"/><div><h3>Find a boss</h3><p>Choose an encounter that needs coverage, or import a page from the OSRS Wiki.</p></div></div><div className="guide-step"><Icon name="map"/><div><h3>Check the map</h3><p>Load wiki locations. Select the arena’s regions and configure the entrance if needed. Confirm the coordinates and death behavior in game.</p></div></div><div className="guide-step"><Icon name="check"/><div><h3>Review and share</h3><p>Mark your coverage reviewed, then use Review changes to download a patch or proposal for the maintainer.</p></div></div><p className="guide-note">Drafts stay in this browser. Export a proposal to keep a portable copy. Nothing is submitted automatically.</p><button className="primary wide" onClick={()=>{setHelp(false);navigateLibrary();}}>Find an encounter <Icon name="arrow" size={16}/></button></section></div>}
    {modal&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="import-title" className="modal"><button className="close" onClick={()=>setModal(false)} aria-label="Close import">×</button><div className="eyebrow">ADD CONTENT</div><h2 id="import-title">Start with a wiki page</h2><p>Import a boss and inspect its linked location pages.</p><label className="field">Wiki title or URL<input autoFocus value={input} onChange={e=>setInput(e.target.value)} placeholder="Shellbane gryphon"/></label><details><summary>Paste wikitext instead</summary><p className="muted">Use the wiki’s source editor if browser requests are blocked.</p><textarea aria-label="Wikitext" rows={8} value={paste} onChange={e=>setPaste(e.target.value)} placeholder="{{Map|x=3179|y=8876}}"/></details><button className="primary wide" disabled={!!busy||!input.trim()} onClick={doImport}>{busy||'Import locations →'}</button></section></div>}
    {review&&<ReviewQueue drafts={changes} snapshot={snapshot} onClose={()=>setReview(false)} onEdit={id=>{const target=bosses.find(b=>b.id===id);if(target){select(target);setStep('review');setReview(false);}}} onExport={exportData}/>}
  </div>;
}

