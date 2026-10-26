import {ITEM_NAMES} from './item-ids.mjs';
import {ITEM_LABELS} from './item-labels.mjs';
import {WIKI_PET_ITEMS} from './wiki-pet-items.mjs';
const ITEM_IDS=new Map(Object.entries(ITEM_NAMES).map(([id,name])=>[`ItemID.${name}`,id]));
export function itemIconId(value){return /^\d+$/.test(value??'')?value:ITEM_IDS.get(value)??null;}
export function cleanPetReference(pet){
  if(pet==null)return undefined;
  if(typeof pet.name!=='string'||!pet.name.trim()||pet.name.length>250||/[\x00-\x1f]/.test(pet.name)||!validItemId(pet.itemId)||!Number.isSafeInteger(pet.revision)||pet.revision<1||pet.source!==`https://oldschool.runescape.wiki/w/${encodeURIComponent(pet.name.replaceAll(' ','_'))}`)throw new Error('Invalid wiki pet reference.');
  return {name:pet.name,itemId:pet.itemId,source:pet.source,revision:pet.revision};
}
const validItemId=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value)&&Number(value)<=2147483647;
export function itemIconName(value,pet){const id=itemIconId(value);return id?(pet?.itemId===id?pet.name:undefined)??WIKI_PET_ITEMS[id]?.name??ITEM_LABELS[Number(id)]??'Unknown':value?'Unknown':'Not configured';}
export function itemIcon(value) {
  if(/^ItemID\.[A-Z][A-Z0-9_]*$/.test(value))return value;
  if(!/^[1-9]\d*$/.test(value)||Number(value)>2147483647)throw new Error('Enter a positive item ID or RuneLite ItemID constant.');
  const name=ITEM_NAMES[value];
  // Wiki items can arrive before the pinned RuneLite definitions are refreshed.
  return name?`ItemID.${name}`:value;
}
