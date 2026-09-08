import {chunkOrigin, regionId} from './coordinates.mjs';

// GeoJSON order throughout: polygons contain rings, rings contain [x, y] pairs.
/** @returns {[number, number][][] | null} */
export function normalizeOutline(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  let count = 0;
  const rings = [];
  for (const ring of coordinates) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const points = [];
    for (const point of ring) {
      if (++count > 4096 || !Array.isArray(point) || point.length !== 2 || !point.every(n => Number.isFinite(n) && n >= 0 && n < 16384)) return null;
      points.push([...point]);
    }
    if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) points.push([...points[0]]);
    const area = points.slice(1).reduce((sum, p, i) => sum + points[i][0] * p[1] - p[0] * points[i][1], 0);
    if (Math.abs(area) < 1e-8) return null;
    rings.push(points);
  }
  return rings;
}

export function outlineBounds(outline) {
  const points = outline[0];
  return {minX:Math.min(...points.map(p=>p[0])), maxX:Math.max(...points.map(p=>p[0])), minY:Math.min(...points.map(p=>p[1])), maxY:Math.max(...points.map(p=>p[1]))};
}

export function outlineCenter(outline) {
  const b = outlineBounds(outline);
  return {x:Math.floor((b.minX+b.maxX)/2), y:Math.floor((b.minY+b.maxY)/2)};
}

// Clip the ring to an 8x8 rectangle and measure the actual overlap. A shared
// wall or corner has zero area and must not select the chunk outside it.
function areaInChunk(ring, x, y) {
  let points=ring.slice(0,-1).map(p=>[p[0]-x,p[1]-y]);
  for(const [axis,edge,direction] of [[0,0,1],[0,8,-1],[1,0,1],[1,8,-1]]) {
    const clipped=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      const aInside=(a[axis]-edge)*direction>=0,bInside=(b[axis]-edge)*direction>=0;
      if(aInside!==bInside){
        const t=(edge-a[axis])/(b[axis]-a[axis]);
        clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
      }
      if(bInside)clipped.push(b);
    }
    points=clipped;
    if(points.length<3)return 0;
  }
  return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
}

export function outlineCoverage(coordinates) {
  const outline=normalizeOutline(coordinates);
  if (!outline) throw new Error('This wiki outline has invalid polygon coordinates.');
  const b=outlineBounds(outline);
  const minX=Math.max(0,Math.floor(b.minX/8)), maxX=Math.min(2047,Math.ceil(b.maxX/8)-1);
  const minY=Math.max(0,Math.floor(b.minY/8)), maxY=Math.min(2047,Math.ceil(b.maxY/8)-1);
  const cells=(maxX-minX+1)*(maxY-minY+1), edges=outline.reduce((n,r)=>n+r.length-1,0);
  if (cells>65536 || cells*edges>4_000_000) throw new Error('This wiki outline is too large to select automatically.');
  const chunks=[];
  for(let cx=minX;cx<=maxX;cx++) for(let cy=minY;cy<=maxY;cy++) {
    const x=cx*8,y=cy*8;
    const area=areaInChunk(outline[0],x,y)-outline.slice(1).reduce((sum,ring)=>sum+areaInChunk(ring,x,y),0);
    if(area>1e-8) chunks.push((cx<<11)|cy);
  }
  const regions=[...new Set(chunks.map(id=>{const p=chunkOrigin(id);return regionId(p.x,p.y);} ))].sort((a,b)=>a-b);
  return {chunks,regions};
}
