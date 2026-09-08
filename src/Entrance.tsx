import {entranceOverlay} from './core/authoring.mjs';
import EntrancePortraits, {MoidThumbnail} from './EntrancePortraits';
import { useState, useEffect, useRef } from 'react';
import { OVERLAYS, DIRECTIONS, PLANES, OBJECT_TYPES } from './core/entrance.mjs';
import type { Boss, Draft, Entrance as Config } from './types';
import { loadParser } from './parser';
import { findEntranceCandidates } from './core/wiki.mjs';
import { loadGameval, searchGameval } from './core/gameval.mjs';
import { Icon } from './Icons';
import RegionObjects from './RegionObjects';

export default function EntranceEditor({ boss, draft, update, onError, guided = false, editing = false, imageSelection, onImageSelect, onEditArea }: {
  boss: Boss; draft: Draft; update: (d: Partial<Draft>) => void; onError: (s: string) => void; guided?: boolean; editing?:boolean; imageSelection?:string|null; onImageSelect?:(id:string|null|undefined)=>void; onEditArea?:()=>void;
}) {
  const [method, setMethod] = useState(editing && draft.entrance?.ids.length ? 'manual' : 'region');
  const [ids, setIds] = useState(draft.entrance?.ids.join(', ') ?? '');
  const idInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(draft.name), [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]), [wikiBusy, setWikiBusy] = useState(false), [wikiSearched, setWikiSearched] = useState(false);
  useEffect(() => { if (document.activeElement !== idInput.current) setIds(draft.entrance?.ids.join(', ') ?? ''); }, [draft.entrance?.ids]);
  const fresh: Config = { overlay: entranceOverlay(draft), direction: '', plane: '', objectType: 'GAME_OBJECT', ids: [], chunks: [] };
  const config = draft.entrance ?? fresh;
  const edit = (part: Partial<Config>) => update({ entrance: { ...config, ...part } });
  const addIds = (values: string[], objectType = 'GAME_OBJECT') => {
    const next = [...new Set([...(config.objectType === objectType ? config.ids : []), ...values])];
    setIds(next.join(', ')); edit({ ids: next, objectType });
  };
  const existing = boss.optionalArgs.some(a => a.includes('RegionEntrance('));
  const areaRegion=draft.entranceRegion ?? boss.maps.find(m=>m.role==='entrance')?.region;
  const areaPlane=draft.entrancePlane ?? boss.maps.find(m=>m.role==='entrance')?.plane ?? 0;
  return <div className="entrance-object-studio">
    <header className="object-studio-heading"><div><span className="eyebrow">ENTRANCE OBJECT</span><h2>{editing?'Edit entrance detection':'What opens the way?'}</h2><p>{editing?'Adjust the selected IDs and interaction settings, or browse for a replacement.':'Find the object players interact with, then choose the image that best represents it.'}</p></div><button type="button" className="object-area-context" onClick={onEditArea}><Icon name="map" size={20}/><span><strong>{areaRegion!=null?`Region ${areaRegion}`:'Choose entrance area'}</strong><small>Plane {areaPlane} · Edit area</small></span><Icon name="arrow" size={16}/></button></header>
    {existing && !draft.entrance && <div className="preserved-notice"><Icon name="shield" size={17}/><span>Existing entrance preserved. Adding IDs replaces its detection configuration.</span></div>}
    <div className="object-studio-grid"><section className="object-browser" aria-label="Browse entrance objects">
    <div className="object-methods" aria-label="Find entrance objects">{[['region', 'Nearby'], ['gameval', 'Name or ID'], ['wiki', 'Wiki'], ['manual', 'Manual']].map(([value, label]) => <button key={value} aria-pressed={method === value} className={method === value ? 'chosen' : ''} onClick={() => setMethod(value)}>{label}</button>)}</div>
    <div hidden={method !== 'region'}><RegionObjects lockedArea boss={boss} selectedRegion={draft.entranceRegion} selectedPlane={draft.entrancePlane} selectedIds={config.objectType === 'GAME_OBJECT' ? config.ids : []} autoLoad={guided && method === 'region'} onError={onError} onUse={id => addIds([id])}/></div>
    <div hidden={method !== 'manual'} className="manual-entrance"><label className="field">Object / NPC IDs<input ref={idInput} value={ids} onChange={e => { setIds(e.target.value); edit({ ids: e.target.value.split(/[\s,]+/).filter(Boolean) }); }} placeholder="58439, ObjectID.ENTRANCE_NAME"/></label><p className="muted">Use numeric IDs or ObjectID / NpcID constants. Separate multiple IDs with commas.</p>{!draft.entrance && <button onClick={() => edit({})}>Configure entrance</button>}</div>
    <div hidden={method !== 'gameval'} className="gameval-search"><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { setResults(searchGameval(await loadGameval(), query)); setSearched(true); } catch (error) { onError((error as Error).message); } finally { setBusy(false); } }}><label className="field">Object name or ID<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Boss, location or numeric ID"/></label><button className="primary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search objects'}</button></form>{searched && !results.length && <p className="muted">No matches. Try a location name or a numeric ID.</p>}<div className="gameval-results">{results.map(c => <article className="object-result" key={`${c.file}.${c.name}`}>{c.objectType!=='NPC'&&<MoidThumbnail compact id={String(c.id)}/>}<div><strong>{c.name.toLowerCase().replaceAll('_', ' ')}</strong><span>{c.id} · {c.objectType === 'NPC' ? 'NPC' : 'Game object'}</span></div><button disabled={(config.objectType === c.objectType && config.ids.includes(c.id))} onClick={() => addIds([c.id], c.objectType)}>{(config.objectType === c.objectType && config.ids.includes(c.id)) ? 'Added' : '+ Add'}</button><a href={c.source} target="_blank" rel="noreferrer">View constant source ↗</a></article>)}</div></div>
    <div hidden={method !== 'wiki'} className="wiki-object-search"><p className="muted">Look for object and NPC pages associated with {draft.name}.</p><button disabled={wikiBusy} onClick={async () => { setWikiBusy(true); try { setCandidates(await findEntranceCandidates(await loadParser(), draft.name)); setWikiSearched(true); } catch (error) { onError((error as Error).message); } finally { setWikiBusy(false); } }}>{wikiBusy ? 'Searching wiki…' : 'Find wiki candidates'}</button>{wikiSearched && !candidates.length && <p className="muted">No IDs found. Try the nearby search or enter a known ID.</p>}{candidates.map((c, i) => <article className="object-result" key={i}>{c.objectType!=='NPC'&&c.ids.map((id:string)=><MoidThumbnail compact key={id} id={id}/>)}<div><strong>{c.title}</strong><span>{c.ids.join(', ')}</span></div><button onClick={() => addIds(c.ids, c.objectType)}>+ Add IDs</button><a href={c.source} target="_blank" rel="noreferrer">Wiki revision {c.revision} ↗</a></article>)}</div>
</section><aside className="object-selection" aria-label="Selected entrance and reference image"><div className="object-selection-heading"><span className="eyebrow">YOUR SELECTION</span><span className="object-selection-count" role="status">{config.ids.length} {config.ids.length===1?'ID':'IDs'}</span></div>
    <section className={`selected-entrance ${config.ids.length ? 'has-selection' : ''}`}><div className="inspector-card-title"><h3>Detection IDs</h3></div>{config.ids.length ? <div className="region-chips">{config.ids.map(id => <button key={id} aria-label={`Remove entrance ID ${id}`} onClick={() => edit({ ids: config.ids.filter(n => n !== id) })}>{id} ×</button>)}</div> : <p>Add an object from the browser. Its ID is used for entrance detection.</p>}
      {draft.entrance && <details className="inspector-disclosure"><summary>Interaction settings</summary><label className="field">Interaction type<select value={config.objectType} onChange={e => edit({ objectType: e.target.value })}>{OBJECT_TYPES.map(v => <option key={v} value={v}>{v === 'GAME_OBJECT' ? 'Game object' : v === 'NPC' ? 'NPC' : 'Any object type'}</option>)}</select></label><div className="object-area-link"><span>{config.chunks.length?`${config.chunks.length} entrance chunks`:'No chunk restriction'}</span><button type="button" onClick={onEditArea}>Edit entrance area</button></div>{([['overlay', 'Overlay', OVERLAYS], ['direction', 'Approach direction', DIRECTIONS], ['plane', 'Plane constraint', PLANES]] as const).map(([key, label, values]) => <label className="field" key={key}>{label}<select value={config[key]} onChange={e => edit({ [key]: e.target.value })}>{values.map(v => <option key={v} value={v}>{v ? v.toLowerCase().replaceAll('_', ' ') : 'Constructor default'}</option>)}</select></label>)}<button className="text-button" onClick={() => update({ entrance: undefined })}>{existing ? 'Restore existing entrance' : 'Remove entrance detection'}</button></details>}
    </section>
    <EntrancePortraits compactPicker selection={imageSelection} onSelect={onImageSelect} name={draft.name} ids={config.ids} objectType={config.objectType}/>    {!!boss.optionalArgs.length && <details className="inspector-disclosure"><summary>Existing plugin settings</summary><pre>{boss.optionalArgs.join(',\n')}</pre></details>}
    </aside></div>
  </div>;
}
