import {ITEM_NAMES} from './item-ids.mjs';
import {ITEM_LABELS} from './item-labels.mjs';
const ITEM_IDS=new Map(Object.entries(ITEM_NAMES).map(([id,name])=>[`ItemID.${name}`,id]));
export function itemIconId(value){return /^\d+$/.test(value??'')?value:ITEM_IDS.get(value)??null;}
export function itemIconName(value){const id=itemIconId(value);return id?ITEM_LABELS[Number(id)]??'Unknown':value?'Unknown':'Not configured';}
export function itemIcon(value) {
  if(/^ItemID\.[A-Z][A-Z0-9_]*$/.test(value))return value;
  const name=ITEM_NAMES[value];
  if(!name)throw new Error(`No RuneLite ItemID constant found for item ${value}. Enter its ItemID constant or refresh the item definitions.`);
  return `ItemID.${name}`;
}
