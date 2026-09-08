import {useId} from 'react';
import type {Draft} from './types';
import {detectionChunks,sourceEntry} from './core/encounter-export.mjs';

export default function EntranceDanger({draft,update}:{draft:Draft;update:(change:Partial<Draft>)=>void}) {
  const id=useId();
  const suggest=()=>draft.entrance?.chunks??detectionChunks(sourceEntry(draft.entranceBaseRaw??draft.baseRaw));
  return <fieldset className="entrance-danger">
    <legend>Is the entrance area dangerous?</legend>
    <div className="entrance-danger-options">{[[true,'Yes'],[false,'No']].map(([value,label])=><label key={String(value)} className="setup-option">
      <input type="radio" name={id} checked={draft.entranceDangerous===value} onChange={()=>update({entranceDangerous:value as boolean,...(value===false&&draft.entranceNotifyChunks===undefined?{entranceNotifyChunks:[...suggest()]}:{})})}/><span><strong>{label}</strong></span>
    </label>)}</div>
  </fieldset>;
}
