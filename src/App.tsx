import { useEffect, useMemo, useState } from 'react';
import EncounterMaps from './EncounterMaps';
import Discovery from './Discovery';
import {suggestedArenaRegions,encounterLocations} from './core/encounter.mjs';
import { buildLibrary } from './core/library.mjs';
import { fetchBossCatalog } from './core/catalog.mjs';
import EntranceEditor from './Entrance';
import {CoveragePanel,SourcesPanel} from './Inspector';
import { loadParser } from './parser';
import { parseJava, enumName, generateEntry } from './core/java.mjs';
import { regionOrigin, parseIds, regionId } from './core/coordinates.mjs';
import { importWiki, extractWiki, wikiTitle, wikiUrl } from './core/wiki.mjs';
import { applyProposal, validateProposal, overlapWarnings, fullPatch, PLUGIN_REPO, JAVA_PATH } from './core/proposal.mjs';
import type { Boss, Draft, Snapshot } from './types';

const EMPTY:Snapshot={version:1,generatedAt:null,baseCommit:null,source:'',entries:[],candidates:[],warnings:[]};
const STORAGE='escape-crystal-editor:v1';
function draftOf(b:Boss):Draft {return {id:b.id,name:b.name,regions:suggestedArenaRegions(b),entranceRegion:encounterLocations(b).entrance[0]?.region,deathType:b.deathType,baseRaw:b.raw,reviewed:false};}
function saveFile(name:string,text:string,type='text/plain') { const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export default function App() {
  const [snapshot,setSnapshot]=useState<Snapshot>(EMPTY),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[imports,setImports]=useState<Boss[]>([]);
  const [active,setActive]=useState('BOSS_SHELLBANE_GRYPHON'),[search,setSearch]=useState(''),[filter,setFilter]=useState('new');
  const [view,setView]=useState('discover'),[includeQuests,setIncludeQuests]=useState(false);
  const [tab,setTab]=useState('coverage'),[category,setCategory]=useState('all');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[modal,setModal]=useState(false),[review,setReview]=useState(false);
  const [input,setInput]=useState(''),[paste,setPaste]=useState(''),[manual,setManual]=useState('');
  const [ready,setReady]=useState(false),[past,setPast]=useState<Record<string,Draft>[]>([]),[future,setFuture]=useState<Record<string,Draft>[]>([]);
  useEffect(()=>{
    if(!modal&&!review)return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,summary')??[]).filter(e=>e.getClientRects().length>0);
    focusable()[0]?.focus();
    const listener=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setModal(false);setReview(false);}
      if(event.key==='Tab'){const elements=focusable(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);previous?.focus();};
  },[modal,review]);
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
  const filtered=bosses.filter(b=>(includeQuests||!b.categories?.some(c=>/quest/i.test(c)))&&b.name.toLowerCase().includes(search.toLowerCase())&&(category==='all'||b.categories?.includes(category))&&(filter==='all'||filter==='supported'&&supported(b)||filter==='new'&&!supported(b)||filter==='drafts'&&drafts[b.id]||filter==='unresolved'&&!b.maps.length&&!b.raw));
  const changes=Object.values(drafts), conflicts=changes.filter(c=>(snapshot.entries.find(b=>b.id===c.id)?.raw??null)!==c.baseRaw);
  const overlaps=overlapWarnings(changes,snapshot.entries);
  function commit(next:Record<string,Draft>) {setPast(p=>[...p.slice(-49),drafts]);setFuture([]);setDrafts(next);}
  function update(partial:Partial<Draft>) {if(!draft||!boss)return;if(boss.raw&&boss.regionType!=='BOSSES'){setNotice('This entry belongs to another plugin category and is read-only here.');return;}if(!boss.raw&&boss.supportedBy?.length){setNotice('This boss is already covered by a grouped entry. Open that entry to edit coverage.');return;}commit({...drafts,[boss.id]:{...draft,...partial,reviewed:partial.reviewed??false}});}
  function select(b:Boss) {setView('editor');setActive(b.id);setManual('');}
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
  async function loadLocations(){if(!boss)return;const target=boss;await run(`Loading ${target.name} locations`,async()=>{
    const result=await importWiki(await loadParser(),target.wikiTitle,target.locationTitles??[]);
    const next={...target,maps:result.maps,links:result.links,warnings:result.warnings,locationsLoaded:true};
    setImports(v=>[...v.filter(b=>b.id!==target.id),next]);setNotice(`Found ${result.maps.length} location suggestions for ${target.name}.`);
  });}
  async function doImport(){await run('Reading wiki',async()=>{
    const title=wikiTitle(input);const Parser=await loadParser();
    const result=paste.trim()?extractWiki(Parser,{title,text:paste,revision:null}):await importWiki(Parser,title);
    const existing=bosses.find(b=>b.wikiTitle.toLowerCase()===result.title.toLowerCase()||b.name.toLowerCase()===result.title.toLowerCase());
    const next:Boss={id:existing?.id??enumName(result.title),name:result.title,wikiTitle:result.title,regions:[],raw:null,deathType:'',optionalArgs:[],...result};
    setImports(v=>[...v.filter(b=>b.id!==next.id),next]);setActive(next.id);setView('editor');setModal(false);setNotice(`Imported ${next.maps.length} map suggestions. Review entrance and arena locations separately.`);
  });}
  function proposal(){const p={version:1,repository:PLUGIN_REPO,baseCommit:snapshot.baseCommit,changes};validateProposal(p);if(conflicts.length)throw new Error('Resolve upstream conflicts before exporting.');return p;}
  function exportData(kind:string){try{
    const p=proposal(),after=applyProposal(snapshot.source,p);
    if(kind==='json')saveFile('escape-crystal-proposal.json',JSON.stringify(p,null,2),'application/json');
    if(kind==='patch')saveFile('escape-crystal.patch',fullPatch(snapshot.source,after),'text/x-diff');
    if(kind==='copy')navigator.clipboard.writeText(JSON.stringify(p)).then(()=>setNotice('Proposal copied. Paste it into the plugin workflow.')).catch(()=>setNotice('Clipboard unavailable; download the JSON proposal instead.'));
  }catch(e){setNotice((e as Error).message);}}
  let preview='';
  try {preview=draft&&boss?generateEntry(draft,boss.raw?boss:null)+',':'';} catch(e) {preview=(e as Error).message;}
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setView('discover');}}><span className="crystal" aria-hidden="true">◇</span><span>ESCAPE CRYSTAL<small>Content editor</small></span></a><span className="workspace-label">REGION WORKSPACE <span> / </span> OSRS</span><div className="top-actions"><button disabled={!!busy} onClick={sync}>↻ Sync plugin</button><button className="primary" onClick={()=>setReview(true)}>Review changes <span className="count">{changes.length}</span></button></div></header>
    <div className="statusbar"><span><span className={`dot ${snapshot.baseCommit?'cyan':'gold'}`}/>{snapshot.baseCommit?`Source ${snapshot.baseCommit.slice(0,7)} · ${new Date(snapshot.generatedAt!).toLocaleString()}`:'Reference mode · sync plugin to enable exports'}</span><a href={`https://github.com/${PLUGIN_REPO}/blob/master/${JAVA_PATH}`} target="_blank" rel="noreferrer">View plugin source ↗</a></div>
    {notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}
    {busy&&<div className="busy" role="status">{busy}…</div>}
    <main className={`workspace ${view==='discover'?'discovery-workspace':'editor-workspace'}`}>
      <aside className="sidebar"><div className="sidebar-title"><h2>Boss library</h2><span>{snapshot.catalog?.count??bosses.length}</span></div><button className="catalog-sync" disabled={!!busy} onClick={discover}>↻ Load all wiki bosses</button><p className="catalog-summary">{snapshot.baseCommit?`${unsupportedCount} unsupported`:'Support not synced'} · <a href="https://oldschool.runescape.wiki/w/Boss" target="_blank" rel="noreferrer">Boss page ↗</a></p><button className="import-button" onClick={()=>{setInput('');setPaste('');setModal(true);}}>＋ Import wiki page</button><label className="search"><span className="sr-only">Search bosses</span><input placeholder="Find a boss…" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="filters">{[['new','Unsupported'],['all','All'],['supported','Supported'],['drafts','Drafts'],['unresolved','Unresolved']].map(([v,l])=><button key={v} className={filter===v?'chosen':''} onClick={()=>setFilter(v)}>{l}</button>)}</div>
      <label className="category-filter"><span className="sr-only">Boss category</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All boss categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="quest-toggle"><input type="checkbox" checked={includeQuests} onChange={e=>setIncludeQuests(e.target.checked)}/> Include quest bosses</label><div className="boss-list">{filtered.map(b=><button key={b.id} className={`boss-row ${boss?.id===b.id?'active':''}`} onClick={()=>select(b)}><span className={`boss-symbol ${supported(b)?'supported':''}`}>{supported(b)?'✓':'◇'}</span><span><strong>{b.name}</strong><small>{drafts[b.id]?'Draft saved':supported(b)?`Covered by ${b.supportedBy?.[0]?.name??b.name}`:b.categories?.[0]??(b.maps.length?`${b.maps.length} wiki locations`:'Needs location')}</small></span>{drafts[b.id]&&<span className="draft-dot"/>}</button>)}{!filtered.length&&<p className="empty">No matches. Import a wiki page to add content.</p>}</div><div className="sidebar-foot"><span className="dot cyan"/> Drafts saved on this browser<small>64×64 regions · 8×8 chunks</small></div></aside>
      {view==='discover'?<Discovery bosses={filtered} onSelect={select}/>:<><section className="editor"><button className="back-discovery" onClick={()=>setView('discover')}>← Discover bosses</button>{boss&&draft?<><div className="editor-heading"><div><div className="eyebrow">{supported(boss)?'SUPPORTED CONTENT':'UNSUPPORTED BOSS'}</div><h1>{draft.name}</h1><p>{boss.raw?'Review coverage against the current plugin.':'Start from wiki locations. Select the area that needs coverage.'}</p></div><a className="wiki-link" href={wikiUrl(boss.wikiTitle)} target="_blank" rel="noreferrer">OSRS Wiki ↗</a></div>
      <div className="editor-actions"><button disabled={!!busy} onClick={loadLocations}>↻ Load wiki locations</button><button disabled={!past.length} onClick={()=>{setFuture(f=>[drafts,...f]);setDrafts(past.at(-1)!);setPast(p=>p.slice(0,-1));}}>↶ Undo</button><button disabled={!future.length} onClick={()=>{setPast(p=>[...p,drafts]);setDrafts(future[0]);setFuture(f=>f.slice(1));}}>↷ Redo</button><span>{boss.categories?.join(' / ')}</span></div>
      {!!boss.supportedBy?.length&&!boss.raw&&<div className="group-coverage">Covered by {boss.supportedBy.map(s=><span key={s.id}>{s.name}{bosses.some(b=>b.id===s.id)&&<button onClick={()=>setActive(s.id)}>Edit entry →</button>}</span>)}. Shared encounter coverage is counted as supported.</div>}
      <EncounterMaps key={boss.id} boss={boss} draft={draft} update={update} onError={setNotice} onLoad={loadLocations}/>
      </>:<div className="empty">{ready?'Import a wiki page or sync the plugin to begin.':'Loading workspace…'}</div>}</section>
      <aside className="details inspector">{boss&&draft&&<><div className="inspector-label">ENCOUNTER SETUP</div><div className="detail-tabs" role="tablist" aria-label="Encounter settings">{['coverage','entrance','sources'].map(t=><button role="tab" id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={tab===t} tabIndex={tab===t?0:-1} onKeyDown={e=>{const tabs=['coverage','entrance','sources'];let index=tabs.indexOf(t);if(e.key==='ArrowRight')index=(index+1)%3;else if(e.key==='ArrowLeft')index=(index+2)%3;else if(e.key==='Home')index=0;else if(e.key==='End')index=2;else return;e.preventDefault();setTab(tabs[index]);document.getElementById(`tab-${tabs[index]}`)?.focus();}} className={tab===t?'chosen':''} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
      <div key={`${boss.id}-coverage`} id="panel-coverage" role="tabpanel" aria-labelledby="tab-coverage" hidden={tab!=='coverage'}><CoveragePanel draft={draft} update={update} deaths={[...new Set(snapshot.entries.map(b=>b.deathType))]} preview={preview} canDiscard={!!drafts[boss.id]} onDiscard={()=>{const next={...drafts};delete next[boss.id];commit(next);}}/></div>
      <div key={`${boss.id}-sources`} id="panel-sources" role="tabpanel" aria-labelledby="tab-sources" hidden={tab!=='sources'}><SourcesPanel boss={boss}/></div>
      <div key={`${boss.id}-entrance`} id="panel-entrance" role="tabpanel" aria-labelledby="tab-entrance" hidden={tab!=='entrance'}><EntranceEditor boss={boss} draft={draft} update={update} onError={setNotice}/></div>
      </>}</aside></>}
    </main>
    {modal&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="import-title" className="modal"><button className="close" onClick={()=>setModal(false)} aria-label="Close import">×</button><div className="eyebrow">ADD CONTENT</div><h2 id="import-title">Start with a wiki page</h2><p>Import a boss and inspect its linked location pages.</p><label className="field">Wiki title or URL<input autoFocus value={input} onChange={e=>setInput(e.target.value)} placeholder="Shellbane gryphon"/></label><details><summary>Paste wikitext instead</summary><p className="muted">Use the wiki’s source editor if browser requests are blocked.</p><textarea aria-label="Wikitext" rows={8} value={paste} onChange={e=>setPaste(e.target.value)} placeholder="{{Map|x=3179|y=8876}}"/></details><button className="primary wide" disabled={!!busy||!input.trim()} onClick={doImport}>{busy||'Import locations →'}</button></section></div>}
    {review&&<div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="review-title" className="modal review-modal"><button className="close" onClick={()=>setReview(false)} aria-label="Close review">×</button><div className="eyebrow">CONTRIBUTION REVIEW</div><h2 id="review-title">{changes.length} content change{changes.length!==1?'s':''}</h2><p>Generate a patch or a proposal for the maintainer workflow. Nothing is sent automatically.</p>{changes.map(c=><article className="review-entry" key={c.id}><strong>{c.name}</strong><span className="badge">{c.reviewed?'Reviewed':'Needs review'}</span><p>{c.regions.join(', ')||'No regions selected'}</p>{conflicts.some(x=>x.id===c.id)&&<div className="warning"><strong>Upstream conflict</strong><details><summary>Original entry</summary><pre>{c.baseRaw??'New entry'}</pre></details><details><summary>Current plugin entry</summary><pre>{snapshot.entries.find(b=>b.id===c.id)?.raw??'No longer present'}</pre></details><p>Compare your draft above, then discard and reapply it against current source.</p></div>}</article>)}{overlaps.map((w,i)=><p className="warning" key={i}>{w}</p>)}<div className="export-actions"><button onClick={()=>exportData('patch')}>Download patch</button><button onClick={()=>exportData('json')}>Download proposal</button><button className="primary" onClick={()=>exportData('copy')}>Copy proposal</button></div><a className="related" href={`https://github.com/${PLUGIN_REPO}/actions/workflows/content-proposal.yml`} target="_blank" rel="noreferrer">Open maintainer workflow ↗</a><p className="muted">Install the supplied workflow in the plugin repository first. Paste the copied proposal into its “proposal” input to create a PR.</p></section></div>}
  </div>;
}

