import { useMemo,useState } from 'react';
import { RegionMap } from './Map';
import { encounterLocations,originalEntranceChunks,sameLocation } from './core/encounter.mjs';
import { chunkOrigin,regionId } from './core/coordinates.mjs';
import type { Boss,Draft,Location } from './types';

type Props={boss:Boss;draft:Draft;update:(change:Partial<Draft>)=>void;onError:(message:string)=>void;onLoad:()=>void};
const EMPTY_IDS:number[]=[];
export default function EncounterMaps(props:Props){
  const {boss}=props;
  const locations=useMemo(()=>encounterLocations(boss),[boss]);
  const [split,setSplit]=useState(true);
  const shared=locations.shared&&!split;
  return <div className="encounter-workspace">
    <div className="encounter-intro"><span>ENCOUNTER LOCATIONS</span><p>{shared?'Entrance and arena share a map region.':'Compare the approach and the fight without losing your place.'}</p>{locations.shared&&<button onClick={()=>setSplit(v=>!v)}>{split?'Combine maps':'Separate maps'}</button>}</div>
    <div className={`encounter-grid ${shared?'shared-map':''}`}>
      {!shared&&<LocationPane {...props} kind="entrance" locations={locations.entrance} alternatives={boss.maps} />}
      <LocationPane {...props} kind="arena" locations={locations.arena} alternatives={boss.maps} combined={shared}/>
    </div>
  </div>;
}
function LocationPane({boss,draft,update,onError,onLoad,kind,locations,alternatives,combined=false}:Props&{kind:'entrance'|'arena';locations:Location[];alternatives:Location[];combined?:boolean}){
  const [choice,setChoice]=useState(''),[manual,setManual]=useState<Location|null>(null),[plane,setPlane]=useState<number|null>(null),[jump,setJump]=useState('');
  const [chunkMode,setChunkMode]=useState(false),[entranceMode,setEntranceMode]=useState(false),[recenter,setRecenter]=useState(0);
  const all=useMemo(()=>[...locations,...alternatives.filter(m=>!locations.some(l=>l.x===m.x&&l.y===m.y&&l.source===m.source))],[locations,alternatives]);
  const selected=manual??(choice!==''?all[Number(choice)]:locations[0]);
  const center=useMemo<[number,number]>(()=>selected?[selected.x,selected.y]:[0,0],[selected,recenter]);
  const isEntrance=kind==='entrance'||combined&&entranceMode;
  const oldChunks=useMemo(()=>originalEntranceChunks(boss.optionalArgs),[boss.optionalArgs]);
  const chunks:number[]=isEntrance?(draft.entrance?.chunks??oldChunks):(draft.chunks??EMPTY_IDS);
  const entranceRegions=useMemo(()=>draft.entranceRegion!==undefined?[draft.entranceRegion]:selected?[selected.region]:[],[draft.entranceRegion,selected]);
  const mapLocations=useMemo(()=>combined?alternatives:selected?[selected]:[],[combined,alternatives,selected]);
  function toggleChunk(id:number){
    const next=chunks.includes(id)?chunks.filter(n=>n!==id):[...chunks,id].sort((a,b)=>a-b);
    if(isEntrance){
      if(!draft.entrance&&boss.optionalArgs.some(a=>a.includes('RegionEntrance('))){onError('Review the existing entrance configuration before replacing its chunk restrictions.');return;}
      update({entrance:{overlay:'DEPRIORITIZED_WITH_HIGHLIGHT',direction:'',plane:'',objectType:'GAME_OBJECT',ids:[],...draft.entrance,chunks:next,reviewed:false}});
    }else{
      const point=chunkOrigin(id),region=regionId(point.x,point.y);
      update({chunks:next,regions:[...new Set([...draft.regions,region])].sort((a,b)=>a-b)});
    }
  }
  const label=combined?'Arena & entrance':kind==='entrance'?'Boss entrance':'Boss arena';
  return <section className={`location-pane ${kind}`} aria-label={label}>
    <div className="location-heading"><div><span className="location-icon">{kind==='entrance'?'↳':'◇'}</span><h2>{label}</h2></div><span className="badge">{selected?(isEntrance?'Region selected':draft.regions.includes(selected.region)?'Selected · review coverage':'Choose coverage'):'Needs location'}</span></div>
    <div className="location-choice"><label><span className="sr-only">{label} location</span><select value={manual?'manual':choice||(locations.length?'0':'')} onChange={e=>{setChoice(e.target.value);setManual(null);setPlane(null);if(isEntrance)update({entranceRegion:all[Number(e.target.value)].region});}}><option value="manual" disabled>Manual coordinates</option>{!locations.length&&<option value="">Choose a location to review</option>}{all.map((p,i)=><option key={i} value={String(i)}>{p.title} · {p.x}, {p.y}{p.role==='entrance'?' · entrance':''}</option>)}</select></label><label className="plane-control">Plane <select aria-label={`${label} plane`} value={plane??selected?.plane??0} onChange={e=>setPlane(+e.target.value)}>{[0,1,2,3].map(p=><option key={p}>{p}</option>)}</select></label></div>
    <div className="pane-tools">
      {combined&&<button className={entranceMode?'chosen':''} onClick={()=>setEntranceMode(v=>!v)}>{entranceMode?'Entrance chunks':'Arena coverage'}</button>}
      {!isEntrance&&<><button className={!chunkMode?'chosen':''} onClick={()=>setChunkMode(false)}>Regions</button><button className={chunkMode?'chosen':''} onClick={()=>setChunkMode(true)}>Chunks</button></>}
      {isEntrance&&<><span>Region {entranceRegions[0]??'not located'}</span><button className={chunkMode?'chosen':''} aria-pressed={chunkMode} onClick={()=>setChunkMode(v=>!v)}>{chunkMode?'Done with chunks':'Restrict to chunks (optional)'}</button></>}
      <button className="recenter" onClick={()=>setRecenter(n=>n+1)}>⌖ Recenter</button>
    </div>
    {selected?<RegionMap tileSource={selected.tiles} selected={isEntrance?entranceRegions:draft.regions} existing={isEntrance?EMPTY_IDS:boss.regions} locations={mapLocations} center={center} plane={plane??selected.plane??0} chunks={chunks} chunkMode={chunkMode} onChunkToggle={toggleChunk} onToggle={id=>isEntrance?update({entranceRegion:id}):update({regions:draft.regions.includes(id)?draft.regions.filter(n=>n!==id):[...draft.regions,id].sort((a,b)=>a-b)})}/>:<div className="missing-location"><span>{kind==='entrance'?'↳':'◇'}</span><h3>{kind==='entrance'?'Entrance not located':'Arena not located'}</h3><p>A missing map does not mean this boss is supported. Load wiki locations or enter coordinates below.</p><button onClick={onLoad}>Load wiki locations</button></div>}
    <form className="pane-jump" onSubmit={e=>{e.preventDefault();try{const parts=jump.trim().split(/[\s,]+/);if(parts.length!==2)throw new Error('Enter X, Y coordinates.');const[x,y]=parts.map(Number);const r=regionId(x,y);setManual({x,y,region:r,plane:plane??0,mapId:null,role:kind==='entrance'?'entrance':'location',caption:'Manual location',source:'',title:'Manual coordinates',revision:null,verified:false});}catch(error){onError((error as Error).message);}}}><input aria-label={`${label} coordinates`} value={jump} onChange={e=>setJump(e.target.value)} placeholder="Jump to X, Y"/><button>Go →</button>{selected&&<code>Region {selected.region}</code>}</form>
    <div className="pane-caption"><span className={`dot ${kind==='entrance'?'coral':'gold'}`}/>{selected?selected.caption||'Wiki map · verify this location in game':'No coordinates assumed'}{selected?.source&&<a href={selected.source} target="_blank" rel="noreferrer">Source ↗</a>}</div>
    {selected&&<div className="map-provenance">{selected.tiles?`Wiki rendered tiles · ${selected.tiles.version}`:'Legacy map tiles · visual alignment not verified'}{selected.pinX!==undefined&&<span>Pointer {selected.pinX}, {selected.pinY} · {selected.icon}</span>}</div>}
  </section>;
}

