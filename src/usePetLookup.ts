import {itemIcon} from './core/item-icon.mjs';
import {useEffect,useRef,useState} from 'react';
import type {Boss,Draft} from './types';
import {loadParser} from './parser';
import {resolvePetIcon,canApplyPetLookup} from './core/pet-icons.mjs';

type PetMatch={name:string;itemId:string;source:string};
export function usePetLookup(boss:Boss,draft:Draft,update:(change:Partial<Draft>)=>void,autofill=true) {
  const latest=useRef({draft,update});latest.current={draft,update};
  const editRevision=useRef(0),request=useRef(0);
  const [match,setMatch]=useState<PetMatch|null>(null);
  const [lookup,setLookup]=useState<{busy?:boolean;message:string;source?:string}>({message:''});
  async function findPet(replace=false) {
    const serial=++request.current,revision=editRevision.current;
    setLookup({busy:true,message:'Looking up the pet’s item ID…'});
    try {
      const result=await resolvePetIcon(await loadParser(),boss.wikiTitle);
      if(serial!==request.current)return;
      if(result.status==='found'){
        setMatch({name:result.name,itemId:itemIcon(result.itemId),source:result.source!});
        if((autofill||replace)&&canApplyPetLookup(revision,editRevision.current,latest.current.draft.petIcon,replace))latest.current.update({petIcon:itemIcon(result.itemId)});
        setLookup({message:`Found ${result.name} · item ${result.itemId}`,source:result.source});
      }else setLookup({message:result.status==='ambiguous'?'Several pet items match this encounter. Choose an item ID manually.':'No unique pet item was found. Choose a representative item manually.'});
    }catch{if(serial===request.current)setLookup({message:'The wiki lookup is unavailable. Retry or enter an item ID manually.'});}
  }
  useEffect(()=>{
    setMatch(null);
    if(!draft.metadataBase)return;
    if(autofill&&!draft.petIcon&&boss.raw)latest.current.update({petIcon:draft.metadataBase.petIcon});
    void findPet();
    return()=>{request.current++;};
  },[draft.id,boss.wikiTitle,!!draft.metadataBase,autofill]);
  const editPet=(value:string)=>{editRevision.current++;update({petIcon:value.trim()});};
  return {match,lookup,findPet,editPet};
}
