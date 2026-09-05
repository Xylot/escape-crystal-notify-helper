import { applyProposal, PLUGIN_REPO } from './proposal.mjs';
import { chunkOrigin, regionId } from './coordinates.mjs';

// Reviewing an entrance must not erase a completed coverage review (or vice versa).
export function mergeDraft(draft, change) {
  const coverageChanged = ['name', 'regions', 'deathType', 'chunks'].some(key =>
    key in change && JSON.stringify(change[key]) !== JSON.stringify(draft[key]));
  const next = { ...draft, ...change, reviewed: change.reviewed ?? (coverageChanged ? false : draft.reviewed) };
  if ('regions' in change && !('chunks' in change) && next.chunks) {
    next.chunks = next.chunks.filter(id => {
      if (!Number.isInteger(id) || id < 0 || id > 4194303) return false;
      const point = chunkOrigin(id);
      return next.regions.includes(regionId(point.x, point.y));
    });
  }
  const entranceContextChanged = ['entranceRegion', 'entrancePlane'].some(key =>
    key in change && change[key] !== draft[key]);
  if (entranceContextChanged && next.entrance) {
    next.entrance = { ...next.entrance, reviewed: false };
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
