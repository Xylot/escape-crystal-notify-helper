import { maskJava, parseJava, splitArgs } from './java.mjs';
import { validateEntrance } from './entrance.mjs';
import { entranceOverlay, mergeDraft } from './authoring.mjs';
import {notificationChunks} from './encounter-export.mjs';

const entrancePrefix = 'new EscapeCrystalNotifyRegionEntrance(';
const unique = values => [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric:true}));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function baselineEntry(raw) {
  return parseJava(`enum EscapeCrystalNotifyRegion { ${raw}; }`).entries[0];
}

function literalList(value) {
  if (!/^List\.of\([\d,\s]*\)$/.test(value)) return undefined;
  const body = value.slice(value.indexOf('(') + 1, -1).trim();
  return body ? body.split(',').map(Number) : [];
}

// Only hydrate constructors that the existing export model can represent fully.
// Special flags are deliberately not guessed or discarded.
export function readEntrance(optionalArgs) {
  const raw = optionalArgs.find(a => maskJava(a).trim().startsWith(entrancePrefix));
  if (!raw) return {raw:null, value:undefined, reason:''};
  const unsupported = {raw, value:undefined, reason:'This entrance has special settings that need a source edit. Its existing configuration is preserved.'};
  try {
    const clean = maskJava(raw).trim();
    const args = splitArgs(clean.slice(clean.indexOf('(') + 1, -1));
    const takeEnum = prefix => args[0]?.startsWith(prefix) ? args.shift().slice(prefix.length) : '';
    const overlay = takeEnum('EscapeCrystalNotifyRegionEntranceOverlayType.');
    const direction = takeEnum('EscapeCrystalNotifyRegionEntranceDirection.');
    const chunksArg = args.shift();
    const chunks = chunksArg === 'null' ? [] : literalList(chunksArg ?? '');
    const plane = takeEnum('EscapeCrystalNotifyRegionEntrancePlaneLevel.');
    const objectType = takeEnum('EscapeCrystalNotifyRegionEntranceObjectType.');
    if (!chunks || !objectType) return unsupported;
    const value = {overlay, direction, chunks, plane, objectType, ids:args};
    validateEntrance(value);
    return {raw, value, reason:''};
  } catch { return unsupported; }
}

export function existingDraft(entry) {
  return {id:entry.id, name:entry.name, regionType:entry.regionType, deathType:entry.deathType, regions:[...entry.regions], baseRaw:entry.raw,
    ...(entry.entranceEntry?{entranceBaseRaw:entry.entranceEntry.raw,entranceDangerous:!notificationChunks(entry.entranceEntry).length,entranceNotifyChunks:notificationChunks(entry.entranceEntry)}:{})};
}

export function editingBaseline(raw, entranceBaseRaw) {
  const entry = baselineEntry(raw);
  const paired=entranceBaseRaw?baselineEntry(entranceBaseRaw):null;
  const entrance = readEntrance((paired??entry).optionalArgs);
  const chunkExpression = entry.optionalArgs.map(a => maskJava(a).trim()).find(a => a.startsWith('List.'));
  const chunks = chunkExpression ? literalList(chunkExpression) : undefined;
  const quest = entry.optionalArgs.some(a => maskJava(a).includes('Quest.'));
  return {entry, entrance, chunks,
    coverageReason:quest ? 'Quest-gated coverage restrictions need a source edit.' : chunkExpression && !chunks ? 'These coverage restrictions need a source edit.' : '',
    entranceReason:quest ? 'This quest-gated entrance needs a source edit. Its existing configuration is preserved.' : entrance.reason,
    draft:existingDraft({...entry,entranceEntry:paired})};
}

export function editableDraft(draft) {
  const baseline = editingBaseline(draft.baseRaw,draft.entranceBaseRaw);
  return {...draft,
    chunks:draft.chunks ?? baseline.chunks,
    entrance:draft.entrance ?? (baseline.entrance.value ? {...baseline.entrance.value, overlay:entranceOverlay(draft)} : undefined)};
}

function entranceValue(value, omitOverlay = false) {
  if (!value) return null;
  return {...(!omitOverlay ? {overlay:value.overlay} : {}), direction:value.direction, plane:value.plane,
    objectType:value.objectType, ids:unique(value.ids), chunks:unique(value.chunks)};
}

export function sectionValues(draft, section) {
  const current = editableDraft(draft);
  if (section === 'details') return {name:current.name, deathType:current.deathType};
  if (section === 'coverage') return {regions:unique(current.regions), chunks:unique(current.chunks ?? [])};
  return {entrance:entranceValue(current.entrance), priority:entranceOverlay(current),dangerous:current.entranceDangerous??null,notifyChunks:unique(current.entranceNotifyChunks??[]),
    region:current.entranceRegion ?? null, plane:current.entrancePlane ?? null};
}

export function changedSections(draft) {
  const baseline = editingBaseline(draft.baseRaw,draft.entranceBaseRaw).draft;
  return ['details','coverage', ...(baseline.regionType === 'DUNGEONS' ? [] : ['entrance'])]
    .filter(section => !equal(sectionValues(draft,section), sectionValues(baseline,section)));
}

// Keep hydration local to the form. Persist only deliberate edits, so unrelated
// changes never replace preserved constructors or trip quest-gate validation.
export function applySection(previous, working, section) {
  const baseline = editingBaseline(previous.baseRaw,previous.entranceBaseRaw);
  const keys = section === 'details' ? ['name','deathType'] : section === 'coverage' ? ['regions','chunks'] : ['entrance','entranceOverlay','entranceRegion','entrancePlane','entranceDangerous','entranceNotifyChunks'];
  const patch = Object.fromEntries(keys.map(key => [key, working[key]]));
  if (patch.entrance) delete patch.entranceOverlay;
  const next = mergeDraft(previous, patch);
  if (equal(unique(next.chunks ?? baseline.chunks ?? []), unique(baseline.chunks ?? []))) delete next.chunks;
  if (next.entrance && baseline.entrance.value && equal(entranceValue(next.entrance,true), entranceValue(baseline.entrance.value,true))) {
    next.entranceOverlay = next.entrance.overlay;
    delete next.entrance;
  }
  if (next.entranceOverlay === entranceOverlay(baseline.draft)) delete next.entranceOverlay;
  return next;
}

export function sectionUnchanged(previous, working, section) {
  return equal(sectionValues(previous,section), sectionValues(applySection(previous,working,section),section));
}
