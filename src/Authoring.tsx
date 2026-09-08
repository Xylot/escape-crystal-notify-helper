import {freshEditBoss, freshEditForm, proposalDraft} from './core/fresh-edit.mjs';
import {isDungeon} from './core/encounter-kind.mjs';
import { originalEntranceChunks } from './core/encounter.mjs';
import EntranceModelReferences from './EntranceModelReferences';
import { useLayoutEffect, useState, useMemo, useRef } from 'react';

import EncounterMaps from './EncounterMaps';
import EntranceEditor from './Entrance';
import { CoveragePanel, SourcesPanel } from './Inspector';
import { Icon } from './Icons';
import BossPortrait, { BossImageSource, DungeonMapReference } from './BossPortrait';
import EncounterSetup from './EncounterSetup';
import { exportProblem, entranceOverlay } from './core/authoring.mjs';
import { overlapWarnings } from './core/proposal.mjs';
import { encounterCoverage } from './core/encounter-export.mjs';
import type { Boss, Draft, Snapshot, Location } from './types';

export type AuthoringStep = 'setup' | 'coverage' | 'entrance-area' | 'entrance-object' | 'review';
type Props = {
  boss: Boss; draft: Draft; snapshot: Snapshot; saved: boolean; busy: string;
  step: AuthoringStep; setStep: (step: AuthoringStep) => void;
  update: (change: Partial<Draft>) => void; onLoad: () => void; onError: (message: string) => void;
  onBack: () => void; onDiscard: () => void; onUndo: () => void; onRedo: () => void;
  canUndo: boolean; canRedo: boolean; preview: string;
  onCreatePR?: (ids:string[])=>void; evidenceContext?: {arena?:Location;entrance?:Location;entranceImage?:string|null}; onEntranceImage?: (id:string|null|undefined)=>void; onEvidenceContext?: (kind:'arena'|'entrance',location:Location)=>void;
  onExport: (kind: string, ids: string[]) => void; onSelect: (boss: Boss) => void; bosses: Boss[];
};

export default function Authoring(p: Props) {
  const fresh=p.draft.editFlow==='fresh';
  const boss=useMemo(()=>fresh?freshEditBoss(p.boss) as Boss:p.boss,[fresh,p.boss]);
  const draft=useMemo(()=>fresh?freshEditForm(p.draft) as Draft:p.draft,[fresh,p.draft]);
  const exported=useMemo(()=>proposalDraft(p.draft) as Draft,[p.draft]);
  const dungeon=isDungeon(boss),step=dungeon&&!['coverage','review'].includes(p.step)?'coverage':p.step;
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { stage.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [step]);
  const [showSources, setShowSources] = useState(false);
  const [choosingEntranceMap,setChoosingEntranceMap]=useState(true);
  const originalEntrance=p.boss.entranceEntry?.optionalArgs??p.boss.optionalArgs;
  const preservedEntrance = originalEntrance.some(a => a.includes('RegionEntrance('));
  const readOnly = (!!boss.raw && !['BOSSES','DUNGEONS'].includes(boss.regionType??'')) || (!boss.raw && !!boss.supportedBy?.length);
  const setStep = (next: AuthoringStep) => {
    if (next === 'review' && !p.saved && !readOnly) p.update({});
    p.setStep(next);
  };
  const issue = useMemo(()=>step==='review'?exportProblem(p.snapshot, [exported]):'', [step,p.snapshot,exported]);
  let coverage:ReturnType<typeof encounterCoverage>|undefined;
  try { if(step==='review')coverage = encounterCoverage(exported, p.boss.raw ? p.boss : null); } catch { /* The export error is displayed below. */ }
  const entranceChunks = draft.entrance?.chunks ?? originalEntranceChunks(originalEntrance);
  const warnings = useMemo(()=>step==='review'?overlapWarnings([exported], p.snapshot.entries):[],[step,exported,p.snapshot.entries]);
  const steps: { id: AuthoringStep; label: string; description: string; done: boolean }[] = dungeon ? [
    {id:'coverage',label:'Coverage',description:'Regions & optional chunks',done:draft.regions.length>0},
    {id:'review',label:'Review & export',description:'Check and share your work',done:step==='review'&&!issue},
  ] : [
    { id: 'setup', label: 'Setup', description: 'Death & entrance behavior', done: !!draft.deathType },
    { id: 'coverage', label: 'Arena', description: 'Where the fight happens', done: draft.regions.length > 0 && !!draft.deathType },
    { id: 'entrance-area', label: 'Entrance area', description: 'Region, plane & chunks', done: draft.entranceRegion != null || !!p.evidenceContext?.entrance },
    { id: 'entrance-object', label: 'Entrance object', description: 'Object, image & interaction', done: !!draft.entrance?.ids.length || !fresh&&preservedEntrance },
    { id: 'review', label: 'Review & export', description: 'Check and share your work', done: step==='review'&&!issue },
  ];
  return <section className={`authoring ${dungeon?'dungeon-authoring':''}`} aria-label="Encounter authoring" data-step={step}>
    <div className="authoring-header"><div><button className="back-discovery" onClick={p.onBack}>← Encounter library</button><div className="authoring-title"><BossPortrait boss={boss} compact/><h1>{draft.name}</h1><span className={`save-state ${p.saved ? 'is-saved' : ''}`}><Icon name={p.saved ? 'check' : 'file'} size={14}/>{p.saved ? 'Draft saved in this browser' : 'No changes yet'}</span></div></div><div className="authoring-utilities"><button disabled={!p.canUndo} onClick={p.onUndo} aria-label="Undo edit">↶ Undo</button><button disabled={!p.canRedo} onClick={p.onRedo} aria-label="Redo edit">↷ Redo</button><button aria-pressed={showSources} onClick={() => setShowSources(v => !v)}><Icon name="book" size={16}/> Sources <span className="count">{boss.maps.length}</span></button></div></div>
    {fresh&&<p className="fresh-edit-note">Setting up this supported encounter from scratch. The final review compares your contribution with the current plugin entry.</p>}
    <nav className="authoring-steps" aria-label="Authoring steps">{steps.map((s, i) => <button key={s.id} aria-current={step === s.id ? 'step' : undefined} className={`${step === s.id ? 'current' : ''} ${s.done ? 'configured' : ''}`} onClick={() => setStep(s.id)}><span className="step-number">{s.done ? <Icon name="check" size={15}/> : i + 1}</span><span><strong>{s.label}</strong><small>{s.description}</small></span>{i < steps.length - 1 && <Icon name="arrow" size={16}/>}</button>)}</nav>
    <div className="authoring-stage" ref={stage} key={step}>
    {readOnly && <div className="authoring-readonly"><Icon name="shield"/><div><strong>{boss.supportedBy?.length ? 'This encounter uses shared coverage.' : 'This entry is read-only in the boss editor.'}</strong><p>{boss.supportedBy?.length ? 'Edit the existing shared entry to update its coverage.' : 'This entry belongs to another plugin category.'}</p>{boss.supportedBy?.map(s => { const target = p.bosses.find(b => b.id === s.id); return target && <button key={s.id} onClick={() => p.onSelect(target)}>Edit {s.name} <Icon name="arrow" size={14}/></button>; })}</div></div>}
    {showSources && <section className="authoring-sources"><div className="source-drawer-heading"><strong>Location evidence</strong><button onClick={() => setShowSources(false)} aria-label="Close sources"><Icon name="close" size={16}/></button></div><BossImageSource title={boss.wikiTitle} dungeon={dungeon}/><SourcesPanel boss={boss}/></section>}
    {step === 'setup' ? <fieldset disabled={readOnly} className="authoring-fields"><EncounterSetup draft={draft} update={p.update}/></fieldset> : step === 'entrance-object' ? <fieldset disabled={readOnly} className="authoring-fields object-workspace"><EntranceEditor imageSelection={p.evidenceContext?.entranceImage} onImageSelect={p.onEntranceImage} boss={boss} draft={draft} update={p.update} onError={p.onError} onEditArea={()=>setStep('entrance-area')} guided/></fieldset> : step !== 'review' ? <div className={`authoring-body ${step === 'entrance-area' ? (choosingEntranceMap?'entrance-step choosing-entrance-map':'entrance-step') : ''}`}>
      <div className="authoring-map"><div className="work-heading"><div><h2>{step === 'coverage' ? (dungeon?'Select dungeon coverage':'Select the fight area') : choosingEntranceMap?'Choose an entrance':'Locate the entrance'}</h2><p>{step === 'coverage' ? 'Click regions to include them. Click again to remove them.' : choosingEntranceMap?'Choose a suggested entrance and continue to review.':'Choose the entrance region and plane. Add chunk restrictions only where needed.'}</p></div><button disabled={!!p.busy} onClick={p.onLoad}><Icon name="sync" size={14}/>{p.busy ? 'Loading…' : boss.maps.length ? 'Refresh locations' : 'Load locations'}</button></div><EncounterMaps onQuickReview={(change,location)=>{p.update(change);p.onEvidenceContext?.('entrance',location);p.setStep('review');}} onEntrancePickerChange={setChoosingEntranceMap} key={boss.id} boss={boss} draft={draft} update={p.update} onError={p.onError} onLoad={p.onLoad} evidenceContext={p.evidenceContext} onEvidenceContext={p.onEvidenceContext} focus={step === 'coverage' ? 'arena' : 'entrance'} loading={!!p.busy}/></div>
      <aside className="authoring-inspector"><fieldset disabled={readOnly} className="authoring-fields">{step === 'coverage' ? <><CoveragePanel key={boss.id} draft={draft} update={p.update} deaths={[...new Set(p.snapshot.entries.map(b => b.deathType))]} preview={p.preview} canDiscard={p.saved} onDiscard={p.onDiscard} guided/>{dungeon&&<DungeonMapReference title={boss.wikiTitle}/>}</> : <section className="entrance-area-summary inspector-panel"><span className="eyebrow">ENTRANCE AREA</span><h2>Where players enter</h2><p>Set the area here. You’ll choose the object players interact with in the next step.</p><dl><dt>Region</dt><dd>{draft.entranceRegion ?? p.evidenceContext?.entrance?.region ?? 'Choose on the map'}</dd><dt>Plane</dt><dd>{draft.entrancePlane ?? p.evidenceContext?.entrance?.plane ?? 0}</dd><dt>Notification chunks</dt><dd>{draft.entranceNotifyChunks?.length ? draft.entranceNotifyChunks.join(', ') : 'Whole entrance area'}</dd></dl><div className="area-guidance"><Icon name="map" size={24}/><h3>Start at the entrance</h3><p>Use the wiki location or click its region on the map. This area is included in exported coverage when entrance detection is configured.</p></div></section>}</fieldset></aside>
    </div> : <div className="review-workspace"><div className="review-content"><div className="work-heading"><div><h2>Check your encounter</h2><p>Review the final settings before creating a contribution.</p></div><span className={`review-readiness ${issue ? 'pending' : 'ready'}`}><Icon name={issue ? 'file' : 'check'} size={15}/>{issue ? 'Review needed' : 'Ready to export'}</span></div>
      <section className="review-summary-card"><div><Icon name="map"/><h3>{dungeon?'Dungeon coverage':'Arena regions'}</h3><button onClick={() => setStep('coverage')}>Edit coverage</button></div><dl><dt>Regions</dt><dd>{draft.regions.join(', ') || 'None selected'}</dd><dt>Death behavior {!dungeon&&<>· <button onClick={()=>setStep('setup')}>Edit setup</button></>}</dt><dd>{draft.deathType === 'UNSAFE' ? 'Unsafe death' : draft.deathType === 'UNSAFE_HCGIM' ? 'Unsafe for Hardcore Group Ironman' : draft.deathType || 'Not selected'}</dd><dt>Chunk restrictions</dt><dd>{draft.chunks?.length ? draft.chunks.join(', ') : 'Whole regions'}</dd></dl></section>
      {!dungeon&&<><section className="review-summary-card"><div><Icon name="map"/><h3>Entrance regions</h3><button onClick={()=>setStep('entrance-area')}>Edit area</button></div><dl><dt>Regions</dt><dd>{coverage?.entranceRegions.join(', ') || draft.entranceRegion || 'Not selected'}</dd><dt>Plane</dt><dd>{draft.entrancePlane ?? p.evidenceContext?.entrance?.plane ?? 'Not selected'}</dd><dt>Entrance area</dt><dd>{exported.entranceDangerous===false?'Not dangerous · notify in selected chunks':exported.entranceDangerous===true?'Dangerous':'Existing behavior preserved'}</dd><dt>Notification chunks</dt><dd>{exported.entranceNotifyChunks?.join(', ')||'Whole entrance area'}</dd><dt>Object-detection chunks</dt><dd>{entranceChunks.join(', ') || 'No restriction'}</dd></dl></section>
      <section className="review-summary-card"><div><Icon name="layers"/><h3>Entrance object</h3><button onClick={() => setStep('entrance-object')}>Edit object</button></div>{draft.entrance ? <><dl><dt>Object / NPC IDs</dt><dd>{draft.entrance.ids.join(', ') || 'None selected'}</dd><dt>Priority</dt><dd>{entranceOverlay(draft)==='PRIORITIZED_WITH_HIGHLIGHT'?'Prioritized':'Deprioritized'}</dd><dt>Interaction type</dt><dd>{draft.entrance.objectType.replaceAll('_', ' ').toLowerCase()}</dd><dt>Approach / plane</dt><dd>{draft.entrance.direction || 'Default'} / {draft.entrance.plane || 'Default'}</dd><dt>Chunk restrictions</dt><dd>{draft.entrance.chunks.join(', ') || 'None'}</dd></dl></> : <p>{preservedEntrance ? `Entrance ${entranceOverlay(draft)==='PRIORITIZED_WITH_HIGHLIGHT'?'prioritized':'deprioritized'}. Existing object IDs and other settings are preserved.` : 'No entrance detection added. This contribution covers the arena only.'}</p>}<EntranceModelReferences ids={draft.entrance?.ids??[]} objectType={draft.entrance?.objectType??'GAME_OBJECT'} selection={p.evidenceContext?.entranceImage}/></section></>}
      <section className="review-summary-card"><div><Icon name="map"/><h3>Exported coverage</h3></div>{coverage ? <><dl><dt>Regions</dt><dd>{coverage.regions.join(', ') || 'None selected'}</dd><dt>Chunk restrictions</dt><dd>{'split' in coverage&&coverage.split?'Separate arena and entrance restrictions shown above':coverage.chunks?.length ? coverage.chunks.join(', ') : 'Whole regions'}</dd></dl><p>{dungeon ? 'These regions are included in the plugin.' : 'Arena and entrance notification coverage follow the selected danger settings.'}</p></> : <p>{issue || 'Complete the coverage settings to see the exported area.'}</p>}</section>
      {warnings.map((w, i) => <p className="warning" key={i}>{w}</p>)}<details className="review-code"><summary>Compare generated code</summary>{p.draft.baseRaw && <><h4>Current plugin entry</h4><pre>{p.draft.baseRaw}{p.draft.entranceBaseRaw?"\n"+p.draft.entranceBaseRaw:""}</pre></>}<h4>Your draft</h4><pre>{p.preview}</pre></details>
    </div><aside className="export-card"><span className="eyebrow">SHARE YOUR CONTRIBUTION</span><h2>Export this encounter</h2><p>Export this encounter on its own. Other unfinished drafts won’t block you.</p>{issue && <div className="export-issue" role="status"><strong>Before you export</strong><p>{issue}</p></div>}{p.onCreatePR&&<button className="primary" disabled={readOnly||!!issue||!p.saved} onClick={()=>p.onCreatePR!([draft.id])}>Create pull request</button>}<button className={p.onCreatePR?'':'primary'} disabled={readOnly || !!issue || !p.saved} onClick={() => p.onExport('json', [draft.id])}><Icon name="file"/> Download proposal</button><button disabled={readOnly || !!issue || !p.saved} onClick={() => p.onExport('patch', [draft.id])}>Download patch</button><button disabled={readOnly || !!issue || !p.saved} onClick={() => p.onExport('copy', [draft.id])}>Copy proposal</button><p className="export-note">Nothing is submitted automatically. Send the proposal to a maintainer or use the plugin’s contribution workflow.</p><a href="https://github.com/Xylot/escape-crystal-notify/actions/workflows/content-proposal.yml" target="_blank" rel="noreferrer">Open maintainer workflow <Icon name="external" size={13}/></a></aside></div>}
    </div>
    <footer className="authoring-footer"><div><span className="dot mint-dot"/><span>{p.saved ? 'Your changes are saved locally.' : 'Changes save automatically as you edit.'}</span></div><div>
      {step !== steps[0].id && <button onClick={()=>setStep(steps[steps.findIndex(s=>s.id===step)-1].id)}>← Back</button>}
      {!dungeon && step === 'coverage' && <button onClick={()=>setStep('review')}>Arena only · review</button>}
      {(step === 'entrance-area' || step === 'entrance-object') && <button onClick={()=>{if(draft.entrance)p.update({entrance:undefined});setStep('review');}}>{draft.entrance?'Remove entrance changes':preservedEntrance?'Keep existing entrance':'Skip entrance'}</button>}
      {step !== 'review' && !(step==='entrance-area'&&choosingEntranceMap) && <button className="primary" onClick={()=>setStep(steps[steps.findIndex(s=>s.id===step)+1].id)}>{dungeon?'Review & export':step==='setup'?'Continue to arena':step==='coverage'?'Continue to entrance area':step==='entrance-area'?'Choose entrance object':'Review & export'} <Icon name="arrow" size={16}/></button>}
      {step === 'review' && <button onClick={p.onBack}>Back to library</button>}
    </div></footer>
  </section>;
}
