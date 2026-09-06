import {MoidThumbnail} from './EntrancePortraits';
import { useState, useEffect, useRef } from 'react';
import { loadRegionObjects, regionObjectCandidates, objectGamevalNames, DUMPER } from './core/region-objects.mjs';
import { loadGameval } from './core/gameval.mjs';
import { Icon } from './Icons';
import type { Boss } from './types';

export default function RegionObjects({ boss, onUse, onError, selectedRegion, selectedPlane, selectedIds = [], autoLoad = false, lockedArea = false }: {
  selectedRegion?: number; selectedPlane?: number; boss: Boss; onUse: (id: string) => void; onError: (message: string) => void; selectedIds?: string[]; autoLoad?: boolean; lockedArea?: boolean;
}) {
  const entrances = boss.maps.filter((m, i, all) => m.role === 'entrance' && all.findIndex(p => p.role === 'entrance' && p.x === m.x && p.y === m.y && p.plane === m.plane) === i);
  const [region, setRegion] = useState(String(selectedRegion ?? entrances[0]?.region ?? ''));
  const [plane, setPlane] = useState(String(selectedPlane ?? entrances[0]?.plane ?? 'all'));
  const [data, setData] = useState<any>(null), [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [searchedRegion, setSearchedRegion] = useState('');
  const [onlyEntrances, setOnlyEntrances] = useState(true), [query, setQuery] = useState('');
  const [symbols, setSymbols] = useState<any[]>([]), [symbolBusy, setSymbolBusy] = useState(false);
  const request = useRef(0);
  async function search(target = region, targetPlane = plane) {
    const version = ++request.current; setBusy(true); setError(''); setRows([]); setSearchedRegion('');
    try {
      if (!/^\d+$/.test(target) || +target > 65535) throw new Error('Enter a region ID from 0 to 65535.');
      const next = await loadRegionObjects();
      if (version !== request.current) return;
      const point = entrances.find(p => p.region === +target);
      setData(next); setRows(regionObjectCandidates(next, +target, point ? { x: point.x, y: point.y } : null, targetPlane === 'all' ? null : +targetPlane)); setSearchedRegion(target);
    } catch (e) { if (version === request.current) setError((e as Error).message); }
    finally { if (version === request.current) setBusy(false); }
  }
  useEffect(() => {
    const target = String(selectedRegion ?? entrances[0]?.region ?? '');
    const targetPlane = String(selectedPlane ?? entrances[0]?.plane ?? 'all');
    setRegion(target); setPlane(targetPlane); setRows([]); setSearchedRegion('');
    if (autoLoad && target) void search(target, targetPlane);
    return () => { request.current++; };
  }, [selectedRegion, selectedPlane, autoLoad, boss.id]);
  const filtered = rows.filter(r => (!onlyEntrances || r.entrance) && (!query || `${r.name} ${r.id} ${r.actions.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return <section className="region-objects"><form className="object-region-form" onSubmit={e => { e.preventDefault(); void search(); }}>{lockedArea?<div className="object-search-area"><strong>{region?`Region ${region}`:'No entrance area selected'}</strong><span>Plane {plane}</span></div>:<><label>Region<input aria-label="Object search region" value={region} onChange={e => setRegion(e.target.value)}/></label><label>Plane<select aria-label="Object search plane" value={plane} onChange={e => setPlane(e.target.value)}><option value="all">All</option>{[0, 1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label></>}<button disabled={busy || !region}><Icon name="search" size={15}/>{busy ? 'Loading…' : 'Search'}</button></form>
    {busy && <div className="object-loading" role="status"><span className="loading-spinner"/><strong>Finding nearby objects</strong><p>Loading the world-object snapshot. This may take a moment the first time.</p></div>}
    {error && <div className="export-issue" role="alert"><strong>Couldn’t load nearby objects</strong><p>{error}</p><button onClick={() => void search()}>Try again</button></div>}
    {!busy && !error && !searchedRegion && <p className="muted">Choose an entrance region on the map or enter a region above.</p>}
    {searchedRegion && <><div className="object-filter"><label className="search"><Icon name="search" size={15}/><input aria-label="Filter nearby objects" value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by name, action or ID…"/></label><label className="quest-toggle"><input type="checkbox" checked={onlyEntrances} onChange={e => setOnlyEntrances(e.target.checked)}/> Entrances only</label></div><div className="object-results-meta"><span>{filtered.length} objects in region {searchedRegion}</span><small>Closest matches first</small></div>
      <div className="object-results">{filtered.slice(0, 100).map((r, i) => <article className={`object-result ${r.distance === 0 ? 'exact-match' : ''}`} key={`${r.id}-${r.x}-${r.y}-${r.level}-${i}`}><MoidThumbnail compact id={String(r.id)}/><div><strong>{r.name}</strong><span><code>{r.id}</code> · {r.distance === 0 ? 'Exact wiki tile' : r.distance !== null ? `${r.distance.toFixed(1)} tiles away` : `Tile ${r.x}, ${r.y}`} · plane {r.level}</span></div><button className={selectedIds.includes(String(r.id)) ? 'object-added' : ''} disabled={selectedIds.includes(String(r.id))} onClick={() => onUse(String(r.id))}>{selectedIds.includes(String(r.id)) ? '✓ Added' : '+ Add'}</button><p>{r.actions.join(' · ') || 'No actions on base object'}</p>
        {!!r.forms.length && <details className="object-variants"><summary>{r.forms.filter((f: any) => f.locId >= 0).length} variants · inspect IDs</summary><p>Active form depends on account state. Selector: {r.definition.transformVarbit >= 0 ? `varbit ${r.definition.transformVarbit}` : `varp ${r.definition.transformVarp}`}.</p>{r.forms.filter((f: any) => f.locId >= 0).map((f: any, j: number) => <div className="object-form" key={j}><MoidThumbnail compact id={String(f.locId)}/><div><strong>{f.name || 'Unnamed variant'}</strong><span>{f.locId} · {f.actions?.filter(Boolean).join(', ') || 'No actions'}</span></div><button disabled={selectedIds.includes(String(f.locId))} onClick={() => onUse(String(f.locId))}>{selectedIds.includes(String(f.locId)) ? 'Added' : '+ Add'}</button></div>)}</details>}
        {objectGamevalNames(symbols, [r.id, ...r.forms.map((f: any) => f.locId)]).map((s: any) => <a className="gameval-name" key={s.name} href={s.source} target="_blank" rel="noreferrer">{s.file}.{s.name} = {s.id} ↗</a>)}
      </article>)}</div>{!filtered.length && <div className="object-empty"><p>No matching objects.</p><button onClick={() => { setOnlyEntrances(false); setQuery(''); }}>Show all region objects</button></div>}{filtered.length > 100 && <p className="muted">Showing the first 100 matches. Filter by name or ID to narrow the list.</p>}
      <details className="inspector-disclosure"><summary>Source details & verification</summary><p className="muted">Cache {data.meta.cache} · generated {data.meta.generatedAt}. NPC spawn locations are excluded. Verify placed and transformed IDs in game.</p><a href={`https://github.com/${DUMPER}/tree/${data.sha}/data`} target="_blank" rel="noreferrer">View pinned object snapshot ↗</a><button className="wide" disabled={symbolBusy} onClick={async () => { setSymbolBusy(true); try { setSymbols(await loadGameval()); } catch (e) { onError((e as Error).message); } finally { setSymbolBusy(false); } }}>{symbolBusy ? 'Matching…' : 'Match RuneLite constant names'}</button></details>
    </>}
  </section>;
}
