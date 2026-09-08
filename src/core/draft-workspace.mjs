// Map selections can become coverage when authoring resumes, so discard them
// with their draft. The reference-image preference is independent of coverage.
export function discardEncounter(workspace, id) {
  const drafts = { ...workspace.drafts };
  const evidenceContexts = { ...workspace.evidenceContexts };
  delete drafts[id];
  const context = evidenceContexts[id];
  if (context && Object.hasOwn(context, 'entranceImage')) {
    evidenceContexts[id] = { entranceImage: context.entranceImage };
  } else {
    delete evidenceContexts[id];
  }
  return { drafts, evidenceContexts };
}
