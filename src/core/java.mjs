import { entranceJava } from './entrance.mjs';
import { encounterType, isDungeon } from './encounter-kind.mjs';
import { integer, chunkOrigin, regionId } from './coordinates.mjs';
// A deliberately narrow Java scanner. It preserves opaque optional constructor
// arguments; it never evaluates source and fails closed on unsupported syntax.
export function maskJava(source, strings = false) {
  let out = '', mode = '', escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (mode === 'line') { if (c === '\n') mode = ''; out += c === '\n' ? '\n' : ' '; continue; }
    if (mode === 'block') { if (c === '*' && next === '/') { out += '  '; i++; mode = ''; } else out += c === '\n' ? '\n' : ' '; continue; }
    if (mode === '"' || mode === "'") {
      out += strings && c !== '\n' ? ' ' : c;
      if (!escaped && c === mode) mode = '';
      if (!escaped && c === '\\') escaped = true; else escaped = false;
      continue;
    }
    if (c === '/' && next === '/') { mode = 'line'; out += '  '; i++; }
    else if (c === '/' && next === '*') { mode = 'block'; out += '  '; i++; }
    else if (c === '"' || c === "'") { mode = c; out += strings ? ' ' : c; }
    else out += c;
  }
  if (mode && mode !== 'line') throw new Error('Unterminated Java comment or string.');
  return out;
}
export function splitArgs(source) {
  const mask = maskJava(source, true), args = []; let start = 0, depth = 0;
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i];
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (depth < 0) throw new Error('Unbalanced Java expression.');
    if (c === ',' && depth === 0) { args.push(source.slice(start, i).trim()); start = i + 1; }
  }
  if (depth) throw new Error('Unbalanced Java expression.');
  args.push(source.slice(start).trim()); return args;
}
export function parseJava(source) {
  const mask = maskJava(source, true);
  const header = /\benum\s+EscapeCrystalNotifyRegion\s*\{/.exec(mask);
  if (!header) throw new Error('Expected enum EscapeCrystalNotifyRegion.');
  let end = header.index + header[0].length, depth = 0;
  for (; end < mask.length; end++) {
    const c = mask[end];
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ';' && !depth) break;
  }
  if (end === mask.length) throw new Error('Missing enum terminator.');
  const entries = [], pattern = /\b([A-Z][A-Z0-9_]*)\s*\(/g;
  pattern.lastIndex = header.index + header[0].length;
  let match;
  while ((match = pattern.exec(mask)) && match.index < end) {
    const start = match.index; let close = pattern.lastIndex, nesting = 1;
    for (; close < end && nesting; close++) { if (mask[close] === '(') nesting++; if (mask[close] === ')') nesting--; }
    if (nesting) throw new Error(`Unbalanced entry ${match[1]}.`);
    const raw = source.slice(start, close), args = splitArgs(source.slice(pattern.lastIndex, close - 1));
    const clean = args.map(x => maskJava(x).trim());
    if (!/^"(?:[^"\\]|\\.)*"$/.test(clean[0])) throw new Error(`Unsupported name expression in ${match[1]}.`);
    let name; try { name = JSON.parse(clean[0]); } catch { throw new Error(`Unsupported Java string escape in ${match[1]}.`); }
    let regionStart = args.length;
    while (regionStart > 3 && /^\d+$/.test(clean[regionStart - 1])) regionStart--;
    if (regionStart === args.length) throw new Error(`No literal region IDs in ${match[1]}; review source manually.`);
    const regions = clean.slice(regionStart).map(Number);
    if (regions.some(n => n > 65535)) throw new Error(`Invalid region ID in ${match[1]}.`);
    const regionType = clean[1]?.match(/^EscapeCrystalNotifyRegionType\.([A-Z_]+)$/)?.[1];
    const deathType = clean[2]?.match(/^EscapeCrystalNotifyRegionDeathType\.([A-Z_]+)$/)?.[1];
    if (!regionType || !deathType) throw new Error(`Unsupported classification in ${match[1]}.`);
    const optionalArgs = args.slice(3, regionStart);
    entries.push({ id: match[1], name, regionType, deathType, regions, optionalArgs, raw, start, end: close });
    pattern.lastIndex = close;
  }
  if (!entries.length) throw new Error('No enum entries found.');
  return { entries, insertAt: entries[0].start, terminator: end };
}
export function enumName(name, type = 'BOSSES') { return (type === 'DUNGEONS' ? 'DUNGEON_' : 'BOSS_') + name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase(); }
export function javaString(name) { return JSON.stringify(name).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function literalChunks(expression) {
  if (!expression) return [];
  if (!/^List\.of\([\d,\s]*\)$/.test(expression)) throw new Error('Existing chunk restrictions need manual Java review.');
  const values = expression.slice(expression.indexOf('(') + 1, -1).trim();
  return values ? values.split(',').map(value => integer(Number(value.trim()), 0, 4194303, 'Chunk ID')) : [];
}

// Draft regions remain arena selections. Only the generated entry combines arena and entrance coverage.
/** @param {any} change @param {any} existing */
export function exportCoverage(change, existing = null) {
  const optional = existing?.optionalArgs?.map(arg => maskJava(arg).trim()) ?? [];
  const preserved = optional.find(arg => arg.startsWith('new EscapeCrystalNotifyRegionEntrance('));
  const hasEntrance = !isDungeon(change) && !!(change.entrance || preserved);
  const preservedChunks = preserved ? splitArgs(preserved.slice(preserved.indexOf('(') + 1, -1)).find(arg => arg.startsWith('List.')) : undefined;
  const entranceChunks = change.entrance?.chunks ?? literalChunks(preservedChunks);
  entranceChunks.forEach(id => integer(id, 0, 4194303, 'Entrance chunk ID'));
  if (change.entranceRegion !== undefined) integer(change.entranceRegion, 0, 65535, 'Entrance region');
  if (change.entrance && !entranceChunks.length && change.entranceRegion === undefined) {
    throw new Error('Choose an entrance region or entrance chunks before exporting entrance detection.');
  }
  const chunkRegion = id => { const p = chunkOrigin(id); return regionId(p.x, p.y); };
  const sorted = ids => [...new Set(ids)].sort((a, b) => a - b);
  const entranceRegions = hasEntrance ? sorted([
    ...(change.entranceRegion === undefined ? [] : [change.entranceRegion]), ...entranceChunks.map(chunkRegion),
  ]) : [];
  if (hasEntrance && entranceChunks.length && change.entranceRegion !== undefined
      && !entranceChunks.some(id => chunkRegion(id) === change.entranceRegion)) {
    throw new Error('The selected entrance region has no entrance chunks. Update its chunks or choose the matching entrance region.');
  }
  const regions = sorted([...change.regions, ...entranceRegions]);
  if (regions.length > 256) throw new Error('Combined arena and entrance coverage exceeds 256 regions.');
  const originalChunks = optional.find(arg => arg.startsWith('List.'));
  let chunks = change.chunks ?? (originalChunks ? literalChunks(originalChunks) : undefined);
  if (chunks?.length) {
    chunks.forEach(id => integer(id, 0, 4194303, 'Region chunk ID'));
    if (chunks.some(id => !change.regions.includes(chunkRegion(id)))) throw new Error('Region-restriction chunks must lie inside selected arena regions.');
    if (hasEntrance && !entranceChunks.length) throw new Error('Select entrance chunks or remove arena chunk restrictions so the entrance can trigger warnings.');
    chunks = sorted([...chunks, ...entranceChunks]);
    if (regions.some(id => !chunks.some(chunk => chunkRegion(chunk) === id))) throw new Error('Select chunks in every covered region or remove arena chunk restrictions.');
    if (chunks.length > 256) throw new Error('Combined arena and entrance coverage exceeds 256 chunks.');
  }
  return { regions, entranceRegions, chunks };
}

/** @param {any} change @param {any} existing */
export function generateEntry(change, existing = null) {
  const type=encounterType(change);
  if(!['BOSSES','DUNGEONS'].includes(type))throw new Error('Unsupported encounter category.');
  if(isDungeon(change)&&(change.entrance||change.entranceOverlay))throw new Error('Dungeons do not have entrance settings.');
  const coverage = exportCoverage(change, existing);
  let optional = existing ? [...existing.optionalArgs] : [];
  if (!change.entrance && change.entranceOverlay) {
    if (!['PRIORITIZED_WITH_HIGHLIGHT','DEPRIORITIZED_WITH_HIGHLIGHT'].includes(change.entranceOverlay)) throw new Error('Unsupported entrance priority.');
    optional = optional.map(a => {
      if (!maskJava(a).trim().startsWith('new EscapeCrystalNotifyRegionEntrance(')) return a;
      const masked = maskJava(a), match = /EscapeCrystalNotifyRegionEntranceOverlayType\.(?:PRIORITIZED_WITH_HIGHLIGHT|DEPRIORITIZED_WITH_HIGHLIGHT)/.exec(masked);
      if (!match) throw new Error('Existing entrance priority requires manual Java review.');
      return a.slice(0, match.index) + `EscapeCrystalNotifyRegionEntranceOverlayType.${change.entranceOverlay}` + a.slice(match.index + match[0].length);
    });
  }
  if (change.entrance) {
    const i = optional.findIndex(a => maskJava(a).trim().startsWith('new EscapeCrystalNotifyRegionEntrance('));
    if (i >= 0) optional[i] = entranceJava(change.entrance);
    else optional.unshift(entranceJava(change.entrance));
  }
  const originalChunkArg = existing?.optionalArgs.map(a => maskJava(a).trim()).find(a => a.startsWith('List.'));
  const originalChunkIds = originalChunkArg ? literalChunks(originalChunkArg) : [];
  const sameChunks = (a, b) => JSON.stringify([...new Set(a)].sort((x,y)=>x-y)) === JSON.stringify([...new Set(b)].sort((x,y)=>x-y));
  if (coverage.chunks !== undefined && (change.chunks !== undefined || !sameChunks(coverage.chunks, originalChunkIds))) {
    const i = optional.findIndex(a => /^List\.of\([\d,\s]*\)$/.test(maskJava(a).trim()));
    if(i>=0) optional.splice(i,1);
    if(coverage.chunks.length) {
      if(!isDungeon(change)&&!optional.some(a=>a.includes('EscapeCrystalNotifyRegionEntrance('))&&!optional.includes('null'))optional.unshift('null');
      optional.push(`List.of(${coverage.chunks.join(', ')})`);
    }
  }
  const args = [javaString(change.name), `EscapeCrystalNotifyRegionType.${type}`, `EscapeCrystalNotifyRegionDeathType.${change.deathType}`, ...optional, ...coverage.regions];
  return `${change.id}(${args.join(', ')})`;
}
