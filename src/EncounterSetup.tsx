import {useEffect,useRef,useState} from 'react';
import type {Boss,Draft} from './types';
import {validInactivity,validPetIcon} from './core/encounter-metadata.mjs';
import {usePetLookup} from './usePetLookup';
import BossPortrait from './BossPortrait';
import {Icon} from './Icons';
import './setup-flow.css';

const questions=['Death behavior','Entrance priority','Inactivity time','Confirm pet'];
export default function EncounterSetup({boss,draft,update,onContinue}:{boss:Boss;draft:Draft;update:(change:Partial<Draft>)=>void;onContinue:()=>void}) {
  const question=Math.min(3,Math.max(0,draft.setupProgress??0));
  const heading=useRef<HTMLHeadingElement>(null);
  const [editingPet,setEditingPet]=useState(false);
  const [petEdited,setPetEdited]=useState(false);
  const {match,lookup,findPet,editPet}=usePetLookup(boss,draft,update,false);
  const petIcon=draft.petIcon||(!petEdited?(boss.raw?draft.metadataBase?.petIcon:match?.itemId):'')||'';
  const matched=!!match&&petIcon===match.itemId;
  const [timeEdited,setTimeEdited]=useState(false);
  const seconds=draft.recommendedSeconds??(timeEdited?null:2);
  const validTime=validInactivity(seconds),validIcon=validPetIcon(petIcon);
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'nearest'});},[question]);
  const answer=(change:Partial<Draft>)=>update({...change,setupProgress:question+1});
  const adjustTime=(delta:number)=>update({recommendedSeconds:Math.min(2147483647,Math.max(2,Number.isFinite(seconds)&&seconds!=null?Math.round(seconds)+delta:2))});
  return <div className="setup-flow">
    <nav className="setup-track" aria-label="Setup questions">{questions.map((label,index)=><button key={label} type="button" aria-current={question===index?'step':undefined} disabled={index>question} onClick={()=>update({setupProgress:index})} className={index<question?'answered':''}><span>{index<question?<Icon name="check" size={13}/>:index+1}</span>{label}</button>)}</nav>
    <div className="setup-scene" key={question}>
      <header className="setup-heading"><p>Question {question+1} of 4</p><h2 ref={heading} tabIndex={-1}>{['Who loses hardcore status here?','How should the entrance behave?','Recommended inactivity time','Is this the right pet?'][question]}</h2><p>{['Choose the death behavior for this encounter.','When an Escape Crystal is missing or inactive.','What should the recommended Escape Crystal inactivity time be for this boss/raid?',lookup.busy?'Matching this encounter with its pet on the OSRS Wiki…':matched?`We matched ${boss.name} with ${match!.name}.`:'Confirm the icon to use for this encounter.'][question]}</p></header>

      {question===0&&<div className="setup-answers death-answers">
        {[['UNSAFE','Unsafe death','All hardcore accounts lose their status.'],['UNSAFE_HCGIM','Unsafe only for HCGIM','Only Hardcore Group Ironman accounts lose their status.'],...(draft.deathType==='SAFE'?[['SAFE','Safe death','Keep this encounter’s safe death classification.']]:[])].map(([value,title,description])=><button type="button" key={value} className="setup-answer" onClick={()=>answer({deathType:value})}><span className="answer-mark"><Icon name="shield" size={25}/></span><span><strong>{title}</strong><small>{description}</small></span></button>)}
      </div>}

      {question===1&&<><div className="setup-answers entrance-answers">
        {[['DEPRIORITIZED_WITH_HIGHLIGHT','Deprioritized','Right-click to enter. The reminder comes first.','entrance-deprioritized.png'],['PRIORITIZED_WITH_HIGHLIGHT','Prioritized','Keep left-click entry. Used in the Wilderness.','entrance-prioritized.png']].map(([value,title,description,file])=><button type="button" key={value} className="setup-answer entrance-answer" onClick={()=>answer({entranceOverlay:value})}>
          <span className="entrance-preview"><img src={`${import.meta.env.BASE_URL}images/${file}`} alt={`${title} entrance menu and highlight`} width={file.includes('deprioritized')?537:693} height={file.includes('deprioritized')?487:731}/></span>
          <span className="entrance-answer-caption"><span><strong>{title}</strong><small>{description}</small></span></span>
        </button>)}
      </div><p className="setup-footnote">Both options highlight the entrance. <a href="https://github.com/Xylot/escape-crystal-notify#in-game-view---entrance-highlighting-and-enter-option-deprioritization" target="_blank" rel="noreferrer">View examples ↗</a></p></>}

      {question===2&&<form className="setup-time" onSubmit={event=>{event.preventDefault();if(validTime&&draft.metadataBase)answer({recommendedSeconds:seconds});}}>
        <fieldset disabled={!draft.metadataBase} className="timer-controls">
          <div className="crystal-timer">
            <button type="button" className="timer-adjust" aria-label="Decrease inactivity time" disabled={seconds!=null&&seconds<=2} onClick={()=>adjustTime(-1)}>−</button>
            <div className="timer-face">
              <svg viewBox="0 0 300 190" aria-hidden="true"><path className="crystal-fill" d="M42 1H258L299 42V148L258 189H42L1 148V42Z"/><path d="M42 1L58 18H242L258 1M299 42L282 58V132L299 148M258 189L242 172H58L42 189M1 148L18 132V58L1 42M58 18L18 58M242 18L282 58M282 132L242 172M58 172L18 132"/></svg>
              <label htmlFor="setup-seconds">Inactivity threshold</label>
              <input id="setup-seconds" type="number" inputMode="numeric" min={2} max={2147483647} step={1} value={seconds??''} placeholder="—" style={{fontSize:`min(${Math.min(64,350/Math.max(5,String(seconds??'').length))}px,${130/Math.max(5,String(seconds??'').length)}cqw)`}} onChange={event=>{setTimeEdited(true);update({recommendedSeconds:event.target.value===''?null:Number(event.target.value)});}} aria-describedby="setup-time-help" aria-invalid={seconds!=null&&!validTime}/>
              <span>seconds</span>
            </div>
            <button type="button" className="timer-adjust" aria-label="Increase inactivity time" disabled={seconds!=null&&seconds>=2147483647} onClick={()=>adjustTime(1)}>+</button>
          </div>
          <div className="timer-presets" aria-label="Quick inactivity times">{[2,3,5,10].map(value=><button type="button" key={value} aria-pressed={seconds===value} onClick={()=>update({recommendedSeconds:value})}>{value}<span>sec</span></button>)}</div>
        </fieldset>
        <p id="setup-time-help" className={seconds!=null&&!validTime?'setup-validation':'setup-footnote'}>{seconds!=null&&!validTime?'Enter a whole number from 2 to 2,147,483,647.':'Use a whole number of at least 2 seconds. This sets the recommended maximum.'}</p>
        {!draft.metadataBase&&<p className="warning">Sync plugin to load the current inactivity times and pet icons.</p>}
        <div className="setup-actions"><button type="button" onClick={()=>update({setupProgress:1})}>← Back</button><button className="primary" type="submit" disabled={!validTime||!draft.metadataBase}>Continue <Icon name="arrow" size={16}/></button></div>
      </form>}

      {question===3&&<div className="setup-pet">
        <div className={`pet-confirmation ${matched?'is-matched':''}`}>
          {matched?<BossPortrait boss={{...boss,wikiTitle:match!.name}}/>:<span className="pet-placeholder" aria-hidden="true"><Icon name={lookup.busy?'sync':'file'} size={42}/></span>}
          <div><span className="pet-match-label">{matched?<><Icon name="check" size={14}/> Pet matched</>:lookup.busy?'Finding pet…':petIcon?'Selected icon':'Pet ID needed'}</span><h3>{matched?match!.name:lookup.busy?'Checking the wiki':petIcon===draft.metadataBase?.petIcon?'Current plugin icon':petIcon?'Custom pet icon':'Choose an icon'}</h3>{petIcon&&<p className="pet-item-id">{petIcon.startsWith('ItemID.')?petIcon:`Item ID ${petIcon}`}</p>}{matched&&<a href={match!.source} target="_blank" rel="noreferrer">View pet on OSRS Wiki ↗</a>}</div>
        </div>
        {!lookup.busy&&!matched&&<p className="setup-footnote" role="status">{match?'Your chosen item ID is being kept.':lookup.message}</p>}
        <div className="pet-edit-toggle"><button type="button" aria-expanded={editingPet} aria-controls="setup-pet-edit" onClick={()=>setEditingPet(value=>!value)}>{editingPet?'Hide ID editor':'Change pet ID'}</button>{!matched&&<button type="button" disabled={!!lookup.busy||!draft.metadataBase} onClick={()=>void findPet(true)}>{lookup.busy?'Looking up pet…':'Find pet automatically'}</button>}</div>
        {(editingPet||(!lookup.busy&&!validIcon))&&<div className="pet-id-editor" id="setup-pet-edit"><label className="field" htmlFor="setup-pet-id">Pet icon item ID<input id="setup-pet-id" value={petIcon??''} maxLength={160} placeholder="Enter an inventory item ID" disabled={!draft.metadataBase} onChange={event=>{setPetEdited(true);editPet(event.target.value);}} aria-describedby="setup-pet-help" aria-invalid={!!petIcon&&!validIcon}/></label><p id="setup-pet-help">Use a positive item ID or a RuneLite ItemID constant. For encounters without pets, choose a representative item.</p>{!!petIcon&&!validIcon&&<p className="setup-validation">Enter a valid item ID or ItemID constant.</p>}</div>}
        {!draft.metadataBase&&<p className="warning">Sync plugin to load the current inactivity times and pet icons.</p>}
        <div className="setup-actions"><button type="button" onClick={()=>update({setupProgress:2})}>← Back</button><button type="button" className="primary" disabled={!validIcon||!draft.metadataBase} onClick={()=>{update({petIcon,setupProgress:4});onContinue();}}>{matched?`Confirm ${match!.name}`:'Confirm icon'} & continue <Icon name="arrow" size={16}/></button></div>
      </div>}

      {question<2&&<div className="setup-actions setup-choice-actions"><p>Select an answer to continue</p>{question===1&&<button type="button" onClick={()=>update({setupProgress:0})}>← Back</button>}</div>}
    </div>
  </div>;
}
