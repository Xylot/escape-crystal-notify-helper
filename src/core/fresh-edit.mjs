import {defaultDraft} from './authoring.mjs';
import {existingDraft} from './editing.mjs';
import {sourceEntry} from './encounter-export.mjs';
import {isDungeon} from './encounter-kind.mjs';

// Keep identity and conflict baselines, but never hydrate the guided form from them.
export function freshEditDraft(boss, previous) {
  return defaultDraft({id:boss.id, name:boss.name, regionType:boss.regionType,
    baseRaw:previous ? previous.baseRaw : boss.raw,
    ...(previous?.entranceBaseRaw !== undefined || boss.entranceEntry ? {
      entranceBaseRaw:previous?.entranceBaseRaw !== undefined ? previous.entranceBaseRaw : boss.entranceEntry.raw,
    } : {}),
    editFlow:'fresh', regions:[], chunks:[],
    ...(!isDungeon(boss) ? {entranceDangerous:null, entranceOverlay:'DEPRIORITIZED_WITH_HIGHLIGHT'} : {}),
  });
}

export function freshEditBoss(boss) {
  return {...boss, raw:null, regions:[], deathType:'', optionalArgs:[], entranceEntry:undefined, supportedBy:[]};
}

export function freshEditForm(draft) {
  const {entranceBaseRaw, ...form} = draft;
  return {...form, baseRaw:null};
}

// The existing proposal contract preserves an entrance when no replacement was
// authored. Keep that behavior, including paired entries, and omit UI metadata.
export function proposalDraft(draft) {
  const {editFlow, ...change} = draft;
  if(editFlow !== 'fresh' || change.entrance || isDungeon(change))return change;
  for(const key of ['entranceDangerous','entranceNotifyChunks','entranceRegion','entrancePlane'])delete change[key];
  if(change.entranceBaseRaw) {
    const baseline=existingDraft({...sourceEntry(change.baseRaw),entranceEntry:sourceEntry(change.entranceBaseRaw)});
    change.entranceDangerous=baseline.entranceDangerous;
    change.entranceNotifyChunks=baseline.entranceNotifyChunks;
  }
  return change;
}
