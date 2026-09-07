import { parseJava, generateEntry, exportCoverage } from './java.mjs';
import { integer, chunkOrigin, regionId } from './coordinates.mjs';
import { validateEntrance, OVERLAYS } from './entrance.mjs';
import { encounterType } from './encounter-kind.mjs';
export const PLUGIN_REPO = 'Xylot/escape-crystal-notify';
export const JAVA_PATH = 'src/main/java/com/escapecrystalnotify/EscapeCrystalNotifyRegion.java';
export function validateProposal(proposal) {
  if (!proposal || proposal.version !== 1 || proposal.repository !== PLUGIN_REPO) throw new Error('Unsupported proposal format or target repository.');
  if (!/^[a-f0-9]{40}$/.test(proposal.baseCommit)) throw new Error('Refresh plugin data before exporting: a verified source commit is required.');
  if (!Array.isArray(proposal.changes) || !proposal.changes.length || proposal.changes.length > 100) throw new Error('Proposal must contain 1–100 changes.');
  const ids = new Set();
  for (const c of proposal.changes) {
    const type=encounterType(c);
    if (!['BOSSES','DUNGEONS'].includes(type)||!(type==='DUNGEONS'?/^DUNGEON_[A-Z0-9_]+$/:/^BOSS_[A-Z0-9_]+$/).test(c.id) || ids.has(c.id)) throw new Error('Invalid or duplicate enum identifier or category.');
    if(type==='DUNGEONS'&&(c.entrance!==undefined||c.entranceOverlay!==undefined))throw new Error('Dungeons do not have entrance settings.');
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 160 || /[\x00-\x1f]/.test(c.name)) throw new Error('Invalid encounter name.');
    if (!['UNSAFE', 'UNSAFE_HCGIM', 'SAFE'].includes(c.deathType)) throw new Error('Select a supported death classification.');
    if (!Array.isArray(c.regions) || !c.regions.length || c.regions.length > 256) throw new Error('Select 1–256 regions.');
    c.regions.forEach(n => integer(n, 0, 65535, 'Region ID'));
    if (new Set(c.regions).size !== c.regions.length) throw new Error('Duplicate region IDs.');
    if (c.baseRaw !== null && (typeof c.baseRaw !== 'string' || c.baseRaw.length > 20000)) throw new Error('Missing original source entry.');
    if(c.entranceOverlay !== undefined && !OVERLAYS.includes(c.entranceOverlay)) throw new Error('Unsupported entrance priority.');
    if(c.entrance)validateEntrance(c.entrance);
    if(c.chunks!==undefined) {
      if(!Array.isArray(c.chunks)||c.chunks.length>256)throw new Error('Invalid region chunk restrictions.');
      c.chunks.forEach(n=>integer(n,0,4194303,'Chunk ID'));
      if(c.chunks.some(n=>{const p=chunkOrigin(n);return !c.regions.includes(regionId(p.x,p.y));}))throw new Error('Each region-restriction chunk must lie inside a selected region.');
    }
    exportCoverage(c);
  }
  return proposal;
}
export function applyProposal(source, proposal) {
  validateProposal(proposal);
  const parsed = parseJava(source), edits = [], additions = [];
  const availableDeaths = new Set(parsed.entries.map(e => e.deathType));
  for (const c of proposal.changes) {
    if (!availableDeaths.has(c.deathType)) throw new Error(`Death classification ${c.deathType} is not present in current source.`);
    const existing = parsed.entries.find(e => e.id === c.id);
    if ((existing?.raw ?? null) !== c.baseRaw) throw new Error(`Conflict: ${c.id} changed upstream. Refresh and review the original, current, and draft values.`);
    if (existing && existing.regionType !== encounterType(c)) throw new Error('An existing encounter cannot change category.');
    if ((c.entrance || c.chunks !== undefined) && existing?.optionalArgs.some(a=>a.includes('Quest.'))) throw new Error('Quest-gated entrance or chunk edits require manual Java review.');
    // Optional arguments are always read from trusted current source, never proposal text.
    const entry = generateEntry({ ...c, regions: [...c.regions].sort((a,b) => a-b) }, existing);
    if (existing) edits.push({ start: existing.start, end: existing.end, text: entry });
    else additions.push(entry);
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  if (additions.length) edits.push({ start: parsed.insertAt, end: parsed.insertAt, text: additions.join(`,${eol}    `) + `,${eol}    ` });
  let result = source;
  for (const edit of edits.sort((a,b) => b.start-a.start || b.end-a.end)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  parseJava(result); return result;
}
export function overlapWarnings(changes, entries) {
  const covered = changes.map(c => {
    try { return {...c, regions: exportCoverage(c, entries.find(e => e.id === c.id)).regions}; }
    catch { return c; } // Incomplete drafts show their export validation error separately.
  });
  const final = new Map(entries.map(e => [e.id, e]));
  covered.forEach(c => final.set(c.id, c));
  const warnings = [];
  for (const change of covered) for (const other of final.values()) {
    if (other.id === change.id) continue;
    const shared = change.regions.filter(id => other.regions.includes(id));
    if (shared.length) warnings.push(`${change.name} overlaps ${other.name}: ${shared.join(', ')}. Check chunk restrictions and overlapping coverage.`);
  }
  return [...new Set(warnings)];
}
export function fullPatch(before, after) {
  const a = before.replace(/\r\n/g,'\n').split('\n'), b = after.replace(/\r\n/g,'\n').split('\n');
  if (a.at(-1) === '') a.pop(); if (b.at(-1) === '') b.pop();
  return `--- a/${JAVA_PATH}\n+++ b/${JAVA_PATH}\n@@ -1,${a.length} +1,${b.length} @@\n` + a.map(x=>'-'+x).join('\n') + (before.endsWith('\n') ? '\n' : '\n\\ No newline at end of file\n') + b.map(x=>'+'+x).join('\n') + (after.endsWith('\n') ? '\n' : '\n\\ No newline at end of file\n');
}
