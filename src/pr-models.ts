import {isDungeon} from './core/encounter-kind.mjs';
import {loadRegionObjects} from './core/region-objects.mjs';
import {loadGameval} from './core/gameval.mjs';
import {modelFamily, modelVariants, moidImage} from './core/moid-images.mjs';
import {encounterScope} from './core/pr-presentation.mjs';
import {proposalStates} from './core/pr-states.mjs';
import {resolvePetIcon} from './core/pet-icons.mjs';
import {cleanPetReference} from './core/item-icon.mjs';
import {loadParser} from './parser';
import type {Boss,Draft,EvidenceContexts} from './types';

function imageAvailable(id:string):Promise<boolean> {
  return new Promise(resolve=>{
    const image = new Image();
    const finish = (available:boolean) => {clearTimeout(timer);image.onload=null;image.onerror=null;resolve(available);};
    const timer = window.setTimeout(()=>finish(false),15000);
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=moidImage(id).url;
  });
}

const variantLookups=new Map<string,Promise<string[]>>();
export function loadParentVariantImages(id:string):Promise<string[]> {
  const key=moidImage(id).id;
  const cached=variantLookups.get(key);if(cached)return cached;
  const lookup=(async()=>{
    const variants=modelVariants((await loadRegionObjects()).types,key),images:string[]=[];
    for(let i=0;i<variants.length;i+=4){
      const batch=variants.slice(i,i+4),available=await Promise.all(batch.map(imageAvailable));
      images.push(...batch.filter((_:string,index:number)=>available[index]));
    }
    return images;
  })();
  variantLookups.set(key,lookup);
  // Deduplicate repeated parent cards without retaining failures indefinitely.
  lookup.then(images=>{if(!images.length)variantLookups.delete(key);else window.setTimeout(()=>variantLookups.delete(key),300000);},()=>variantLookups.delete(key));
  return lookup;
}

export async function loadEntranceModels(selectedIds:string[],objectType:string,selected?:string|null):Promise<string[]> {
    const ids = selected === null ? [] : [...(objectType==='NPC'?[]:selectedIds), ...(selected?[selected]:[])];
    const numeric = ids.filter(id=>/^\d{1,9}$/.test(id));
    if(ids.some(id=>id.startsWith('ObjectID.'))) {
      const symbols = await loadGameval();
      for(const id of ids.filter(id=>id.startsWith('ObjectID.'))) {
        const match=symbols.find((s:any)=>s.objectType==='GAME_OBJECT'&&s.name===id.slice('ObjectID.'.length));
        if(!match)throw new Error(`Cannot resolve ${id}. Use its numeric ID before preparing model references.`);
        numeric.push(match.id);
      }
    }
    const family = numeric.length ? modelFamily((await loadRegionObjects()).types,numeric) : [];
    const images:string[] = [];
    // Four image requests at a time; missing models are normal in MOID.
    for(let i=0;i<family.length;i+=4) {
      const batch=family.slice(i,i+4),available=await Promise.all(batch.map(imageAvailable));
      images.push(...batch.filter((_:string,index:number)=>available[index]));
    }
    return images;
}

export async function prepareModels(drafts:Draft[],bosses:Boss[],contexts:EvidenceContexts) {
  const result:Record<string,{scope:string;images:string[];beforeImages?:string[];pet?:ReturnType<typeof cleanPetReference>}> = {};
  const states=proposalStates(drafts);
  for (const draft of drafts) {
    const selected = contexts[draft.id]?.entranceImage;
    const pair=states[draft.id];
    const images = isDungeon(draft)?[]:await loadEntranceModels(pair.after.entrance?.ids??[],pair.after.entrance?.objectType??'GAME_OBJECT',selected);
    const beforeImages=pair.before&&!isDungeon(draft)?await loadEntranceModels(pair.before.entrance?.ids??[],pair.before.entrance?.objectType??'GAME_OBJECT'):[];
    const boss=bosses.find(b=>b.id===draft.id)??draft;
    let pet;
    if(!isDungeon(draft))try{
      const match=await resolvePetIcon(await loadParser(),'wikiTitle' in boss?boss.wikiTitle:boss.name);
      if(match.status==='found')pet=cleanPetReference(match);
    }catch{/* Wiki outages do not block contributions; existing labels remain available. */}
    result[draft.id] = {scope:encounterScope(boss),images,...(pair.before?{beforeImages}:{}),...(pet?{pet}:{})};
  }
  return result;
}
