import { applyProposal, PLUGIN_REPO } from './proposal.mjs';
import { chunkOrigin, regionId } from './coordinates.mjs';

export function defaultDraft(draft) {
  return { ...draft, deathType: draft.deathType || 'UNSAFE' };
}

export function entranceOverlay(draft) {
  return draft.entrance?.overlay ?? draft.entranceOverlay ?? draft.baseRaw?.match(/EscapeCrystalNotifyRegionEntranceOverlayType\.(PRIORITIZED_WITH_HIGHLIGHT|DEPRIORITIZED_WITH_HIGHLIGHT)/)?.[1] ?? 'DEPRIORITIZED_WITH_HIGHLIGHT';
}

// Keep chunk restrictions within the selected coverage.
export function mergeDraft(draft, change) {
  const next = { ...draft, ...change };
  if ('entranceOverlay' in change && next.entrance) next.entrance = {...next.entrance, overlay: change.entranceOverlay};
  if (change.entrance) next.entranceOverlay = change.entrance.overlay;
  if ('regions' in change && !('chunks' in change) && next.chunks) {
    next.chunks = next.chunks.filter(id => {
      if (!Number.isInteger(id) || id < 0 || id > 4194303) return false;
      const point = chunkOrigin(id);
      return next.regions.includes(regionId(point.x, point.y));
    });
  }
  return next;
}

// Use the same validation and source-preserving generator as the final export.
export function exportProblem(snapshot, changes) {
  if (!changes.length) return 'Choose at least one draft to export.';
  try {
    applyProposal(snapshot.source, {
      version: 1, repository: PLUGIN_REPO, baseCommit: snapshot.baseCommit, changes,
    });
    return '';
  } catch (error) {
    return error.message;
  }
}
