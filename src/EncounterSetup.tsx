import type {Draft} from './types';
import {entranceOverlay} from './core/authoring.mjs';

export default function EncounterSetup({draft,update}:{draft:Draft;update:(change:Partial<Draft>)=>void}) {
  const priority = entranceOverlay(draft);
  return <div className="encounter-setup">
    <header><span className="eyebrow">ENCOUNTER SETUP</span><h2>Before we map it out</h2><p>Choose how the plugin should behave at {draft.name}.</p></header>
    <fieldset className="setup-question"><legend>What kind of death is it?</legend><div className="setup-options">
      {[['UNSAFE','Unsafe death','Unsafe for all hardcore accounts.'],['UNSAFE_HCGIM','Unsafe only for HCGIM','Only Hardcore Group Ironman accounts lose their status.']].map(([value,title,description])=><label key={value} className={`setup-option ${draft.deathType===value?'selected':''}`}><input type="radio" name="death-behavior" value={value} checked={draft.deathType===value} onChange={()=>update({deathType:value})}/><span><strong>{title}</strong><small>{description}</small></span></label>)}
    </div>{draft.deathType==='SAFE'&&<p className="muted">This existing encounter is marked safe. Choose a new classification only if that should change.</p>}</fieldset>
    <fieldset className="setup-question"><legend>Should the entrance be deprioritized?</legend><p>When an Escape Crystal is missing or inactive, keep entry one click away or move it below the reminder.</p><div className="setup-options priority-options">
      {[['DEPRIORITIZED_WITH_HIGHLIGHT','Deprioritized','Move entry below the reminder. Players must right-click to enter.','entrance-deprioritized.png'],['PRIORITIZED_WITH_HIGHLIGHT','Prioritized','Keep left-click entry available, with the entrance highlight. Used for Wilderness entrances.','entrance-prioritized.png']].map(([value,title,description,file])=><label key={value} className={`setup-option priority-option ${priority===value?'selected':''}`}><div><input type="radio" name="entrance-priority" value={value} checked={priority===value} onChange={()=>update({entranceOverlay:value})}/><span><strong>{title}</strong><small>{description}</small></span></div><img src={`${import.meta.env.BASE_URL}images/${file}`} alt={`${title} entrance menu and highlight, from the plugin README`} width={file.includes('deprioritized')?537:693} height={file.includes('deprioritized')?487:731}/></label>)}
    </div><p className="setup-source">Examples from the <a href="https://github.com/Xylot/escape-crystal-notify#in-game-view---entrance-highlighting-and-enter-option-deprioritization" target="_blank" rel="noreferrer">plugin README ↗</a>. This choice applies when entrance detection is configured.</p></fieldset>
  </div>;
}
