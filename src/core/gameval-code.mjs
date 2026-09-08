import {OBJECT_NAMES,NPC_NAMES} from './gameval-ids.mjs';

export function gamevalCodeId(id,objectType) {
  // ObjectID1 is package-private; its constants are inherited by public ObjectID.
  if(id.startsWith('ObjectID1.'))return id.replace('ObjectID1.','ObjectID.');
  if(!/^\d+$/.test(id))return id;
  const value=Number(id);
  if(objectType!=='NPC'&&OBJECT_NAMES[value])return `ObjectID.${OBJECT_NAMES[value]}`;
  if(objectType!=='GAME_OBJECT'&&NPC_NAMES[value])return `NpcID.${NPC_NAMES[value]}`;
  // Unmapped IDs remain usable, without inventing a variable that will not compile.
  return id;
}
