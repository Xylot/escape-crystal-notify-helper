import {ITEM_NAMES} from './item-ids.mjs';
import {ITEM_LABELS} from './item-labels.mjs';
import {WIKI_PET_ITEMS} from './wiki-pet-items.mjs';
const ITEM_IDS=new Map(Object.entries(ITEM_NAMES).map(([id,name])=>[`ItemID.${name}`,id]));
export function itemIconId(value){return /^\d+$/.test(value??'')?value:ITEM_IDS.get(value)??null;}
export function itemIconName(value){const id=itemIconId(value);return id?WIKI_PET_ITEMS[id]?.name??ITEM_LABELS[Number(id)]??'Unknown':value?'Unknown':'Not configured';}
export function itemIcon(value) {
  if(/^ItemID\.[A-Z][A-Z0-9_]*$/.test(value))return value;
  if(!/^[1-9]\d*$/.test(value)||Number(value)>2147483647)throw new Error('Enter a positive item ID or RuneLite ItemID constant.');
  const name=ITEM_NAMES[value];
  // Wiki items can arrive before the pinned RuneLite definitions are refreshed.
  return name?`ItemID.${name}`:value;
}
