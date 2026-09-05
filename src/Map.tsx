import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {regionId,regionTileUrl,chunkId,wikiRegionTileUrl} from './core/coordinates.mjs';
import {paintGrid} from './core/map-grid.mjs';
import type {Location} from './types';
type Props={selected:number[];existing:number[];locations:Location[];center:[number,number];plane:number;onToggle:(id:number)=>void;chunks:number[];chunkMode:boolean;onChunkToggle:(id:number)=>void;tileSource?:Location['tiles']};
class MapTiles extends L.GridLayer {public createTile(_coords:L.Coords,_done:L.DoneCallback):HTMLElement{return document.createElement('div');}}
function shadeTerrain(tile:HTMLElement,state:Props){
 const region=Number(tile.dataset.region),base=tile.children[0] as HTMLImageElement,color=tile.children[1] as HTMLImageElement;
 const restricted=state.chunkMode||state.chunks.length>0;
 base.style.filter=!restricted&&state.selected.includes(region)?'none':'grayscale(100%)';
 let path='';if(restricted){const rx=region>>8,ry=region&255;for(let x=0;x<8;x++)for(let y=0;y<8;y++)if(state.chunks.includes(((rx*8+x)<<11)|(ry*8+y))){const px=x*32,py=(7-y)*32;path+=`M${px} ${py}h32v32h-32Z`;}}
 color.style.display=path?'block':'none';color.style.clipPath=path?`path('${path}')`:'';
}
export function RegionMap(props:Props){
 const host=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),grid=useRef<L.GridLayer|null>(null),imagery=useRef<L.GridLayer|null>(null),pins=useRef<L.LayerGroup|null>(null);
 const latest=useRef(props);latest.current=props;
 const [fine,setFine]=useState(false),[zoom,setZoom]=useState(2),[workerMode,setWorkerMode]=useState(false);
 const fineRef=useRef(false);fineRef.current=fine;const readout=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!host.current)return;
  const m=L.map(host.current,{crs:L.CRS.Simple,minZoom:0,maxZoom:5,zoomSnap:.25,zoomDelta:.5,wheelPxPerZoomLevel:100,wheelDebounceTime:30,zoomControl:false,attributionControl:true,preferCanvas:true}).setView([props.center[1],props.center[0]],2);
  map.current=m;L.control.zoom({position:'bottomright'}).addTo(m);m.attributionControl.addAttribution('<a href="https://maps.runescape.wiki/osrs/">OSRS Wiki</a> / <a href="https://github.com/Explv/osrs_map_tiles">Explv</a> · Jagex');
  const options={tileSize:256,minNativeZoom:2,maxNativeZoom:2,noWrap:true,keepBuffer:2,updateWhenZooming:false,bounds:L.latLngBounds([0,0],[16384,16384])};
  const images=new MapTiles({...options,pane:'tilePane'});
  images.createTile=(coords,done)=>{const tile=document.createElement('div');tile.dataset.region=String((coords.x<<8)|(-coords.y-1));const img=document.createElement('img'),color=document.createElement('img');for(const element of [img,color]){element.alt='';element.style.cssText='position:absolute;inset:0;width:256px;height:256px;max-width:none;';tile.appendChild(element);}const id=Number(tile.dataset.region),s=latest.current;img.onload=()=>done(undefined,tile);img.onerror=()=>{tile.style.visibility='hidden';done(undefined,tile);};const url=s.tileSource?wikiRegionTileUrl(id,s.tileSource,s.plane):regionTileUrl(id,s.plane);img.src=url;color.src=url;shadeTerrain(tile,s);return tile;};
  images.addTo(m);imagery.current=images;
  let worker:Worker|null=null,sequence=0;const jobs=new Map<number,{tile:HTMLCanvasElement;state:any;done:L.DoneCallback}>();
  const fallback=()=>{worker?.terminate();worker=null;setWorkerMode(false);for(const job of jobs.values()){paintGrid(job.tile.getContext('2d'),job.state);job.done(undefined,job.tile);}jobs.clear();};
  try{if(typeof OffscreenCanvas!=='undefined'){worker=new Worker(new URL('./map.worker.js',import.meta.url),{type:'module'});setWorkerMode(true);worker.onmessage=({data})=>{const job=jobs.get(data.id);jobs.delete(data.id);if(job){if(data.bitmap){job.tile.getContext('2d')?.drawImage(data.bitmap,0,0);data.bitmap.close();}else paintGrid(job.tile.getContext('2d'),job.state);job.done(undefined,job.tile);}else data.bitmap?.close();};worker.onerror=fallback;}}catch{fallback();}
  const overlay=new MapTiles({...options,pane:'overlayPane'});
  overlay.createTile=(coords,done)=>{const tile=document.createElement('canvas');tile.width=tile.height=256;tile.style.pointerEvents='none';const s=latest.current;const state={region:(coords.x<<8)|(-coords.y-1),selected:s.selected,existing:s.existing,chunks:s.chunks,chunkMode:s.chunkMode,fine:fineRef.current};if(worker){const id=++sequence;jobs.set(id,{tile,state,done});worker.postMessage({id,state});}else {paintGrid(tile.getContext('2d'),state);setTimeout(()=>done(undefined,tile),0);}return tile;};
  overlay.addTo(m);grid.current=overlay;pins.current=L.layerGroup().addTo(m);
  m.on('zoomend',()=>setZoom(m.getZoom()));
  m.on('click',(e:L.LeafletMouseEvent)=>{const x=Math.floor(e.latlng.lng),y=Math.floor(e.latlng.lat);if(x<0||y<0||x>16383||y>16383)return;const s=latest.current;if(s.chunkMode)s.onChunkToggle(chunkId(x,y));else s.onToggle(regionId(x,y));});
  let frame=0;
  m.on('mousemove',(e:L.LeafletMouseEvent)=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const x=Math.floor(e.latlng.lng),y=Math.floor(e.latlng.lat);if(readout.current&&x>=0&&y>=0&&x<16384&&y<16384)readout.current.textContent=`${x}, ${y} · Region ${regionId(x,y)} · Chunk ${chunkId(x,y)}`;});});
  const resize=new ResizeObserver(()=>m.invalidateSize({pan:true}));resize.observe(host.current);
  return()=>{cancelAnimationFrame(frame);resize.disconnect();worker?.terminate();jobs.clear();m.remove();map.current=null;};
 },[]);
 useEffect(()=>{map.current?.setView([props.center[1],props.center[0]],map.current.getZoom(),{animate:false});},[props.center]);
 useEffect(()=>{imagery.current?.redraw();},[props.tileSource,props.plane]);
 useEffect(()=>{grid.current?.redraw();imagery.current?.getContainer()?.querySelectorAll<HTMLElement>('[data-region]').forEach(tile=>shadeTerrain(tile,props));},[props.selected,props.existing,props.chunks,props.chunkMode,fine]);
 useEffect(()=>{
  const group=pins.current;if(!group)return;group.clearLayers();
  for(const pin of props.locations){if(pin.plane!==null&&pin.plane!==props.plane)continue;if(props.tileSource&&pin.mapId!==null&&Number(pin.mapId)!==props.tileSource.mapId)continue;
   const point:L.LatLngExpression=[pin.pinY??pin.y+(pin.mtype==='pin'?.5:0),pin.pinX??pin.x+(pin.mtype==='pin'?.5:0)];
   if(pin.mtype==='pin'){const icon=L.divIcon({className:'wiki-pointer',iconSize:[26,42],iconAnchor:[13,42],html:'<svg width="26" height="42" viewBox="0 0 26 42"><path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 29 13 29s13-20 13-29C26 5.8 20.2 0 13 0Z" fill="#ff4141"/><circle cx="13" cy="13" r="5.5" fill="white"/></svg>'});L.marker(point,{icon,interactive:false}).addTo(group);}else L.circleMarker(point,{radius:6,color:'#d9a54b',fillOpacity:1,interactive:false}).addTo(group);
  }
 },[props.locations,props.plane,props.tileSource]);
 return <div className="map-wrap" data-renderer={workerMode?'worker':'canvas'}><div ref={host} className="map" aria-label="OSRS region selection map"/><div className="map-note">{props.chunkMode?'Click an 8×8 chunk':'Click a region'} · Drag to pan · Scroll to zoom</div><div className="map-bottom"><code ref={readout}>Explore the map</code><button onClick={()=>setFine(v=>!v)} aria-pressed={fine}>{fine?'Hide':'Show'} grid</button><span>{zoom.toFixed(2)}×</span></div></div>;
}

