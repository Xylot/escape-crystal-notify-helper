import {chunkOrigin} from './coordinates.mjs';

// Include the full 8x8 footprint, rather than centering on a chunk's southwest corner.
export function chunkSelectionCenter(chunks) {
  const points=chunks.filter(id=>Number.isInteger(id)&&id>=0&&id<=4194303).map(chunkOrigin);
  if(!points.length)return null;
  return [
    (Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x))+8)/2,
    (Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y))+8)/2,
  ];
}

// Only tighten the view once the local neighbourhood has finished loading.
// Missing tiles elsewhere, or a failed central tile, are not enough evidence.
export function sparseMapBounds(center, tiles, selected = []) {
  const rx = Math.floor(center[0] / 64), ry = Math.floor(center[1] / 64);
  const home = (rx << 8) | ry;
  if (tiles.get(home) !== true) return null;
  const neighbours = [];
  for (let x = rx - 1; x <= rx + 1; x++) for (let y = ry - 1; y <= ry + 1; y++) {
    if (x >= 0 && x < 256 && y >= 0 && y < 256) neighbours.push((x << 8) | y);
  }
  if (neighbours.some(id => !tiles.has(id))) return null;
  if (neighbours.filter(id => tiles.get(id) === false).length < neighbours.length * .6) return null;
  // Do not hide other selected regions just to enlarge this location.
  if (selected.some(id => !neighbours.includes(id))) return null;
  const visible = [...new Set([...neighbours.filter(id => tiles.get(id)), ...selected])];
  const xs = visible.map(id => (id >> 8) * 64), ys = visible.map(id => (id & 255) * 64);
  return [[Math.min(...ys), Math.min(...xs)], [Math.max(...ys) + 64, Math.max(...xs) + 64]];
}
