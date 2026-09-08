import {useState} from 'react';
import {chunkOrigin, regionId, regionTileUrl, wikiRegionTileUrl} from './core/coordinates.mjs';
import type {Location} from './types';

type Props = {regions:number[]; chunks?:number[]; locations:Location[]; context?:Location; label:string};

function MapSquare({region,chunks,url,plane}:{region:number;chunks:number[]|undefined;url:string;plane:number}) {
  const [failed,setFailed]=useState(false);
  const selected=(chunks??[]).filter(id=>{const point=chunkOrigin(id);return regionId(point.x,point.y)===region;});
  const restricted=!!chunks?.length;
  return <figure className="overview-map-square" aria-label={`Region ${region}, plane ${plane}, ${restricted?`${selected.length} selected chunks`:'whole region'}`}>
    <div className={`overview-map-terrain ${failed?'image-unavailable':''}`}>
      {failed?<span className="overview-map-unavailable">Map image unavailable</span>:<img src={url} alt="" width={256} height={256} loading="lazy" onError={()=>setFailed(true)}/>}
      <svg viewBox="0 0 64 64" aria-hidden="true" className="overview-map-overlay">
        {restricted&&<>{Array.from({length:7},(_,i)=><path key={i} d={`M${(i+1)*8} 0V64M0 ${(i+1)*8}H64`} className="overview-chunk-grid"/>)}{selected.map(id=>{const point=chunkOrigin(id);return <rect key={id} x={point.x%64} y={56-point.y%64} width={8} height={8} className="overview-selected-chunk"/>;})}</>}
        <rect x={.5} y={.5} width={63} height={63} className="overview-region-border"/>
      </svg>
      <span className="overview-region-id">{region}</span>
    </div>
    <figcaption><strong>Region {region}</strong><span>{restricted?`${selected.length} of 64 chunks`:'Whole region'}</span></figcaption>
  </figure>;
}

export default function OverviewMapSquares({regions,chunks,locations,context,label}:Props) {
  const [planeOverride,setPlaneOverride]=useState<number|null>(null);
  const unique=[...new Set(regions)];
  const plane=planeOverride??context?.plane??locations.find(location=>unique.includes(location.region))?.plane??0;
  if(!unique.length)return <p className="edit-preservation-note">No map squares selected.</p>;
  return <div className="overview-map-squares" role="group" aria-label={`${label} map squares`}>
    <div className="overview-map-toolbar"><span>{unique.length} {unique.length===1?'map square':'map squares'}{chunks?.length?' · Highlighted chunks are included':''}</span><label>Preview plane <select aria-label={`${label} preview plane`} value={plane} onChange={event=>setPlaneOverride(Number(event.target.value))}>{[0,1,2,3].map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="overview-map-gallery">{unique.map(region=>{
      const location=locations.find(location=>location.region===region&&location.tiles&&(location.plane===plane||location.plane===null));
      const source=location?.tiles??context?.tiles;
      const url=source?wikiRegionTileUrl(region,source,plane):regionTileUrl(region,plane);
      return <MapSquare key={`${region}:${url}`} region={region} chunks={chunks} plane={plane} url={url}/>;
    })}</div>
    <p className="overview-map-attribution">Map preview · <a href="https://maps.runescape.wiki/osrs/" target="_blank" rel="noreferrer">OSRS Wiki</a> / <a href="https://github.com/Explv/osrs_map_tiles" target="_blank" rel="noreferrer">Explv</a> · Jagex</p>
  </div>;
}
