import type {Boss,Draft} from './types';
import {usePetLookup} from './usePetLookup';

export default function EncounterMetadata({boss,draft,update}:{boss:Boss;draft:Draft;update:(change:Partial<Draft>)=>void}) {
  const {lookup,findPet,editPet}=usePetLookup(boss,draft,update);
  return <fieldset className="encounter-metadata" disabled={!draft.metadataBase}>
    <legend>Escape Crystal recommendation</legend>
    {!draft.metadataBase&&<p className="warning">Sync plugin to load the current inactivity times and pet icons.</p>}
    {draft.metadataBase&&draft.metadataBase.canonicalId!==draft.id&&<p>These settings are shared with {draft.metadataBase.canonicalId.replace(/^(BOSS|RAIDS)_/,'').replaceAll('_',' ')}.</p>}
    <label className="field">What should the recommended Escape Crystal inactivity time be for this boss/raid?
      <input type="number" min={2} max={2147483647} step={1} value={draft.recommendedSeconds??''} onChange={e=>update({recommendedSeconds:e.target.value===''?null:Number(e.target.value)})} aria-describedby="inactivity-help"/>
    </label>
    <p id="inactivity-help" className="muted">Seconds of inactivity. Enter a whole number of at least 2 seconds. This sets the encounter’s recommended maximum.</p>
    <label className="field">Pet icon item<input value={draft.petIcon??''} maxLength={160} placeholder="Resolved automatically when a unique pet is found" onChange={e=>editPet(e.target.value)} aria-describedby="pet-icon-help"/></label>
    <p id="pet-icon-help" className="muted">We look up the pet’s inventory item ID on the wiki. You can override it with an item ID or RuneLite ItemID constant. For encounters without a pet, choose a representative item.</p>
    <div className="pet-lookup"><button type="button" disabled={!!lookup.busy} onClick={()=>void findPet(true)}>{lookup.busy?'Looking up pet…':'Find pet automatically'}</button><p role="status">{lookup.message}{lookup.source&&<> · <a href={lookup.source} target="_blank" rel="noreferrer">Wiki source ↗</a></>}</p></div>
  </fieldset>;
}
