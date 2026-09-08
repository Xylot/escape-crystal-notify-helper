export function integer(value, min, max, label = 'Value') {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
export function regionId(x, y) {
  integer(x, 0, 16383, 'X'); integer(y, 0, 16383, 'Y');
  return (Math.floor(x / 64) << 8) | Math.floor(y / 64);
}
export function regionOrigin(id) {
  integer(id, 0, 65535, 'Region ID');
  return { x: (id >> 8) * 64, y: (id & 255) * 64 };
}
// 8x8 world-chunk packing used by the reference's entrance values; plane separate.
export function chunkId(x, y) {
  integer(x, 0, 16383, 'X'); integer(y, 0, 16383, 'Y');
  return (Math.floor(x / 8) << 11) | Math.floor(y / 8);
}
export function chunkOrigin(id) {
  integer(id, 0, 4194303, 'Chunk ID');
  return { x: (id >> 11) * 8, y: (id & 2047) * 8 };
}
export function regionTileUrl(id, plane = 0) {
  const { x, y } = regionOrigin(id); integer(plane, 0, 3, 'Plane');
  // Explv's RS_OFFSET_X is 1024 - 64 (15 regions), not 1024.
  // Its TMS grid starts at world Y=1216 (19 regions). At zoom 8,
  // each 256px image covers exactly one 64x64 world region.
  // https://github.com/Explv/explv.github.io/blob/master/js/model/Position.js
  return `https://raw.githubusercontent.com/Explv/osrs_map_tiles/master/${plane}/8/${x / 64 - 15}/${y / 64 - 19}.png`;
}
export function wikiRegionTileUrl(id,source,plane=source.plane){
  if(!/^[A-Za-z0-9_-]+$/.test(source.version)||!Number.isInteger(source.mapId)||!Number.isInteger(plane)||plane<0||plane>3)throw new Error('Invalid wiki tile source.');
  const {x,y}=regionOrigin(id);
  return `https://maps.runescape.wiki/osrs/versions/${source.version}/tiles/rendered/${source.mapId}/2/${plane}_${x/64}_${y/64}.png`;
}
export function parseIds(text, kind = 'region') {
  if (!text.trim()) return [];
  const max = kind === 'region' ? 65535 : 4194303;
  return [...new Set(text.trim().split(/[\s,]+/).map(v => {
    if (!/^\d+$/.test(v)) throw new Error(`Invalid ${kind} ID: ${v}`);
    return integer(Number(v), 0, max, `${kind} ID`);
  }))].sort((a, b) => a - b);
}
