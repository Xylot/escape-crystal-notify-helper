import type {Draft} from './types';
import {entranceOverlay} from './core/authoring.mjs';

export default function EncounterSetup({draft,update}:{draft:Draft;update:(change:Partial<Draft>)=>void}) {
  const priority=entranceOverlay(draft);
  return <div className="encounter-setup">
    <header><h2>Before you map the arena</h2><p>Choose how deaths and entrance interactions should behave.</p></header>
    <div className="setup-layout">
    <div className="setup-question" role="radiogroup" aria-labelledby="setup-death-title">
      <div className="setup-prompt"><h3 id="setup-death-title">Death behavior</h3><p>Who loses hardcore status?</p>{draft.deathType==='SAFE'&&<p className="warning">Currently marked safe. Choose a classification only if that should change.</p>}</div>
      <div className="setup-options">
        {[['UNSAFE','Unsafe death','All hardcore accounts.'],['UNSAFE_HCGIM','Unsafe only for HCGIM','Hardcore Group Ironman accounts only.']].map(([value,title,description])=><label key={value} className={`setup-option ${draft.deathType===value?'selected':''}`}><input type="radio" name="death-behavior" value={value} checked={draft.deathType===value} onChange={()=>update({deathType:value})}/><span><strong>{title}</strong><small>{description}</small></span></label>)}
      </div>
    </div>
    <div className="setup-question setup-priority" role="radiogroup" aria-labelledby="setup-priority-title">
      <div className="setup-prompt"><h3 id="setup-priority-title">Entrance priority</h3><p>When an Escape Crystal is missing or inactive:</p></div>
      <div className="setup-options priority-options">
        {[['DEPRIORITIZED_WITH_HIGHLIGHT','Deprioritized','Right-click to enter. The reminder comes first.','entrance-deprioritized.png'],['PRIORITIZED_WITH_HIGHLIGHT','Prioritized','Keep left-click entry. Used in the Wilderness.','entrance-prioritized.png']].map(([value,title,description,file])=><label key={value} className={`setup-option priority-option ${priority===value?'selected':''}`}>
          <div className="setup-example"><img src={`${import.meta.env.BASE_URL}images/${file}`} alt={`${title} entrance menu and highlight, from the plugin README`} width={file.includes('deprioritized')?537:693} height={file.includes('deprioritized')?487:731}/></div>
          <div className="priority-choice"><input type="radio" name="entrance-priority" value={value} checked={priority===value} onChange={()=>update({entranceOverlay:value})}/><span><strong>{title}</strong><small>{description}</small></span></div>
        </label>)}
      </div>
    </div>
    </div>
    <p className="setup-source">Both options highlight the entrance. Examples from the <a href="https://github.com/Xylot/escape-crystal-notify#in-game-view---entrance-highlighting-and-enter-option-deprioritization" target="_blank" rel="noreferrer">plugin README ↗</a>.</p>
  </div>;
}
