import {isDungeon} from './encounter-kind.mjs';
import { integer, regionOrigin, regionId, chunkOrigin } from './coordinates.mjs';
import {splitArgs} from './java.mjs';
import {originalEntranceChunks} from './encounter.mjs';

export function wikiSource(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.origin !== 'https://oldschool.runescape.wiki' || !url.pathname.startsWith('/w/') || url.username || url.password) throw new Error('Evidence sources must be OSRS Wiki articles.');
  return url.href;
}

export function mapContext(value) {
  if (!value) throw new Error('Choose a map location and plane before preparing screenshots.');
  const result = { x: integer(value.x, 0, 16383, 'Map X'), y: integer(value.y, 0, 16383, 'Map Y'), plane: integer(value.plane ?? 0, 0, 3, 'Map plane') };
  if (value.tiles) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(value.tiles.version)) throw new Error('Invalid map version.');
    result.tiles = { version: value.tiles.version, mapId: integer(value.tiles.mapId, -1, 100000, 'Map ID'), plane: result.plane };
  }
  // Plugin-derived/manual locations have no wiki article of their own.
  if (value.source?.startsWith('https://oldschool.runescape.wiki/')) result.source = wikiSource(value.source);
  if (value.revision != null) result.revision = integer(value.revision, 1, Number.MAX_SAFE_INTEGER, 'Wiki revision');
  return result;
}

// Connected selections stay together; large groups split into <=4x4 region panels.
export function regionGroups(regions) {
  const remaining = new Set(regions.map(id => integer(id, 0, 65535, 'Region ID'))), groups = [];
  while (remaining.size) {
    const first = Math.min(...remaining), connected = [], pending = [first]; remaining.delete(first);
    while (pending.length) {
      const id = pending.pop(), x = id >> 8, y = id & 255; connected.push(id);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, next = (nx << 8) | ny;
        if (nx >= 0 && nx <= 255 && ny >= 0 && ny <= 255 && remaining.delete(next)) pending.push(next);
      }
    }
    const bins = new Map(), minX = Math.min(...connected.map(id => id >> 8)), minY = Math.min(...connected.map(id => id & 255));
    for (const id of connected.sort((a,b)=>a-b)) {
      const key = `${Math.floor(((id >> 8)-minX)/4)}:${Math.floor(((id & 255)-minY)/4)}`;
      if (!bins.has(key)) bins.set(key, []); bins.get(key).push(id);
    }
    groups.push(...bins.values());
  }
  return groups;
}

export function evidencePlan(changes, contexts, sources) {
  const panels = [], normalizedContexts = {}, normalizedSources = {};
  for (const change of changes) {
    const supplied = contexts?.[change.id] ?? {};
    const priorityChanged = change.entranceOverlay && change.baseRaw?.includes('EscapeCrystalNotifyRegionEntrance(') && !change.baseRaw.includes(`OverlayType.${change.entranceOverlay}`);
    const preservedChunks = priorityChanged ? originalEntranceChunks(splitArgs(change.baseRaw.slice(change.baseRaw.indexOf('(')+1,-1))) : [];
    const entranceChunks = change.entrance?.chunks ?? preservedChunks;
    const arena = mapContext(supplied.arena), entrance = change.entrance || priorityChanged ? mapContext(supplied.entrance) : null;
    normalizedContexts[change.id] = { arena, ...(entrance ? { entrance } : {}) };
    const links = new Set((sources?.[change.id] ?? []).map(wikiSource).filter(Boolean));
    for (const context of [arena, entrance].filter(Boolean)) {
      if (context.source) {
        links.add(context.source);
        if (context.revision) { const url = new URL(context.source); url.searchParams.set('oldid', String(context.revision)); links.add(url.href); }
      }
    }
    if (!links.size || links.size > 12) throw new Error(`Provide 1–12 wiki sources for ${change.name}.`);
    normalizedSources[change.id] = [...links].sort();
    const entranceRegions = entranceChunks.length ? [...new Set(entranceChunks.map(id => { const p = chunkOrigin(id); return regionId(p.x, p.y); }))] : change.entranceRegions??(entrance ? [integer(change.entranceRegion ?? supplied.entrance.region ?? regionId(entrance.x, entrance.y), 0, 65535, 'Entrance region')] : []);
    for (const [kind, context, regions, chunks] of [['arena', arena, change.regions, change.chunks ?? []], ['entrance', entrance, entranceRegions, entranceChunks]]) {
      if (!context) continue;
      for (const [index, group] of regionGroups(regions).entries()) {
        const xs = group.map(id=>id>>8), ys = group.map(id=>id&255);
        const selectedChunks = chunks.filter(id=>{ const p=chunkOrigin(id);return group.includes(regionId(p.x,p.y)); });
        panels.push({ id: `${change.id}-${kind}-${index+1}`, bossId: change.id, name: change.name, kind, ...(isDungeon(change)?{label:'Dungeon coverage'}:{}), context, regions: group, chunks: selectedChunks, restrictChunks: chunks.length > 0, renderScale: 2,
          minX: Math.min(...xs), maxY: Math.max(...ys), columns: Math.max(...xs)-Math.min(...xs)+1, rows: Math.max(...ys)-Math.min(...ys)+1 });
      }
    }
  }
  if (panels.length > 32) throw new Error('This selection needs more than 32 screenshots. Split it into smaller PRs.');
  return { panels, contexts: normalizedContexts, sources: normalizedSources };
}

export function cleanChanges(changes) {
  if (!Array.isArray(changes) || changes.length > 100) throw new Error('Choose 1–100 encounters.');
  return changes.map(c => {
    const result = Object.fromEntries(['bossInstanced','recommendedSeconds','petIcon','metadataBase','id','name','regionType','regions','deathType','baseRaw','chunks','entranceOverlay','entranceRegion','entranceDangerous','entranceNotifyChunks','entranceBaseRaw'].filter(key=>c[key]!==undefined).map(key=>[key,c[key]]));
    if (c.entrance) result.entrance = Object.fromEntries(['overlay','direction','plane','objectType','ids','chunks','bossInstanced'].map(key=>[key,c.entrance[key]]));
    return result;
  }).sort((a,b)=>a.id.localeCompare(b.id));
}

export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')}}`;
  return JSON.stringify(value);
}

export function panelSize(panel) { const scale=panel.renderScale===2?2:1;return { width: Math.max(640, panel.columns * 256 + 32)*scale, height: (panel.rows * 256 + 144 + Math.ceil(panel.chunks.length / 10) * 18)*scale }; }
