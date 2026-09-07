import {trackMapTiles} from './core/map-image-loading.mjs';
import { useEffect, useState, useRef, useMemo } from 'react';
import { BossSigil } from './Icons';
import { loadParser } from './parser';
import { createImageCache, resolveBossImage } from './core/boss-images.mjs';
import type { Boss } from './types';
import {isDungeon} from './core/encounter-kind.mjs';
import {resolveDungeonImage} from './core/dungeons.mjs';

export type BossImage = { url: string; width: number; height: number; source: string; filePage: string; fetchedAt: number;kind?:string;map?:{width:number;height:number;tiles:{url:string;x:number;y:number}[]} };
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Images can use memory caching. */ }
const bossImages = createImageCache({ storage, resolve: async (title: string) => resolveBossImage(await loadParser(), title) });
const dungeonImages=createImageCache({storage,storageKey:'escape-crystal-dungeon-images:v1',resolve:async(title:string)=>resolveDungeonImage(await loadParser(),title)});

function useBossImage(title: string, dungeon = false) {
  const images=dungeon?dungeonImages:bossImages;
  const [image, setImage] = useState<BossImage | null>(() => images.peek(title));
  useEffect(() => {
    let alive = true;
    setImage(images.peek(title));
    images.get(title).then((value: BossImage | null) => { if (alive) setImage(value); });
    return () => { alive = false; };
  }, [title,images]);
  return image;
}

export default function BossPortrait({ boss, compact = false }: { boss: Boss; compact?: boolean }) {
  const image = useBossImage(boss.wikiTitle,isDungeon(boss));
  const [failed, setFailed] = useState('');
  return <span className={`boss-portrait${compact ? ' compact' : ''}`} aria-hidden="true">
    {image && failed !== image.url ? <PortraitImage image={image} onError={()=>setFailed(image.url)}/> : <BossSigil category={boss.categories?.[0]}/>}
  </span>;
}

export function BossImageSource({ title,dungeon=false }: { title: string;dungeon?:boolean }) {
  const image = useBossImage(title,dungeon);
  return image ? <p className="image-attribution">{dungeon?'Dungeon map':'Boss portrait'} from <a href={image.source} target="_blank" rel="noreferrer">OSRS Wiki</a> · <a href={image.filePage} target="_blank" rel="noreferrer">{image.map?'Wiki map revision · Jagex ↗':'Image details & attribution ↗'}</a></p> : null;
}


export function DungeonMapReference({title}:{title:string}) {
  const image=useBossImage(title,true),[failed,setFailed]=useState('');
  return image&&failed!==image.url?<details className="inspector-disclosure dungeon-map-reference"><summary>Wiki map reference</summary><a href={image.url} target="_blank" rel="noreferrer"><PortraitImage image={image} alt={title+' map from the OSRS Wiki'} onError={()=>setFailed(image.url)}/>{image.map?'Open wiki map ↗':'Open full map ↗'}</a><BossImageSource title={title} dungeon/></details>:null;
}

function PortraitImage({image,alt='',onError}:{image:BossImage;alt?:string;onError:()=>void}){
  return image.map?<WikiMapImage image={image} alt={alt} onError={onError}/>:<img src={image.url} width={image.width} height={image.height} alt={alt} loading="lazy" decoding="async" onError={onError}/>;
}
function WikiMapImage({image,alt,onError}:{image:BossImage;alt:string;onError:()=>void}){
  const ref=useRef<SVGSVGElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{if(!ref.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});observer.observe(ref.current);return()=>observer.disconnect();},[]);
  const map=image.map!;
  const settle=useMemo(()=>trackMapTiles(map.tiles.map(tile=>tile.url),onError),[map]);
  return <svg ref={ref} className="wiki-map-image" role="img" aria-label={alt||'Wiki map preview'} width={map.width} height={map.height} viewBox={'0 0 '+map.width+' '+map.height}>
    <svg width={map.width} height={map.height} overflow="hidden"><rect width={map.width} height={map.height} fill="#111"/>
    {visible&&map.tiles.map((tile,i)=><image key={tile.url+i} href={tile.url} x={tile.x} y={tile.y} width="256" height="256" onLoad={()=>settle(tile.url,true)} onError={event=>{event.currentTarget.style.display='none';settle(tile.url,false);}}/>)}</svg>
  </svg>;
}
