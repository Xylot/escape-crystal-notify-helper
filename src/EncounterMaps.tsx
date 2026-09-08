import EntranceDanger from './EntranceDanger';
import EntranceMapChoices,{type EntranceMapChoice} from './EntranceMapChoices';
import {isDungeon} from './core/encounter-kind.mjs';
import { useEffect,useMemo,useRef,useState } from 'react';
import { RegionMap } from './Map';
import { encounterLocations,originalEntranceChunks,refreshedLocation } from './core/encounter.mjs';
import { chunkOrigin,regionId,regionOrigin } from './core/coordinates.mjs';
import {outlineCoverage} from './core/map-outline.mjs';
import {chunkSelectionCenter} from './core/map-framing.mjs';
import {loadRegionObjects} from './core/region-objects.mjs';
import {entranceMapSuggestions,uniqueEntranceMapChoices} from './core/entrance-map-suggestions.mjs';
import {suggestedEntranceChange} from './core/entrance-selection.mjs';
import {entranceOverlay} from './core/authoring.mjs';
import {entranceArenaFallback,entranceNotificationDefault,hasAreaSelection,locationAreaChange} from './core/location-defaults.mjs';
import type { Boss,Draft,Location } from './types';

type Props={boss:Boss;draft:Draft;update:(change:Partial<Draft>)=>void;onError:(message:string)=>void;onLoad:()=>void;focus?:'arena'|'entrance';loading?:boolean;evidenceContext?:{arena?:Location;entrance?:Location};onEvidenceContext?:(kind:'arena'|'entrance',location:Location)=>void;onEntrancePickerChange?:(choosing:boolean)=>void;onQuickReview?:(change:Partial<Draft>,location:Location)=>void};
const EMPTY_IDS:number[]=[];
export default function EncounterMaps(props:Props){
  const {boss}=props;
  const locations=useMemo(()=>encounterLocations(boss),[boss]);
  const fallback=useMemo(()=>entranceArenaFallback(boss,props.draft,props.evidenceContext?.arena),[boss,props.draft.regions,props.draft.chunks,props.evidenceContext?.arena]);
  const [objectLocations,setObjectLocations]=useState<Location[]>([]);
  const [findingEntrances,setFindingEntrances]=useState(false);
  const suggestionKey=JSON.stringify([boss.id,boss.name,props.draft.regions,props.draft.chunks,props.draft.entrancePlane,props.draft.entrance?.ids]);
  const suggestFromArena=!isDungeon(boss)&&props.focus==='entrance'&&props.draft.regions.length>0&&(!locations.entrance.length||locations.entrance.every((location:Location)=>props.draft.regions.includes(location.region)));
  useEffect(()=>{
    let active=true;setObjectLocations([]);
    if(!suggestFromArena){setFindingEntrances(false);return;}
    setFindingEntrances(true);
    loadRegionObjects().then(data=>{
      if(active)setObjectLocations(entranceMapSuggestions(data,{name:boss.name,regions:props.draft.regions,chunks:props.draft.chunks??[],plane:props.draft.entrancePlane??props.evidenceContext?.arena?.plane??0,selectedIds:props.draft.entrance?.ids??[],arena:props.evidenceContext?.arena}));
    }).catch(error=>{if(active)props.onError(`Could not load entrance map suggestions: ${error.message}`);}).finally(()=>{if(active)setFindingEntrances(false);});
    return()=>{active=false;};
  },[suggestFromArena,suggestionKey]);
  const entranceLocations=useMemo(()=>[...(locations.entrance.length?locations.entrance:fallback?[fallback.location as Location]:[]),...objectLocations],[locations.entrance,fallback,objectLocations]);
  const [split,setSplit]=useState(true);
  const [choosingMap,setChoosingMap]=useState(props.focus==='entrance');
  const [chosenLocation,setChosenLocation]=useState<Location>();
  useEffect(()=>{props.onEntrancePickerChange?.(props.focus==='entrance'&&choosingMap);},[choosingMap,props.focus]);
  const choices=useMemo(()=>{
    const result:EntranceMapChoice[]=[];
    const current=props.evidenceContext?.entrance;
    if(current&&props.draft.entranceRegion!==undefined){
      const chunks=(props.draft.entranceNotifyChunks??[]).filter(id=>Number.isInteger(id)&&id>=0&&id<=4194303);
      result.push({location:current,chunks,regions:chunks.length?[...new Set(chunks.map(id=>{const p=chunkOrigin(id);return regionId(p.x,p.y);} ))]:[props.draft.entranceRegion],label:'Current entrance area',current:true});
    }
    for(const location of entranceLocations as Location[]){
      try{
        const area=location.notificationChunks?{regions:[location.region],chunks:location.notificationChunks}:fallback&&location===fallback.location?fallback.coverage:location.outline?outlineCoverage(location.outline):{regions:[location.region],chunks:[]};
        result.push({location,...area,label:location.title});
      }catch{/* An invalid outline remains available through manual mapping. */}
    }
    return uniqueEntranceMapChoices(result);
  },[entranceLocations,fallback,props.evidenceContext?.entrance,props.draft.entranceRegion,props.draft.entranceNotifyChunks]);
  const chooseMap=(choice:EntranceMapChoice)=>{
    const location={...choice.location,notificationChunks:choice.chunks};
    const change=locationAreaChange(boss,props.draft,location,true,{regions:choice.regions,chunks:choice.chunks});
    if(change)props.update(change);
    const context={...location,region:change&&'entranceRegion' in change?change.entranceRegion:location.region};
    props.onEvidenceContext?.('entrance',context);setChosenLocation(context);setChoosingMap(false);
  };
  const shared=!props.focus&&locations.shared&&!split;
  const useSuggestion=(choice:EntranceMapChoice)=>{
    try{
      const location={...choice.location,notificationChunks:choice.chunks};
      const config=props.draft.entrance??{overlay:entranceOverlay(props.draft),direction:'',plane:'',objectType:'GAME_OBJECT',ids:[],chunks:[]};
      const change=suggestedEntranceChange(props.draft,location,config);
      if(props.onQuickReview)props.onQuickReview(change,location);
      else {props.update(change);props.onEvidenceContext?.('entrance',location);setChosenLocation(location);setChoosingMap(false);}
    }catch(error){props.onError((error as Error).message);}
  };
  if(props.focus==='entrance'&&choosingMap)return <><EntranceDanger draft={props.draft} update={props.update}/><EntranceMapChoices choices={choices} loading={findingEntrances} onChoose={chooseMap} onManual={()=>setChoosingMap(false)} onUse={useSuggestion} canUse={typeof props.draft.entranceDangerous==='boolean'} quickReview={!!props.onQuickReview}/></>;
  return <div className="encounter-workspace">
    {props.focus==='entrance'&&<EntranceDanger draft={props.draft} update={props.update}/>}
    {!props.focus&&<div className="encounter-intro"><span>ENCOUNTER LOCATIONS</span><p>{shared?'Entrance and arena share a map region.':'Compare the approach and the fight without losing your place.'}</p>{locations.shared&&<button onClick={()=>setSplit(v=>!v)}>{split?'Combine maps':'Separate maps'}</button>}</div>}
    <div className={`encounter-grid ${shared||props.focus?'shared-map':''}`}>
      {!shared&&!isDungeon(boss)&&props.focus!=='arena'&&<div><LocationPane {...props} kind="entrance" locations={entranceLocations} alternatives={boss.maps} fallback={fallback} initialLocation={chosenLocation} onChooseMap={()=>setChoosingMap(true)}/></div>}
      {props.focus!=='entrance'&&<div><LocationPane {...props} kind="arena" locations={locations.arena} alternatives={boss.maps} combined={shared}/></div>}
    </div>
  </div>;
}
function LocationPane({boss,draft,update,onError,onLoad,loading,evidenceContext,onEvidenceContext,kind,locations,alternatives,combined=false,fallback,initialLocation,onChooseMap}:Props&{kind:'entrance'|'arena';locations:Location[];alternatives:Location[];combined?:boolean;fallback?:ReturnType<typeof entranceArenaFallback>;initialLocation?:Location;onChooseMap?:()=>void}){
  const [choice,setChoice]=useState(''),[manual,setManual]=useState<Location|null>(initialLocation??null),[plane,setPlane]=useState<number|null>(null),[jump,setJump]=useState('');
  const [chunkModes,setChunkModes]=useState(()=>({
    arena:!!draft.chunks?.length,
    entrance:!!(draft.entrance?.chunks??originalEntranceChunks(boss.entranceEntry?.optionalArgs??boss.optionalArgs)).length,
  }));


  const [entranceMode,setEntranceMode]=useState(false),[recenter,setRecenter]=useState(0);
  // Snapshot the selection on entry; clicking chunks must not move the map mid-edit.
  const [entranceCenter,setEntranceCenter]=useState(()=>chunkSelectionCenter(draft.entranceNotifyChunks??[]));
  const [jumpCenter,setJumpCenter]=useState<[number,number]|null>(null);
  const sameChoice=(l:Location,m:Location)=>l.x===m.x&&l.y===m.y&&l.source===m.source&&l.plane===m.plane&&l.mapId===m.mapId&&JSON.stringify(l.outline)===JSON.stringify(m.outline);
  const all=useMemo(()=>[...locations,...alternatives.filter(m=>!locations.some(l=>sameChoice(l,m)))],[locations,alternatives]);
  const saved=refreshedLocation(evidenceContext?.[kind],all) as Location|undefined;
  const regionFallback=useMemo<Location|null>(()=>{const region=kind==='entrance'?draft.entranceRegion:draft.regions[0];if(region===undefined)return null;const p=regionOrigin(region);return {x:p.x+32,y:p.y+32,region,plane:null,mapId:null,role:'location',caption:'Selected coverage · verify this location in game',source:'',title:'Selected region',revision:null,verified:false};},[kind,draft.regions[0],draft.entranceRegion]);
  const selected=manual??(choice!==''?all[Number(choice)]:undefined)??saved??(kind==='entrance'&&draft.entranceRegion!==undefined?regionFallback:undefined)??locations[0]??regionFallback;
  useEffect(()=>{setChoice('');},[locations,alternatives]);
  const isEntrance=kind==='entrance'||combined&&entranceMode;
  const center=useMemo<[number,number]>(()=>jumpCenter??(isEntrance&&entranceCenter?entranceCenter as [number,number]:selected?[selected.x,selected.y]:[0,0]),[selected?.x,selected?.y,isEntrance,entranceCenter,jumpCenter,recenter]);
  const chunkTarget=isEntrance?'entrance':'arena';
  const notificationMode=isEntrance;
  const chunkMode=notificationMode||chunkModes[chunkTarget];
  const setChunkMode=(value:boolean)=>setChunkModes(previous=>({...previous,[chunkTarget]:value}));
  const shownPlane=(isEntrance?draft.entrancePlane:undefined)??plane??selected?.plane??0;
  const oldChunks=useMemo(()=>originalEntranceChunks(boss.entranceEntry?.optionalArgs??boss.optionalArgs),[boss.entranceEntry,boss.optionalArgs]);
  const rawChunks:number[]=notificationMode?(draft.entranceNotifyChunks??EMPTY_IDS):isEntrance?(draft.entrance?.chunks??oldChunks):(draft.chunks??EMPTY_IDS);
  // Incomplete text input remains invalid for export, but must not crash the map.
  const chunks=useMemo(()=>rawChunks.filter(id=>Number.isInteger(id)&&id>=0&&id<=4194303),[rawChunks]);
  const entranceRegions=useMemo(()=>[...new Set([...(draft.entranceRegion!==undefined?[draft.entranceRegion]:selected?[selected.region]:[]),...chunks.map(id=>{const p=chunkOrigin(id);return regionId(p.x,p.y);})])],[draft.entranceRegion,selected,chunks]);
  const mapLocations=useMemo(()=>combined?alternatives:selected?.entranceObjects?.length?selected.entranceObjects.map(object=>({...selected,x:object.x,y:object.y,pinX:object.x,pinY:object.y})):selected?[selected]:[],[combined,alternatives,selected]);
  useEffect(()=>{if(selected)onEvidenceContext?.(kind,{...selected,plane:shownPlane,...(isEntrance?{region:entranceRegions[0]??selected.region}:{})});},[selected,shownPlane,isEntrance,entranceRegions[0]]);
  function toggleChunk(id:number){
    const next=chunks.includes(id)?chunks.filter(n=>n!==id):[...chunks,id].sort((a,b)=>a-b);
    if(notificationMode){update({entranceNotifyChunks:next});return;}
    const point=chunkOrigin(id),region=regionId(point.x,point.y);
    update({chunks:next,regions:[...new Set([...draft.regions,region])].sort((a,b)=>a-b)});
  }
  function selectArea(location:Location){
    try{
      const coverage=isEntrance&&fallback&&sameChoice(location,fallback.location as Location)?fallback.coverage:location.outline?outlineCoverage(location.outline):null;
      const change=locationAreaChange(boss,draft,location,isEntrance,coverage);
      if(change)update(change);
      if(coverage?.chunks.length)setChunkMode(true);
    }catch(error){onError((error as Error).message);}
  }
  const automaticSelection=useRef('');
  useEffect(()=>{
    if(!selected||manual||loading)return;
    const key=JSON.stringify([isEntrance,selected.source,selected.x,selected.y,selected.outline]);
    if(automaticSelection.current===key)return;
    automaticSelection.current=key;
    const notificationDefault=isEntrance&&fallback&&(sameChoice(selected,fallback.location as Location)||selected===regionFallback)?entranceNotificationDefault(boss,draft,fallback):null;
    if(notificationDefault){update(notificationDefault);return;}
    // Apply defaults once; revisiting a step or editing chunks must retain edits.
    if(!hasAreaSelection(boss,draft,isEntrance))selectArea(selected);
  },[selected,manual,loading,isEntrance]);
  const label=combined?'Arena & entrance':kind==='entrance'?'Boss entrance':isDungeon(boss)?'Dungeon coverage':'Boss arena';
  return <section className={`location-pane ${kind}`} aria-label={label}>
    <div className="location-heading"><div><span className="location-icon">{kind==='entrance'?'↳':'◇'}</span><h2>{label}</h2></div><span className="badge">{selected?(isEntrance?'Region selected':draft.regions.includes(selected.region)?'Selected · review coverage':'Choose coverage'):'Needs location'}</span></div>
    <div className="location-choice">{kind==='entrance'?<div className="entrance-map-current"><strong>{selected?.title??'Entrance area'}</strong><button type="button" onClick={onChooseMap}>Choose another map</button></div>:<label><span className="sr-only">{label} location</span><select value={manual?'manual':String(selected?all.indexOf(selected):-1)} onChange={e=>{setChoice(e.target.value);setManual(null);setPlane(null);const location=all[Number(e.target.value)];if(location)selectArea(location);}}>
      <option value="manual" disabled>Manual coordinates</option>
      {selected&&!all.includes(selected)&&!manual&&<option value="-1" disabled>{selected.title} · Region {selected.region} · {selected.x}, {selected.y}</option>}
      {!selected&&<option value="-1">Choose a location to review</option>}
      {all.map((p,i)=><option key={i} value={String(i)}>{p.title}{p.outline?' · Location outline':` · Region ${p.region} · ${p.x}, ${p.y}`}{p.role==='entrance'?' · entrance':''}</option>)}
    </select></label>}<label className="plane-control">Plane <select aria-label={`${label} plane`} value={shownPlane} onChange={e=>{setPlane(+e.target.value);if(isEntrance)update({entrancePlane:+e.target.value});}}>{[0,1,2,3].map(p=><option key={p}>{p}</option>)}</select></label></div>
    <div className="pane-tools">
      {combined&&<button className={entranceMode?'chosen':''} onClick={()=>setEntranceMode(v=>!v)}>{entranceMode?'Entrance chunks':'Arena coverage'}</button>}
      {!isEntrance&&<><button aria-pressed={!chunkMode} className={!chunkMode?'chosen':''} onClick={()=>setChunkMode(false)}>Regions</button><button aria-pressed={chunkMode} className={chunkMode?'chosen':''} onClick={()=>setChunkMode(true)}>Chunks</button></>}
      {isEntrance&&<><span>Notification chunks</span><span>Region {entranceRegions[0]??'not located'}</span></>}
      <button className="recenter" onClick={()=>{setJumpCenter(null);setEntranceCenter(chunkSelectionCenter(draft.entranceNotifyChunks??[]));setRecenter(n=>n+1);}}>⌖ Recenter</button>
    <form className="pane-jump" onSubmit={e=>{e.preventDefault();try{const parts=jump.trim().split(/[\s,]+/);if(parts.length!==2)throw new Error('Enter X, Y coordinates.');const[x,y]=parts.map(Number);const r=regionId(x,y);setJumpCenter([x,y]);if(isEntrance)update({entranceRegion:r});setManual({x,y,region:r,plane:shownPlane,mapId:null,role:kind==='entrance'?'entrance':'location',caption:'Manual location',source:'',title:'Manual coordinates',revision:null,verified:false});}catch(error){onError((error as Error).message);}}}><input aria-label={`${label} coordinates`} value={jump} onChange={e=>setJump(e.target.value)} placeholder="Jump to X, Y"/><button>Go →</button>{selected&&<code>Region {selected.region}</code>}</form>
    </div>
    {selected?<RegionMap tileSource={selected.tiles} selected={isEntrance?entranceRegions:draft.regions} existing={isEntrance?EMPTY_IDS:boss.regions} locations={mapLocations} center={center} plane={shownPlane} chunks={chunks} chunkMode={chunkMode} onChunkToggle={toggleChunk} onToggle={id=>isEntrance?update({entranceRegion:id}):update({regions:draft.regions.includes(id)?draft.regions.filter(n=>n!==id):[...draft.regions,id].sort((a,b)=>a-b)})}/>:<div className="missing-location"><span>{kind==='entrance'?'↳':'◇'}</span><h3>{loading?'Finding wiki locations…':kind==='entrance'?'Entrance not located':isDungeon(boss)?'Dungeon not located':'Arena not located'}</h3><p>Load suggested locations from the wiki, or jump to known coordinates above.</p><button disabled={loading} onClick={onLoad}>{loading?'Loading…':'Load wiki locations'}</button></div>}

    <div className="pane-caption"><span className={`dot ${kind==='entrance'?'coral':'gold'}`}/>{selected?selected.caption||'Wiki map · verify this location in game':'No coordinates assumed'}{selected?.source&&<a href={selected.source} target="_blank" rel="noreferrer">Source ↗</a>}</div>
    {selected&&<div className="map-provenance">{selected.tiles?`Wiki rendered tiles · ${selected.tiles.version}`:'Legacy map tiles · visual alignment not verified'}{selected.pinX!==undefined&&<span>Pointer {selected.pinX}, {selected.pinY} · {selected.icon}</span>}</div>}
  </section>;
}
