import {useState} from 'react';
import {chunkOrigin,regionOrigin,regionId,regionTileUrl,wikiRegionTileUrl} from './core/coordinates.mjs';
import type {Location} from './types';
import {MoidThumbnail} from './EntrancePortraits';

export type EntranceMapChoice={location:Location;chunks:number[];regions:number[];label:string;current?:boolean};
function MapPreview({choice}:{choice:EntranceMapChoice}){
  const {location,chunks,regions}=choice;
  const points=chunks.length?chunks.map(chunkOrigin):regions.map(regionOrigin);
  const size=chunks.length?8:64;
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x+size));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y+size));
  const width=Math.max(48,maxX-minX+16,(maxY-minY+16)*1.5),height=width/1.5;
  const left=(minX+maxX-width)/2,top=(minY+maxY+height)/2;
  const tiles=[];
  for(let x=Math.max(0,Math.floor(left/64));x<=Math.min(255,Math.floor((left+width)/64));x++)for(let y=Math.max(0,Math.floor((top-height)/64));y<=Math.min(255,Math.floor(top/64));y++){
    const id=regionId(x*64,y*64),plane=location.plane??0;
    if(width*height>64*64*64&&!regions.includes(id))continue;
    tiles.push({id,x:x*64-left,y:top-(y+1)*64,url:location.tiles?wikiRegionTileUrl(id,location.tiles,plane):regionTileUrl(id,plane)});
  }
  const [failed,setFailed]=useState<string[]>([]);
  return <div className="entrance-choice-preview">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {tiles.map(tile=><image key={tile.url} href={tile.url} x={tile.x} y={tile.y} width={64} height={64} onError={()=>setFailed(old=>old.includes(tile.url)?old:[...old,tile.url])}/>)}
      {points.map((p,i)=><rect key={i} x={p.x-left} y={top-p.y-size} width={size} height={size} className="entrance-choice-chunk" vectorEffect="non-scaling-stroke"/>)}
      {location.notificationChunks&&(location.entranceObjects??[location]).map((point,i)=><circle key={i} cx={point.x-left} cy={top-point.y} r={width/65} className="entrance-choice-pin" vectorEffect="non-scaling-stroke"/>)}
    </svg>
    {tiles.length>0&&tiles.every(tile=>failed.includes(tile.url))&&<span className="entrance-choice-unavailable">Map image unavailable</span>}
  </div>;
}

export default function EntranceMapChoices({choices,loading,onChoose,onManual,onUse,canUse,quickReview}:{choices:EntranceMapChoice[];loading:boolean;onChoose:(choice:EntranceMapChoice)=>void;onManual:()=>void;onUse:(choice:EntranceMapChoice)=>void;canUse:boolean;quickReview:boolean}){
  const ordered=[...choices].sort((a,b)=>Number(!!b.location.entranceObjects?.length)-Number(!!a.location.entranceObjects?.length));
  return <section className="entrance-map-choices" aria-label="Entrance suggestions">
    <div className="entrance-suggestion-list">{ordered.map((choice,i)=>{
      const objects=[...new Map((choice.location.entranceObjects??[]).map(object=>[object.id,object])).values()];
      return <article className="entrance-suggestion" aria-label={choice.label} key={`${choice.location.source}:${choice.location.x}:${choice.location.y}:${i}`}>
        <button type="button" className="entrance-suggestion-map" aria-label={`Edit map for ${choice.label}`} onClick={()=>onChoose(choice)}><MapPreview choice={choice}/></button>
        <div className="entrance-suggestion-details"><div className="entrance-choice-label"><strong>{choice.label}</strong><span>{choice.current?'Current selection · ':''}{choice.chunks.length?`${choice.chunks.length} ${choice.chunks.length===1?'chunk':'chunks'}`:'Whole area'} · Plane {choice.location.plane??0}</span></div>
          {objects.length>0&&<div className="entrance-suggestion-objects">{objects.map(object=><div className="entrance-suggestion-object" key={object.id}>{object.name&&<strong>{object.name}</strong>}<MoidThumbnail id={object.id} compact/></div>)}</div>}
          <div className="entrance-suggestion-actions"><button type="button" onClick={()=>onChoose(choice)}>{objects.length?'Edit area':'Choose map'}</button>{objects.length>0&&<button type="button" className="primary" disabled={!canUse} title={canUse?undefined:'Choose Yes or No above'} onClick={()=>onUse(choice)}>{quickReview?'Use entrances & review':'Use entrances'}</button>}</div>
        </div>
      </article>;
    })}</div>
    {loading&&<p role="status">Finding nearby entrance maps…</p>}
    <div className="entrance-choice-footer"><span>Maps · OSRS Wiki / Explv · Jagex</span><button type="button" onClick={onManual}>Choose manually →</button></div>
  </section>;
}
