import {resolveBossImage} from './boss-images.mjs';
import {bossKey} from './catalog.mjs';
import {enumName} from './java.mjs';
import {api,fetchPage,wikiUrl} from './wiki.mjs';

export const DUNGEON_ALIASES={
  DUNGEON_ELEMENTAL_WORKSHOP:'Elemental Workshop (dungeon)',DUNGEON_TEMPLE_OF_IKOV:'Temple of Ikov (dungeon)',
  DUNGEON_UNDERGROUND_PASS:'Underground Pass (dungeon)',
  DUNGEON_ASGARNIAN_ICE_CAVES:'Asgarnian Ice Dungeon',DUNGEON_DORGESHUUN_MINES:'Dorgesh-Kaan mine',
  DUNGEON_EVIL_CHICKENS_LAIR:"Evil Chicken's Lair",DUNGEON_GIANTS_DEN:"Giants' Den",
  DUNGEON_JATIZSO_MINES:'Jatizso mine',DUNGEON_JIGGIG_BURIAL_TOMB:'Jiggig Dungeon',
  DUNGEON_MOS_LE_HARMLESS_CAVES:"Mos Le'Harmless Cave",DUNGEON_MYTHS_GUILD:"Myths' Guild Dungeon",
  DUNGEON_RASHILIYIAS_TOMB:"Rashiliyia's Tomb",DUNGEON_TEMPLE_OF_MARIMBO:'Temple of Marimbo Dungeon',
  DUNGEON_TOLNA:"Tolna's rift",DUNGEON_WATERBIRTH:'Waterbirth Island Dungeon',
  DUNGEON_WITCHAVEN_SHRINE:'Witchaven Dungeon',DUNGEON_WOODCUTTING_GUILD:'Woodcutting Guild Ent Dungeon',
};

export function extractDungeonCatalog(Parser,page){
  const root=Parser.parse(page.text),found=new Map();let section='',bullet=[];
  const finish=()=>{
    const link=bullet.find(t=>t.type==='link');bullet=[];
    if(!section||!link)return;
    const title=String(link.name).split('#')[0].replaceAll('_',' ').trim();
    if(!title||title.includes(':'))return;
    const key=bossKey(title);if(found.has(key))return;
    found.set(key,{id:enumName(title,'DUNGEONS'),name:title,wikiTitle:title,regionType:'DUNGEONS',categories:['Dungeons'],area:section,
      catalogSource:wikiUrl(page.title),catalogRevision:page.revision,regions:[],raw:null,deathType:'UNSAFE',optionalArgs:[],maps:[],links:[],warnings:[],locationTitles:[]});
  };
  for(const token of root.childNodes){
    if(token.type==='heading'){finish();section=String(token).replace(/^=+|=+$/g,'').trim();continue;}
    if(token.type==='list'){finish();bullet=[token];continue;}
    if(bullet.length)bullet.push(token);
  }
  finish();if(!found.size)throw new Error('No dungeon list entries were recognized. The previous catalog is unchanged.');
  return {source:wikiUrl(page.title),revision:page.revision,dungeons:[...found.values()].sort((a,b)=>a.name.localeCompare(b.name))};
}
export async function fetchDungeonCatalog(Parser){return extractDungeonCatalog(Parser,await fetchPage('List of dungeons'));}

// Use the infobox's map, never its scenic image or the dungeon entrance icon.
export function primaryDungeonMap(Parser,text){
  const root=Parser.parse(text);
  for(const token of root.querySelectorAll('template')){
    if(!/^infobox location$/i.test(String(token.name).replace(/^Template:/i,'').replaceAll('_',' ').trim()))continue;
    const args=Object.fromEntries(token.getAllArgs().map(a=>[a.name.trim().toLowerCase(),String(a.lastChild)]));
    for(const key of ['map',...Object.keys(args).filter(k=>/^map\d+$/.test(k)).sort((a,b)=>+a.slice(3)-+b.slice(3))]){
      const value=args[key]?.trim();
      const file=value?.match(/\[\[(?:File|Image):([^\]|]+)(?:\||\]\])/i)?.[1]??(/^(?:File:)?[^{}<>|\[\]\n]+\.(?:png|webp|jpe?g)$/i.test(value??'')?value.replace(/^File:/i,''):null);
      if(file)return `File:${file.trim()}`;
    }
  }
  const file=root.querySelectorAll('file').map(t=>String(t.name).replaceAll('_',' ')).find(name=>/\bmap\.(?:png|webp|jpe?g)$/i.test(name));
  return file??null;
}

// Retain location enrichment without overwriting fresh list metadata.
export function retainDungeonLocations(dungeons,previous=[]){
  return dungeons.map(d=>{const prior=previous.find(p=>p.wikiTitle===d.wikiTitle);return {...d,maps:prior?.maps??[],links:prior?.links??[],warnings:prior?.warnings??[],locationsLoaded:prior?.locationsLoaded??false};});
}

export async function resolveDungeonImage(Parser,title,request=api,read=fetchPage){
  const page=await read(title);
  // A missing or unavailable static map can still have a working wiki widget.
  let staticFailure;
  try{const image=await resolveBossImage(Parser,title,request,async()=>page,false,primaryDungeonMap);if(image)return image;}catch(error){staticFailure=error;}
  const rendered=await request({action:'parse',oldid:String(page.revision),prop:'text'});
  const {wikiMapImage}=await import('./wiki-map-images.mjs');
  const image=wikiMapImage(rendered.parse,{source:wikiUrl(page.title),revision:page.revision});
  if(!image&&staticFailure)throw staticFailure;
  return image;
}
