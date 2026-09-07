import { useEffect, useMemo, useState } from 'react';
import type { Boss, Draft } from './types';
import { Icon } from './Icons';
import BossPortrait from './BossPortrait';

type Props = {
  bosses: Boss[]; onSelect: (boss: Boss) => void; drafts: Record<string, Draft>;
  search: string; setSearch: (value: string) => void; filter: string; setFilter: (value: string) => void;
  category: string; setCategory: (value: string) => void; categories: string[];
  onImport: () => void;
  total: number; unsupported: number; supportedCount: number; ready: boolean;
};
export default function Discovery(p: Props) {
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState('name');
  const [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [p.search, p.filter, p.category, sort]);
  const sorted = useMemo(() => [...p.bosses].sort((a, b) => sort === 'locations' ? b.maps.length - a.maps.length || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)), [p.bosses, sort]);
  const featured = p.bosses.find(b => b.wikiTitle.toLowerCase() === 'shellbane gryphon');
  const tabs = [['new', 'Needs coverage'], ['all', 'All encounters'], ['supported', 'Supported'], ['drafts', 'My drafts'], ['unresolved', 'Needs locations']];
  const reset = () => { p.setSearch(''); p.setCategory('all'); p.setFilter('all'); };
  return <section className={`discovery ${p.filter === 'drafts' ? 'drafts-view' : ''}`} aria-label="Encounter library">
    <header className="library-header"><div><div className="eyebrow">COMMUNITY WORKSPACE</div><h1>{p.filter==='drafts'?'Your drafts':'Encounter library'}</h1><p>{p.filter==='drafts'?'Pick up where you left off. Your edits are saved in this browser.':'Choose an encounter, configure its coverage, and prepare a contribution.'}</p></div><button className="primary" onClick={p.onImport}><Icon name="plus" size={17}/> Add encounter</button></header>
    {p.filter!=='drafts'&&<div className="library-overview" aria-label="Library overview"><div><Icon name="book"/><strong>{p.ready?p.total:'—'}</strong><span>encounters</span></div><div><Icon name="shield"/><strong>{p.ready?p.supportedCount:'—'}</strong><span>supported</span></div><div><Icon name="map"/><strong>{p.ready?p.unsupported:'—'}</strong><span>need coverage</span></div></div>}
    {featured&&p.filter!=='drafts'&&!p.search&&p.category==='all'&&<button className="quick-start-encounter" onClick={()=>p.onSelect(featured)}><BossPortrait boss={featured} compact/><span><strong>Shellbane gryphon</strong><small>Wiki locations ready · start with the suggested arena</small></span><span className="quick-start-action">Open editor <Icon name="arrow" size={16}/></span></button>}
    <div id="encounters" className="encounter-library">
      <div className="library-tabs" aria-label="Filter by coverage">{tabs.map(([value, label]) => <button key={value} aria-pressed={p.filter === value} className={p.filter === value ? 'chosen' : ''} onClick={() => p.setFilter(value)}>{label}{value === 'drafts' && Object.keys(p.drafts).length > 0 && <span className="count">{Object.keys(p.drafts).length}</span>}</button>)}</div>
      <div className="library-toolbar"><label className="search"><Icon name="search"/><span className="sr-only">Search encounters</span><input type="search" placeholder="Search encounters…" value={p.search} onChange={e => p.setSearch(e.target.value)}/></label><label className="category-filter"><span className="sr-only">Encounter category</span><select value={p.category} onChange={e => p.setCategory(e.target.value)}><option value="all">All categories</option>{p.categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="sort-filter"><span className="sr-only">Sort encounters</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name: A–Z</option><option value="locations">Locations first</option></select></label><div className="layout-switch" aria-label="Display layout"><button aria-label="Grid view" aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'chosen' : ''} onClick={() => setLayout('grid')}><Icon name="grid" size={16}/></button><button aria-label="List view" aria-pressed={layout === 'list'} className={layout === 'list' ? 'chosen' : ''} onClick={() => setLayout('list')}><Icon name="list" size={17}/></button></div></div>
      <div className="results-meta"><span role="status">{p.ready ? `${p.bosses.length} encounter${p.bosses.length === 1 ? '' : 's'}` : 'Loading encounters…'}{p.search && ` matching “${p.search}”`}</span></div>
      <div className={`discovery-cards ${layout === 'list' ? 'list-layout' : ''}`}>{sorted.slice(0, limit).map(b => { const supported = !!b.raw || !!b.supportedBy?.length; const saved = p.drafts[b.id]; return <button className="discovery-card" key={b.id} onClick={() => p.onSelect(b)}><BossPortrait boss={b}/><div className="card-top"><span className={`encounter-status ${saved ? 'draft-status' : supported ? 'supported-status' : ''}`}><span className="dot"/>{saved ? 'Draft saved' : supported ? 'Supported' : 'Needs coverage'}</span></div><div className="card-copy"><span className="card-category">{b.area??b.categories?.[0]??'Encounter'}</span><h3>{b.name}</h3></div><div className="card-bottom"><span><Icon name={b.maps.length ? 'map' : 'compass'} size={14}/>{b.maps.length ? `${b.maps.length} wiki locations` : 'Explore locations'}</span><Icon name="arrow" size={17}/></div></button>; })}</div>
      {p.ready && !p.bosses.length && <div className="library-empty"><Icon name={p.filter === 'drafts' ? 'file' : 'search'} size={34}/><h3>{p.filter === 'drafts' ? 'Your next contribution starts here.' : 'No encounters found.'}</h3><p>{p.filter === 'drafts' ? 'Choose an encounter and edit its coverage to save your first draft.' : 'Try another name or choose a collection.'}</p><button onClick={reset}>Browse all encounters <Icon name="arrow" size={16}/></button></div>}
      {sorted.length > limit && <div className="load-more"><button onClick={() => setLimit(n => n + 24)}>Show more encounters <Icon name="plus" size={16}/></button><span>Showing {Math.min(limit, sorted.length)} of {sorted.length}</span></div>}
    </div><footer className="discovery-footer"><span><Icon name="spark" size={14}/> Every contribution makes Gielinor a little safer.</span><a href={p.category==='Dungeons'?'https://oldschool.runescape.wiki/w/List_of_dungeons':'https://oldschool.runescape.wiki/w/Boss'} target="_blank" rel="noreferrer">Encounter data, maps & portraits · OSRS Wiki <Icon name="external" size={12}/></a></footer>
  </section>;
}
