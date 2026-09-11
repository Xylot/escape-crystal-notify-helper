import {useEffect,useRef,type ReactNode} from 'react';
import type {Draft} from './types';
import {Icon} from './Icons';
import './setup-flow.css';

const labels=['Entrance danger','Instanced fight','Choose entrance'];
export default function EntranceSetup({draft,update,children,onLoad,loading}:{draft:Draft;update:(change:Partial<Draft>)=>void;children:ReactNode;onLoad:()=>void;loading?:boolean}) {
  const question=Math.min(2,Math.max(0,draft.entranceSetupProgress??0));
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'nearest'});},[question]);
  return <div className="setup-flow entrance-setup-flow">
    <nav className="setup-track" aria-label="Entrance area questions">{labels.map((label,index)=><button type="button" key={label} disabled={index>question} aria-current={question===index?'step':undefined} className={index<question?'answered':''} onClick={()=>update({entranceSetupProgress:index})}><span>{index<question?<Icon name="check" size={13}/>:index+1}</span>{label}</button>)}</nav>
    <div className="setup-scene" key={question}>
      <header className="setup-heading"><p>Question {question+1} of 3</p><h2 ref={heading} tabIndex={-1}>{['Is the entrance area dangerous?','Does the boss fight take place in an instance?','Are any of these the entrance?'][question]}</h2></header>
      {question<2?<>
        <div className="setup-answers entrance-policy-answers">{[true,false].map(value=><button type="button" key={String(value)} className="setup-answer" onClick={()=>update({...(question===0?{entranceDangerous:value}:{bossInstanced:value}),entranceSetupProgress:question+1})}><strong>{value?'Yes':'No'}</strong></button>)}</div>
        <div className="setup-actions setup-choice-actions"><p>Select an answer to continue</p>{question>0&&<button type="button" onClick={()=>update({entranceSetupProgress:question-1})}>← Back</button>}</div>
      </>:<>
        <div className="entrance-flow-refresh"><button type="button" disabled={loading} onClick={onLoad}>{loading?'Loading locations…':'Refresh locations'}</button></div>
        {children}
        <div className="setup-actions"><button type="button" onClick={()=>update({entranceSetupProgress:1})}>← Back</button></div>
      </>}
    </div>
  </div>;
}
