import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import BossPortrait, {BossImageSource, DungeonMapReference} from './BossPortrait';
import EncounterMaps from './EncounterMaps';
import OverviewMapSquares from './OverviewMapSquares';
import EntranceEditor from './Entrance';
import EntranceModelReferences from './EntranceModelReferences';
import {CoveragePanel, SourcesPanel} from './Inspector';
import {Icon} from './Icons';
import {applySection, changedSections, editableDraft, editingBaseline, sectionUnchanged} from './core/editing.mjs';
import {entranceOverlay, exportProblem, mergeDraft} from './core/authoring.mjs';
import {generateEncounter, sourceEntry, encounterCoverage} from './core/encounter-export.mjs';
import {validateProposal, PLUGIN_REPO, overlapWarnings} from './core/proposal.mjs';
import {parseIds, chunkOrigin, regionId} from './core/coordinates.mjs';
import {originalEntranceChunks, mergeEvidenceContext} from './core/encounter.mjs';
import type {Boss, Draft, EvidenceContexts, Snapshot} from './types';
import './editing.css';

type Section = 'details' | 'coverage' | 'entrance';
type Context = EvidenceContexts[string];
export type EditNavigationGuard = ((action:()=>void)=>void) | null;
type Props = {
  boss:Boss; draft:Draft; snapshot:Snapshot; saved:boolean; busy:string;
  onApply:(draft:Draft, context:Context)=>void; context:Context;
  onBack:()=>void; onDiscard:()=>void; onUndo:()=>void; onRedo:()=>void;
  canUndo:boolean; canRedo:boolean; onLoad:()=>void; onError:(message:string)=>void;
  onExport:(kind:string, ids:string[])=>void; onCreatePR?:(ids:string[])=>void;
  registerGuard:(guard:EditNavigationGuard)=>void; onStartFresh:()=>void;
};
const labels:Record<Section,string> = {details:'Details', coverage:'Coverage', entrance:'Entrance'};
const deathLabels:Record<string,string> = {UNSAFE:'Unsafe death', UNSAFE_HCGIM:'Unsafe only for HCGIM', SAFE:'Safe death'};
const list = (values:unknown[]|undefined, empty='None') => values?.length ? values.join(', ') : empty;
const priority = (value:string) => value === 'PRIORITIZED_WITH_HIGHLIGHT' ? 'Prioritized · left-click entry' : 'Deprioritized · right-click entry';
const sameContext = (a:Context,b:Context) => JSON.stringify(a) === JSON.stringify(b);

function values(draft:Draft, section:Section):[string,string][] {
  const current = editableDraft(draft) as Draft;
  const baseline = editingBaseline(draft.baseRaw,draft.entranceBaseRaw);
  if (section === 'details') return [['Display name',draft.name],['Death behavior',deathLabels[draft.deathType] ?? draft.deathType]];
  if (section === 'coverage') return [['Regions',list(current.regions)],['Chunk restrictions',baseline.coverageReason && !current.chunks ? 'Preserved in source' : list(current.chunks,'Whole regions')]];
  const e = current.entrance;
  if (!e && !baseline.entrance.raw) return [['Detection','No entrance configured']];
  const knownPriority = e || /EscapeCrystalNotifyRegionEntranceOverlayType\.(PRIORITIZED_WITH_HIGHLIGHT|DEPRIORITIZED_WITH_HIGHLIGHT)/.test(baseline.entrance.raw??'');
  return [['Entrance area',current.entranceDangerous===false?'Not dangerous · region notifications disabled':current.entranceDangerous===true?'Dangerous':'Existing coverage preserved'],['Entrance coverage chunks',list(current.entranceNotifyChunks,'Whole entrance area')],['Priority',knownPriority ? priority(entranceOverlay(current)) : 'Preserved in source'],
    ['Detection IDs',e ? list(e.ids) : 'Special configuration · preserved'],
    ['Interaction',e ? e.objectType.replaceAll('_',' ').toLowerCase() : 'Preserved in source'],
    ['Approach / plane',e ? `${e.direction.replaceAll('_',' ').toLowerCase() || 'Any direction'} / ${e.plane.replaceAll('_',' ').toLowerCase() || 'Any plane'}` : 'Preserved in source'],
    ['Entrance chunks',e ? list(e.chunks,'No restriction') : 'Preserved in source'],
    ...(draft.entranceRegion !== undefined ? [['Selected region',String(draft.entranceRegion)] as [string,string]] : [])];
}

function ValueList({rows}:{rows:[string,string][]}) {
  return <dl className="edit-values">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function EntranceChunks({draft,update,onError}:{draft:Draft;update:(change:Partial<Draft>)=>void;onError:(error:string)=>void}) {
  const [text,setText]=useState(draft.entrance?.chunks.join(', ')??'');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(document.activeElement!==input.current)setText(draft.entrance?.chunks.join(', ')??'');},[draft.entrance?.chunks]);
  return <label className="field">Entrance chunk IDs<input ref={input} value={text} placeholder="No restriction" onChange={event=>{
    setText(event.target.value);
    try {const chunks=parseIds(event.target.value,'chunk');update({entrance:{overlay:entranceOverlay(draft),direction:'',plane:'',objectType:'GAME_OBJECT',ids:[],...draft.entrance,chunks}});}
    catch(error){onError((error as Error).message);}
  }}/></label>;
}

export default function EncounterEditor(p:Props) {
  const baseline = useMemo(()=>editingBaseline(p.draft.baseRaw,p.draft.entranceBaseRaw),[p.draft.baseRaw,p.draft.entranceBaseRaw]);
  const sourceBoss = useMemo(()=>({...p.boss,...baseline.entry,optionalArgs:(sourceEntry(p.draft.entranceBaseRaw)??baseline.entry).optionalArgs}) as Boss,[p.boss,baseline]);
  const dungeon = baseline.entry.regionType === 'DUNGEONS';
  const sections:Section[] = dungeon ? ['details','coverage'] : ['details','coverage','entrance'];
  const [section,setSection] = useState<Section|null>(null);
  const [working,setWorking] = useState<Draft|null>(null);
  const [context,setContext] = useState<Context>({});
  const [startContext,setStartContext] = useState<Context>({});
  const [contextEdited,setContextEdited] = useState(false);
  const mapInteracted = useRef(false);
  const [entranceTab,setEntranceTab] = useState<'area'|'object'>('area');
  const [review,setReview] = useState(false), [sources,setSources] = useState(false);
  const [collapsed,setCollapsed] = useState<Partial<Record<Section,boolean>>>({});
  const [contributionCollapsed,setContributionCollapsed] = useState(false);
  const [error,setError] = useState(''), [status,setStatus] = useState('');
  const [pending,setPending] = useState<(()=>void)|null>(null);
  const heading = useRef<HTMLHeadingElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLElement>(null);
  const returnSection = useRef<Section|null>(null);
  const changed = changedSections(p.draft) as Section[];
  const dirty = !!section && !!working && (!sectionUnchanged(p.draft,working,section) || contextEdited && !sameContext(context,startContext));
  const issue = p.saved ? exportProblem(p.snapshot,[p.draft]) : '';
  const entranceReason = baseline.entranceReason;
  const priorityKnown = !baseline.entrance.raw || /EscapeCrystalNotifyRegionEntranceOverlayType\.(PRIORITIZED_WITH_HIGHLIGHT|DEPRIORITIZED_WITH_HIGHLIGHT)/.test(baseline.entrance.raw);

  useLayoutEffect(()=>{
    p.registerGuard(dirty ? action=>setPending(()=>action) : null);
    return ()=>p.registerGuard(null);
  },[dirty,p.registerGuard]);
  useEffect(()=>{
    if (!dirty) return;
    const beforeUnload = (event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>window.removeEventListener('beforeunload',beforeUnload);
  },[dirty]);
  useEffect(()=>{if(pending)dialog.current?.showModal();else dialog.current?.close();},[pending]);
  useLayoutEffect(()=>{
    if(section || review) heading.current?.focus();
    else if(returnSection.current)root.current?.querySelector<HTMLButtonElement>(`[data-edit-section="${returnSection.current}"]`)?.focus();
  },[section,review]);

  function open(next:Section) {
    returnSection.current = next;
    setWorking(structuredClone(editableDraft(p.draft)) as Draft);
    setContext(structuredClone(p.context));setStartContext(structuredClone(p.context));
    setContextEdited(false);mapInteracted.current=false;
    setSection(next);setError('');setStatus('');setEntranceTab('area');setReview(false);
  }
  function update(change:Partial<Draft>) {
    setError('');
    setWorking(previous=>{
      if(!previous)return previous;
      // Restore the full source configuration, rather than displaying empty IDs.
      if('entrance' in change && change.entrance === undefined && baseline.entrance.value) {
        return {...previous,entrance:structuredClone(baseline.entrance.value),entranceOverlay:baseline.entrance.value.overlay};
      }
      return mergeDraft(previous,change);
    });
  }
  function cancel() {setSection(null);setWorking(null);setError('');}
  function restoreOriginal() {
    if(!section)return;
    setWorking(editableDraft(applySection(p.draft,editableDraft(baseline.draft),section)) as Draft);
    setContext(structuredClone(startContext));setContextEdited(false);mapInteracted.current=false;setError('');
  }
  function apply() {
    if(!working || !section)return true;
    if(!dirty){cancel();return true;}
    const next = applySection(p.draft,working,section) as Draft;
    try {
      if(section==='entrance'&&!next.entrance&&!baseline.entrance.raw)throw new Error('Choose entrance object or NPC IDs before applying entrance settings.');
      validateProposal({version:2,repository:PLUGIN_REPO,baseCommit:'0'.repeat(40),changes:[next]});
      generateEncounter(next,baseline.entry);
      p.onApply(next,context);
      setStatus(`${labels[section]} changes saved in this browser.`);
      cancel();return true;
    } catch(e) {setError((e as Error).message);return false;}
  }
  function useSuggestionAndReview(change:Partial<Draft>,location:NonNullable<Context['entrance']>) {
    if(!working)return;
    const next=applySection(p.draft,mergeDraft(working,change),'entrance') as Draft;
    validateProposal({version:2,repository:PLUGIN_REPO,baseCommit:'0'.repeat(40),changes:[next]});
    generateEncounter(next,baseline.entry);
    p.onApply(next,{...context,entrance:location});
    cancel();setReview(true);
  }
  function navigate(action:()=>void) {if(dirty)setPending(()=>action);else action();}
  function saveMapContext(kind:'arena'|'entrance',location:Context['arena']) {
    setContext(previous=>mergeEvidenceContext(previous,kind,location));
    if(mapInteracted.current)setContextEdited(true);
  }
  function resolvePending(save:boolean) {
    if(save && !apply()) {setPending(null);return;}
    const action = pending;setPending(null);cancel();action?.();
  }
  const effective = editableDraft(p.draft) as Draft;
  const entranceChunks:number[]=effective.entrance?.chunks??originalEntranceChunks(sourceBoss.optionalArgs);
  const entranceRegions=(()=>{
    try {const regions=encounterCoverage(p.draft,baseline.entry).entranceRegions;if(regions.length)return regions;}
    catch { /* Incomplete edits retain the source map; export reports the error. */ }
    return (effective.entrance||baseline.entrance.raw)?(sourceEntry(p.draft.entranceBaseRaw)??baseline.entry).regions:[];
  })();
  const preview = (()=>{try{return generateEncounter(p.draft,baseline.entry)+',';}catch(e){return (e as Error).message;}})();

  return <section ref={root} className="encounter-edit" aria-label="Edit existing encounter">
    <header className="edit-header">
      <button className="back-discovery" onClick={()=>navigate(p.onBack)}>← Encounter library</button>
      <div className="edit-identity"><BossPortrait boss={p.boss} compact/><div><span className="eyebrow">EDITING EXISTING ENCOUNTER</span><h1>{p.draft.name}</h1></div><span className="edit-save-state"><Icon name={p.saved?'file':'shield'} size={16}/>{p.saved?'Local draft saved':'Current plugin settings'}</span></div>
      <div className="edit-toolbar"><p>Choose what to change. Everything else stays as it is.</p><div><button disabled={!p.canUndo || !!section} onClick={p.onUndo}>↶ Undo</button><button disabled={!p.canRedo || !!section} onClick={p.onRedo}>↷ Redo</button><button aria-pressed={sources} onClick={()=>setSources(v=>!v)}><Icon name="book" size={16}/> Sources</button></div></div>
    </header>
    {!section&&!review&&<div className="edit-fresh-option"><div><strong>Want to set it up again?</strong><p>Start the guided flow with fresh defaults and empty selections. Your contribution will update this encounter. Undo restores your previous draft.</p></div><button onClick={()=>navigate(p.onStartFresh)}>Start from scratch <Icon name="arrow" size={14}/></button></div>}
    {sources&&<div className="edit-sources"><BossImageSource title={p.boss.wikiTitle} dungeon={dungeon}/><SourcesPanel boss={sourceBoss}/><button disabled={!!p.busy} onClick={p.onLoad}>{p.busy?'Loading…':'Refresh wiki locations'}</button></div>}
    <p className="sr-only" role="status">{status}</p>
    {section&&working ? <div className="edit-session">
      <div className="edit-section-heading"><div><span className="eyebrow">{labels[section].toUpperCase()}</span><h2 ref={heading} tabIndex={-1}>Edit {labels[section].toLowerCase()}</h2><p>Changes stay here until you apply them to your draft.</p></div><span className="edit-session-state">{dirty?'Unapplied changes':'No changes yet'}</span></div>
      {section==='details' ? <div className="edit-details-form"><label className="field">Display name<input value={working.name} maxLength={160} onChange={e=>update({name:e.target.value})}/></label><fieldset><legend>Death behavior</legend><p>Who loses hardcore status?</p>{Object.entries(deathLabels).map(([value,label])=><label className={`edit-death-choice ${working.deathType===value?'selected':''}`} key={value}><input type="radio" name="edit-death" value={value} checked={working.deathType===value} onChange={()=>update({deathType:value})}/><span><strong>{label}</strong><small>{value==='UNSAFE'?'All hardcore accounts.':value==='UNSAFE_HCGIM'?'Hardcore Group Ironman accounts only.':'No hardcore accounts.'}</small></span></label>)}</fieldset></div>
      : section==='coverage' ? <div className="edit-map-layout" onPointerDownCapture={()=>{mapInteracted.current=true;}} onKeyDownCapture={()=>{mapInteracted.current=true;}}><EncounterMaps boss={sourceBoss} draft={working} update={update} focus="arena" onLoad={p.onLoad} onError={p.onError} loading={!!p.busy} evidenceContext={context} onEvidenceContext={saveMapContext}/><aside><CoveragePanel draft={working} update={update} guided editing deaths={[]} preview="" onDiscard={()=>{}} canDiscard={false}/>{dungeon&&<DungeonMapReference title={p.boss.wikiTitle}/>}</aside></div>
      : <>
        <label className="field edit-priority">Entrance priority<select aria-label="Entrance priority" aria-describedby="edit-priority-help" disabled={!priorityKnown} value={priorityKnown?entranceOverlay(working):''} onChange={e=>update({entranceOverlay:e.target.value})}>{!priorityKnown&&<option value="">Preserved in source</option>}<option value="DEPRIORITIZED_WITH_HIGHLIGHT">Deprioritized · right-click entry</option><option value="PRIORITIZED_WITH_HIGHLIGHT">Prioritized · left-click entry</option></select><small id="edit-priority-help">When an Escape Crystal is missing or inactive. Both options highlight the entrance.</small></label>
        {entranceReason ? <div className="edit-preserved"><Icon name="shield"/><p>{entranceReason} {priorityKnown?'You can still change its priority.':''}</p><details><summary>Existing entrance settings</summary><pre>{baseline.entrance.raw ?? baseline.entry.optionalArgs.join(',\n')}</pre></details></div>
        : <><nav className="edit-entrance-tabs" aria-label="Entrance editing views"><button aria-pressed={entranceTab==='area'} onClick={()=>setEntranceTab('area')}>Area</button><button aria-pressed={entranceTab==='object'} onClick={()=>setEntranceTab('object')}>Object & interaction</button></nav>
        {entranceTab==='area' ? <div className="edit-map-layout" onPointerDownCapture={()=>{mapInteracted.current=true;}} onKeyDownCapture={()=>{mapInteracted.current=true;}}><EncounterMaps boss={sourceBoss} draft={working} update={update} focus="entrance" onQuickReview={useSuggestionAndReview} onLoad={p.onLoad} onError={p.onError} loading={!!p.busy} evidenceContext={context} onEvidenceContext={saveMapContext}/><aside className="edit-area-fields"><h3>Entrance area</h3><p>Current entrance chunks are preserved across every region they cover. Select a region when changing the area.</p><label className="field">Selected region<input type="number" min={0} max={65535} value={working.entranceRegion??''} placeholder="Use existing coverage" onChange={e=>update({entranceRegion:e.target.value===''?undefined:Number(e.target.value)})}/></label><EntranceChunks draft={working} update={update} onError={setError}/><p className="muted">Map plane controls the reference view. Set a detection plane under Object & interaction.</p></aside></div>
        : <EntranceEditor editing boss={sourceBoss} draft={working} update={update} onError={p.onError} imageSelection={context.entranceImage} onImageSelect={id=>{setContext(v=>({...v,entranceImage:id}));setContextEdited(true);}} onEditArea={()=>setEntranceTab('area')}/>}
        </>}
      </>}
      {error&&<p className="warning edit-error" role="alert">{error}</p>}
      <footer className="edit-session-footer"><div><button className="text-button" onClick={restoreOriginal}>Restore original settings</button></div><div><button onClick={cancel}>Cancel</button><button className="primary" disabled={!dirty || !!error} onClick={apply}>Apply changes <Icon name="check" size={16}/></button></div></footer>
    </div> : <>
      <div className="edit-overview-heading"><div><h2 ref={heading} tabIndex={-1}>{review?'Review your changes':'Encounter overview'}</h2><p>{changed.length?`${changed.length} ${changed.length===1?'section has':'sections have'} changes from the original plugin entry.`:'Start with the section you want to update.'}</p></div>{review&&<button onClick={()=>setReview(false)}>Back to overview</button>}</div>
      <div className="edit-overview-layout"><div className="edit-records">{sections.map(id=>{
        const modified=changed.includes(id);
        const rows=values(p.draft,id), original=values(baseline.draft as Draft,id);
        const changedRows=[...new Set([...original.map(([key])=>key),...rows.map(([key])=>key)])].filter(key=>original.find(([k])=>k===key)?.[1]!==rows.find(([k])=>k===key)?.[1]);
        const blocked=id==='coverage'?baseline.coverageReason:'';
        return <section key={id} className={`edit-record ${modified?'is-modified':''} ${collapsed[id]?'is-collapsed':''}`}><div className="edit-record-heading"><h3><button className="edit-collapse-toggle" aria-expanded={!collapsed[id]} aria-controls={`overview-${id}`} onClick={()=>setCollapsed(previous=>({...previous,[id]:!previous[id]}))}><span className="edit-collapse-chevron" aria-hidden="true">›</span><Icon name={id==='details'?'file':id==='coverage'?'map':'layers'} size={19}/>{labels[id]}</button>{modified&&<span className="edit-change-label">Changed</span>}</h3><button data-edit-section={id} disabled={!!blocked} onClick={()=>open(id)}>{id==='entrance'&&!baseline.entrance.raw&&!effective.entrance?'Add entrance':`Edit ${labels[id].toLowerCase()}`} <Icon name="arrow" size={14}/></button></div>
          <div id={`overview-${id}`} hidden={!!collapsed[id]}>
          {!collapsed[id]&&id==='coverage'&&<OverviewMapSquares regions={effective.regions} chunks={effective.chunks} locations={sourceBoss.maps} context={p.context.arena} label="Coverage"/>}
          {!collapsed[id]&&id==='entrance'&&entranceRegions.length>0&&<OverviewMapSquares regions={entranceRegions} chunks={effective.entranceNotifyChunks??entranceChunks} locations={sourceBoss.maps.filter(location=>location.role==='entrance')} context={p.context.entrance} label={effective.entranceDangerous===false?"Entrance coverage (region notifications disabled)":"Entrance notification coverage"}/>}
          <ValueList rows={rows.filter(([key])=>id==='coverage'?key!=='Regions':key!=='Selected region')}/>
          {blocked&&<p className="edit-preservation-note">{blocked}</p>}
          {id==='entrance'&&entranceReason&&<p className="edit-preservation-note">{entranceReason}</p>}
          {modified&&<div className="edit-comparison" aria-label={`${labels[id]} changes`}><div className="edit-comparison-head"><span>Original</span><span>Your changes</span></div>{changedRows.map(key=><div className="edit-comparison-row" key={key}><span><small>{key}</small>{original.find(([k])=>k===key)?.[1]??'Not selected'}</span><span><small>{key}</small>{rows.find(([k])=>k===key)?.[1]??'Not selected'}</span></div>)}{!changedRows.length&&<p>Entrance reference area updated.</p>}</div>}
          {!collapsed[id]&&id==='entrance'&&effective.entrance&&<EntranceModelReferences ids={effective.entrance.ids} objectType={effective.entrance.objectType} selection={p.context.entranceImage}/>}
          </div>
        </section>;
      })}</div><aside className="edit-review-card"><button className="edit-collapse-toggle edit-contribution-toggle" aria-expanded={!contributionCollapsed} aria-controls="overview-contribution" onClick={()=>setContributionCollapsed(value=>!value)}><span className="edit-collapse-chevron" aria-hidden="true">›</span><span className="eyebrow">YOUR CONTRIBUTION</span></button><h3>{changed.length?`${changed.length} ${changed.length===1?'section':'sections'} changed`:'No changes yet'}</h3><div id="overview-contribution" hidden={contributionCollapsed}><p>{review?'Check the changes against the original entry, then export your contribution.':'Applied changes are saved in this browser. Review them before sharing.'}</p>
      {!review?<button className="primary" disabled={!p.saved||!changed.length} onClick={()=>setReview(true)}>Review changes <Icon name="arrow" size={16}/></button>:<>{issue&&<p className="warning" role="status">{issue}</p>}{p.onCreatePR&&<button className="primary" disabled={!p.saved||!!issue||!changed.length} onClick={()=>p.onCreatePR?.([p.draft.id])}>Create pull request</button>}<button className={p.onCreatePR?'':'primary'} disabled={!p.saved||!!issue||!changed.length} onClick={()=>p.onExport('json',[p.draft.id])}>Download proposal</button><button disabled={!p.saved||!!issue||!changed.length} onClick={()=>p.onExport('patch',[p.draft.id])}>Download patch</button><button disabled={!p.saved||!!issue||!changed.length} onClick={()=>p.onExport('copy',[p.draft.id])}>Copy proposal</button></>}
      {p.saved&&<button className="text-button" onClick={()=>{p.onDiscard();setStatus('Draft discarded. Original plugin settings restored.');setReview(false);}}>Discard this draft</button>}<small>Nothing is submitted automatically.</small></div></aside></div>
      {review&&<div className="edit-review-evidence">{overlapWarnings([p.draft],p.snapshot.entries).map((warning:string)=><p className="warning" key={warning}>{warning}</p>)}<details><summary>Compare generated code</summary><h3>Original plugin entry</h3><pre>{[p.draft.baseRaw,p.draft.entranceBaseRaw].filter(Boolean).join(",\n")}</pre><h3>Your draft</h3><pre>{preview}</pre></details></div>}
    </>}
    <dialog className="modal edit-navigation-dialog" ref={dialog} aria-labelledby="edit-leave-title" onCancel={e=>{e.preventDefault();setPending(null);}}><h2 id="edit-leave-title">Keep your changes?</h2><p>This section has changes you haven’t applied to your draft.</p><div><button onClick={()=>setPending(null)} autoFocus>Keep editing</button><button onClick={()=>resolvePending(false)}>Discard changes</button><button className="primary" disabled={!!error} onClick={()=>resolvePending(true)}>Apply changes</button></div></dialog>
  </section>;
}
