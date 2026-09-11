export const isDungeon = value => value?.regionType === 'DUNGEONS' || /^DUNGEON_/.test(value?.id ?? '');
export const encounterType = value => value.regionType ?? (isDungeon(value) ? 'DUNGEONS' : /^RAIDS_/.test(value.id??'') ? 'RAIDS' : 'BOSSES');
