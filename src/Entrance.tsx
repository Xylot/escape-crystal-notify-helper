import { useState, useEffect, useRef } from 'react';
import { OVERLAYS, DIRECTIONS, PLANES, OBJECT_TYPES } from './core/entrance.mjs';
import { parseIds } from './core/coordinates.mjs';
import type { Boss, Draft, Entrance as Config } from './types';
import { loadParser } from './parser';
import { findEntranceCandidates } from './core/wiki.mjs';
import { loadGameval, searchGameval } from './core/gameval.mjs';
import { Icon } from './Icons';
import RegionObjects from './RegionObjects';

export default function EntranceEditor({ boss, draft, update, onError, guided = false }: {
  boss: Boss; draft: Draft; update: (d: Partial<Draft>) => void; onError: (s: string) => void; guided?: boolean;
}) {
  const [method, setMethod] = useState('region');
  const [ids, setIds] = useState(draft.entrance?.ids.join(', ') ?? '');
  const [chunks, setChunks] = useState(draft.entrance?.chunks.join(', ') ?? '');
  const idInput = useRef<HTMLInputElement>(null), chunkInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(draft.name), [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]), [wikiBusy, setWikiBusy] = useState(false), [wikiSearched, setWikiSearched] = useState(false);
  useEffect(() => { if (document.activeElement !== idInput.current) setIds(draft.entrance?.ids.join(', ') ?? ''); }, [draft.entrance?.ids]);
  useEffect(() => { if (document.activeElement !== chunkInput.current && (draft.entrance?.chunks ?? []).every(n => n >= 0)) setChunks(draft.entrance?.chunks.join(', ') ?? ''); }, [draft.entrance?.chunks]);
  const fresh: Config = { overlay: 'DEPRIORITIZED_WITH_HIGHLIGHT', direction: '', plane: '', objectType: 'GAME_OBJECT', ids: [], chunks: [] };
  const config = draft.entrance ?? fresh;
  const edit = (part: Partial<Config>) => update({ entrance: { ...config, ...part } });
  const addIds = (values: string[], objectType = 'GAME_OBJECT') => {
    const next = [...new Set([...(config.objectType === objectType ? config.ids : []), ...values])];
    setIds(next.join(', ')); edit({ ids: next, objectType });
  };
  const existing = boss.optionalArgs.some(a => a.includes('RegionEntrance('));
  return <div className="inspector-panel entrance-authoring"><div className="inspector-heading"><h2>Entrance detection</h2><p>Add the object players interact with to enter. You can skip this step for arena-only coverage.</p></div>
    {existing && !draft.entrance && <div className="preserved-notice"><Icon name="shield" size={17}/><span>Existing entrance preserved. Selecting IDs replaces the existing entrance configuration.</span></div>}
    <section className={`selected-entrance ${config.ids.length ? 'has-selection' : ''}`}><div className="inspector-card-title"><h3>Selected IDs</h3><span>{config.ids.length}</span></div>{config.ids.length ? <div className="region-chips">{config.ids.map(id => <button key={id} aria-label={`Remove entrance ID ${id}`} onClick={() => edit({ ids: config.ids.filter(n => n !== id) })}>{id} ×</button>)}</div> : <p>Select an object below or enter a known ID.</p>}
      {draft.entrance && <details className="inspector-disclosure"><summary>Interaction settings</summary><label className="field">Interaction type<select value={config.objectType} onChange={e => edit({ objectType: e.target.value })}>{OBJECT_TYPES.map(v => <option key={v} value={v}>{v === 'GAME_OBJECT' ? 'Game object' : v === 'NPC' ? 'NPC' : 'Any object type'}</option>)}</select></label><label className="field">Entrance chunk IDs<input ref={chunkInput} value={chunks} onChange={e => { setChunks(e.target.value); try { edit({ chunks: parseIds(e.target.value, 'chunk') }); } catch (error) { edit({ chunks: [-1] }); onError((error as Error).message); } }} placeholder="No chunk restriction"/></label>{([['overlay', 'Overlay', OVERLAYS], ['direction', 'Approach direction', DIRECTIONS], ['plane', 'Plane constraint', PLANES]] as const).map(([key, label, values]) => <label className="field" key={key}>{label}<select value={config[key]} onChange={e => edit({ [key]: e.target.value })}>{values.map(v => <option key={v} value={v}>{v ? v.toLowerCase().replaceAll('_', ' ') : 'Constructor default'}</option>)}</select></label>)}<button className="text-button" onClick={() => update({ entrance: undefined })}>{existing ? 'Restore existing entrance' : 'Remove entrance detection'}</button></details>}
    </section>
    <div className="object-methods" aria-label="Find entrance objects">{[['region', 'Nearby'], ['gameval', 'Name or ID'], ['wiki', 'Wiki'], ['manual', 'Manual']].map(([value, label]) => <button key={value} aria-pressed={method === value} className={method === value ? 'chosen' : ''} onClick={() => setMethod(value)}>{label}</button>)}</div>
    <div hidden={method !== 'region'}><RegionObjects boss={boss} selectedRegion={draft.entranceRegion} selectedPlane={draft.entrancePlane} selectedIds={config.objectType === 'GAME_OBJECT' ? config.ids : []} autoLoad={guided && method === 'region'} onError={onError} onUse={id => addIds([id])}/></div>
    <div hidden={method !== 'manual'} className="manual-entrance"><label className="field">Object / NPC IDs<input ref={idInput} value={ids} onChange={e => { setIds(e.target.value); edit({ ids: e.target.value.split(/[\s,]+/).filter(Boolean) }); }} placeholder="58439, ObjectID.ENTRANCE_NAME"/></label><p className="muted">Use numeric IDs or ObjectID / NpcID constants. Separate multiple IDs with commas.</p>{!draft.entrance && <button onClick={() => edit({})}>Configure entrance</button>}</div>
    <div hidden={method !== 'gameval'} className="gameval-search"><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { setResults(searchGameval(await loadGameval(), query)); setSearched(true); } catch (error) { onError((error as Error).message); } finally { setBusy(false); } }}><label className="field">Object name or ID<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Boss, location or numeric ID"/></label><button className="primary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search objects'}</button></form>{searched && !results.length && <p className="muted">No matches. Try a location name or a numeric ID.</p>}<div className="gameval-results">{results.map(c => <article className="object-result" key={`${c.file}.${c.name}`}><div><strong>{c.name.toLowerCase().replaceAll('_', ' ')}</strong><span>{c.id} · {c.objectType === 'NPC' ? 'NPC' : 'Game object'}</span></div><button disabled={(config.objectType === c.objectType && config.ids.includes(c.id))} onClick={() => addIds([c.id], c.objectType)}>{(config.objectType === c.objectType && config.ids.includes(c.id)) ? 'Added' : '+ Add'}</button><a href={c.source} target="_blank" rel="noreferrer">View constant source ↗</a></article>)}</div></div>
    <div hidden={method !== 'wiki'} className="wiki-object-search"><p className="muted">Look for object and NPC pages associated with {draft.name}.</p><button disabled={wikiBusy} onClick={async () => { setWikiBusy(true); try { setCandidates(await findEntranceCandidates(await loadParser(), draft.name)); setWikiSearched(true); } catch (error) { onError((error as Error).message); } finally { setWikiBusy(false); } }}>{wikiBusy ? 'Searching wiki…' : 'Find wiki candidates'}</button>{wikiSearched && !candidates.length && <p className="muted">No IDs found. Try the nearby search or enter a known ID.</p>}{candidates.map((c, i) => <article className="object-result" key={i}><div><strong>{c.title}</strong><span>{c.ids.join(', ')}</span></div><button onClick={() => addIds(c.ids, c.objectType)}>+ Add IDs</button><a href={c.source} target="_blank" rel="noreferrer">Wiki revision {c.revision} ↗</a></article>)}</div>
    {!!boss.optionalArgs.length && <details className="inspector-disclosure"><summary>Existing plugin settings</summary><pre>{boss.optionalArgs.join(',\n')}</pre></details>}
  </div>;
}
