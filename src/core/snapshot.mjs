const timestamp=value=>Number.isFinite(Date.parse(value??''))?Date.parse(value):0;
export const pluginFetchedAt=snapshot=>snapshot.pluginFetchedAt??snapshot.generatedAt??null;
// Legacy plugin sync also changed generatedAt; only catalog.fetchedAt dates wiki data.
export const wikiFetchedAt=snapshot=>snapshot.wikiFetchedAt??snapshot.catalog?.fetchedAt??null;

export function mergeSnapshots(published,saved){
  if(!saved)return published;
  const plugin=saved.baseCommit&&timestamp(pluginFetchedAt(saved))>timestamp(pluginFetchedAt(published))?saved:published;
  const wiki=saved.catalog&&timestamp(wikiFetchedAt(saved))>timestamp(wikiFetchedAt(published))?saved:published;
  return {...published,baseCommit:plugin.baseCommit,source:plugin.source,entries:plugin.entries,metadataSources:plugin.metadataSources,
    pluginFetchedAt:pluginFetchedAt(plugin),candidates:wiki.candidates,catalog:wiki.catalog,dungeons:wiki.dungeons??published.dungeons,wikiFetchedAt:wikiFetchedAt(wiki)};
}
