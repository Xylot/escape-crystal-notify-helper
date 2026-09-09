import {useId} from 'react';
import type {Draft} from './types';

export default function EntranceDanger({draft,update}:{draft:Draft;update:(change:Partial<Draft>)=>void}) {
  const id=useId();
  return <fieldset className="entrance-danger">
    <legend>Is the entrance area dangerous?</legend>
    <div className="entrance-danger-options">{[[true,'Yes'],[false,'No']].map(([value,label])=><label key={String(value)} className="setup-option">
      <input type="radio" name={id} checked={draft.entranceDangerous===value} onChange={()=>update({entranceDangerous:value as boolean})}/><span><strong>{label}</strong></span>
    </label>)}</div>
    {draft.entranceDangerous===false&&<p>This area will not trigger region notifications. Entrance detection and highlighting remain enabled. Chunk restrictions are optional.</p>}
  </fieldset>;
}
