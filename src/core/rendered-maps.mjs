import { parseFragment } from 'parse5';
import { regionId } from './coordinates.mjs';
import {normalizeOutline, outlineBounds, outlineCenter} from './map-outline.mjs';
export {wikiRegionTileUrl} from './coordinates.mjs';

const iconNames=new Set(['redPin','greenPin','bluePin','cyanPin','magentaPin','yellowPin','greyPin']);
function sameOutline(a,b){
  return a.length===b.length&&a.every((ring,r)=>{
    const other=b[r],n=ring.length-1;
    if(ring.length!==other.length)return false;
    const near=(p,q)=>Math.abs(p[0]-q[0])<1&&Math.abs(p[1]-q[1])<1;
    return other.slice(0,-1).some((point,start)=>near(ring[0],point)&&[1,-1].some(direction=>ring.slice(0,-1).every((p,i)=>near(p,other[(start+direction*i+n)%n]))));
  });
}
function framesIn(html){
  const frames=[];
  const visit=node=>{
    const attr=Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]));
    if((attr.class??'').split(/\s+/).includes('mw-kartographer-map')){
      const x=Number(attr['data-lon']),y=Number(attr['data-lat']);
      const tile=(attr.style??'').match(/https:\/\/maps\.runescape\.wiki\/osrs\/versions\/([A-Za-z0-9_-]+)\/tiles\/rendered\/(-?\d+)\//);
      const mapId=Number(attr['data-mapid']),plane=Number(attr['data-plane']);
      if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<16384&&y<16384&&Number.isInteger(mapId)&&Number.isInteger(plane)&&plane>=0&&plane<=3){
        frames.push({x,y,mapId,plane,zoom:Number(attr['data-zoom']),tiles:tile?{version:tile[1],mapId:Number(tile[2]),plane}:undefined});
      }
    }
    (node.childNodes??[]).forEach(visit);
  };
  visit(parseFragment(html));return frames;
}
export function mergeRenderedMaps(locations,rendered,page){
  const frames=framesIn(rendered.text?.['*']??'');
  const result=locations.map(location=>({...location}));
  const collections=Object.values(rendered.jsconfigvars?.wgKartographerLiveData??{}).flat();
  for(const collection of collections)for(const feature of collection?.features??[]){
    if(feature.geometry?.type!=='Polygon')continue;
    const outline=normalizeOutline(feature.geometry.coordinates),props=feature.properties??{};
    const mapId=Number(props.mapID),plane=Number(props.plane);
    if(!outline||!Number.isInteger(mapId)||!Number.isInteger(plane)||plane<0||plane>3)continue;
    let target=result.find(m=>m.outline&&(m.mapId===null||Number(m.mapId)===mapId)&&(m.plane===null||m.plane===plane)&&sameOutline(m.outline,outline));
    if(!target){const {x,y}=outlineCenter(outline);target={x,y,region:regionId(x,y),role:'location',caption:'Wiki location outline',source:page.source,title:page.title,revision:page.revision,verified:false};result.push(target);}
    Object.assign(target,{outline,mtype:'polygon',plane,mapId:String(mapId)});
  }
  for(const frame of frames){
    const sameMap=m=>(m.mapId===null||Number(m.mapId)===frame.mapId)&&(m.plane===null||m.plane===frame.plane);
    let target=result.find(m=>Math.abs(m.x-frame.x)<1&&Math.abs(m.y-frame.y)<1&&sameMap(m));
    if(!target){
      const outlines=result.filter(m=>m.outline&&sameMap(m)).filter(m=>{const b=outlineBounds(m.outline);return frame.x>=b.minX&&frame.x<=b.maxX&&frame.y>=b.minY&&frame.y<=b.maxY;});
      if(outlines.length===1)target=outlines[0];
    }
    if(!target){target={x:Math.floor(frame.x),y:Math.floor(frame.y),region:regionId(Math.floor(frame.x),Math.floor(frame.y)),plane:frame.plane,mapId:String(frame.mapId),role:'location',caption:'Rendered wiki map center · review its role',source:page.source,title:page.title,revision:page.revision,verified:false};result.push(target);}
    Object.assign(target,{plane:frame.plane,mapId:String(frame.mapId),tiles:frame.tiles,zoom:frame.zoom});
  }
  for(const collection of collections)for(const feature of collection?.features??[]){
    if(feature.geometry?.type!=='Point')continue;
    const [pinX,pinY]=feature.geometry.coordinates??[],props=feature.properties??{};
    if(!Number.isFinite(pinX)||!Number.isFinite(pinY)||pinX<0||pinY<0||pinX>=16384||pinY>=16384)continue;
    // Points can be text/media/circles. Only import actual pin icons as entrance pointers.
    if(!iconNames.has(props.icon))continue;
    const x=Math.floor(pinX),y=Math.floor(pinY),mapId=Number(props.mapID),plane=Number(props.plane);
    const frame=frames.filter(f=>f.mapId===mapId&&f.plane===plane).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    let target=result.find(m=>!m.outline&&m.x===x&&m.y===y&&(m.mapId===null||Number(m.mapId)===mapId)&&(m.plane===null||m.plane===plane));
    if(!target){target={x,y,region:regionId(x,y),plane,mapId:String(mapId),role:'location',caption:'Wiki map pointer · review its role',source:page.source,title:page.title,revision:page.revision,verified:false};result.push(target);}
    Object.assign(target,{pinX,pinY,icon:props.icon,mtype:'pin',plane,mapId:String(mapId),tiles:frame?.tiles??target.tiles,markerSource:'rendered'});
  }
  return result;
}
