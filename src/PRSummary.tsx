import {isDungeon} from './core/encounter-kind.mjs';
import {itemIconId,itemIconName} from './core/item-icon.mjs';
import {MoidThumbnail} from './EntrancePortraits';
import type {EvidenceImage} from './pr-screenshots';

function StateSummary({state,models,sources,images}:{state:any;models:string[];sources:string[];images:EvidenceImage[]}){
  const dungeon=isDungeon(state),entrance=state.entrance,overlay=entrance?.overlay??state.entranceOverlay,petId=itemIconId(state.petIcon);
  return <>
    <p>Encounter name: {state.name}</p>
    <p>Dangerous for: {state.deathType==='UNSAFE'?'HC & HCGIM':state.deathType==='UNSAFE_HCGIM'?'HCGIM only':'Neither'}</p>
    {!dungeon&&<>
      <p>Recommended inactivity time: {state.recommendedSeconds!==undefined?`${state.recommendedSeconds} seconds`:'Unchanged'}</p>
      <p>Entrance priority: {overlay?overlay.startsWith('DEPRIORITIZED')?'Deprioritized':'Prioritized':state.entranceRaw?'Preserved source settings':'No entrance'}</p>
      <p>Entrance dangerous: {state.entranceDangerous===false?'No':state.entranceDangerous===true?'Yes':state.entranceRaw?'Same as encounter':'Not applicable'}</p>
      <p>Boss instanced: {state.bossInstanced?'Yes':'No'}</p>
      <h5>Pet: {itemIconName(state.petIcon)}</h5>
      {petId?<img className="pr-pet-icon" src={`https://static.runelite.net/cache/item/icon/${petId}.png`} alt={`Pet icon for ${state.name}`}/>:<p>{state.petIcon?'Icon unavailable for this item constant.':'Not configured.'}</p>}
      <h5>Entrance Model</h5>
      {models.length?<div className="entrance-portraits">{models.map(id=><MoidThumbnail key={id} id={id}/>)}</div>:<p>No model reference selected.</p>}
    </>}
    <h5>Region &amp; Chunk screenshots</h5>
    <div className="pr-images">{images.map(image=><figure key={image.id}><img src={image.url} alt={image.id.replaceAll('_',' ')}/></figure>)}</div>
    {!images.length&&<p className="muted">Screenshots appear when the preview is prepared.</p>}
    <details className="pr-technical"><summary>IDs and technical details</summary>
      <p>Encounter ID: {state.id}</p><p>Death classification: {state.deathType}</p>
      <p>{dungeon?'Dungeon':'Arena'} regions: {(state.arenaRegions??state.regions).join(', ')}</p>
      <p>Coverage chunks: {state.chunks?.join(', ')||'Whole regions'}</p>
      {!dungeon&&<><p>Entrance regions: {state.entranceRegions?.join(', ')||'None'}</p><p>Entrance coverage chunks: {state.entranceNotifyChunks?.join(', ')||'Whole entrance area'}</p>
        {entrance&&<><p>Entrance IDs: {entrance.ids.join(', ')}</p><p>Entrance object type: {entrance.objectType}</p><p>Entrance chunks: {entrance.chunks.join(', ')||'None'}</p><p>Entrance options: {entrance.overlay}, direction {entrance.direction||'default'}, plane {entrance.plane||'default'}</p></>}
        <p>Pet item: {state.petIcon??'None'}{petId?` (ID ${petId})`:''}</p></>}
      {state.entranceRaw&&!entrance&&<pre>{state.entranceRaw}</pre>}{!!state.extraSettings?.length&&<pre>{state.extraSettings.join('\n')}</pre>}
      <h5>Wiki sources</h5><div className="pr-sources">{sources.map(source=><a key={source} href={source} target="_blank" rel="noreferrer">{decodeURIComponent(new URL(source).pathname.slice(3)).replaceAll('_',' ')} ↗</a>)}</div>
    </details>
  </>;
}

export function EncounterSummary({change,preview,images}:{change:any;preview:any;images:EvidenceImage[]}){
  const pair=preview.states?.[change.id],presentation=preview.presentation?.[change.id];
  const render=(phase:'before'|'after')=><StateSummary state={pair?.[phase]??change} models={(phase==='before'?presentation?.beforeImages:presentation?.images)??[]} sources={preview.evidence.sources[change.id]??[]} images={images.filter(image=>preview.evidence.panels.some((p:any)=>p.id===image.id&&p.bossId===change.id&&(!pair?.before||p.state===phase)))}/>;
  return <article><h4>{change.name}</h4>{render('after')}{pair?.before&&<details className="pr-before"><summary>Before</summary>{render('before')}</details>}</article>;
}
