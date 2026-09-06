import {moidImage} from './moid-images.mjs';

export function encounterScope(boss) {
  const category = `${boss.regionType ?? ''} ${(boss.categories ?? []).join(' ')}`;
  if (/raid|Chambers of Xeric|Theatre of Blood|Tombs of Amascut/i.test(category) || /^(Chambers of Xeric|Theatre of Blood|Tombs of Amascut)$/i.test(boss.name)) return 'raid';
  if (/minigame/i.test(category)) return 'minigame';
  if (/dungeon/i.test(category)) return 'dungeon';
  if (/quest/i.test(category)) return 'quest';
  if (/event/i.test(category)) return 'event';
  return 'boss';
}

// Presentation metadata never enters the generated Java or proposal payload.
export function cleanPresentation(changes, input = {}) {
  const output = {}; let count = 0;
  for (const c of changes) {
    const item = input[c.id] ?? {}, scope = item.scope ?? encounterScope(c);
    if (!['boss','raid','minigame','dungeon','quest','event'].includes(scope)) throw new Error('Unsupported encounter category.');
    const ids = item.images ?? [];
    if (!Array.isArray(ids) || ids.length > 128 || ids.some(id => typeof id !== 'string' || !/^\d{1,9}$/.test(id))) throw new Error('Invalid entrance model references.');
    count += ids.length;
    if (count > 256) throw new Error('Split contributions with more than 256 model images into smaller PRs.');
    output[c.id] = {scope, images: [...new Set(ids.map(id => moidImage(id).id))]};
  }
  return output;
}

export function defaultPRText(changes, presentation) {
  const scopes = [...new Set(changes.map(c => presentation[c.id].scope))];
  const scope = scopes.length === 1 ? scopes[0] : 'encounter';
  const allNew = changes.every(c => c.baseRaw === null), allExisting = changes.every(c => c.baseRaw !== null);
  const action = allNew ? 'add' : allExisting ? 'update' : 'add and update';
  const names = changes.map(c => c.name).join(', ');
  const title = `feat(${scope}): ${action} ${names}`;
  return {
    title: title.length <= 200 ? title : `feat(${scope}): ${action} ${changes.length} encounters`,
    introduction: `${allNew ? 'Adds' : allExisting ? 'Updates' : 'Adds and updates'} Escape Crystal coverage for ${names}. Includes death classification, arena coverage, and entrance settings where configured.`,
  };
}
