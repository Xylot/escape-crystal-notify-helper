import {api,fetchPage} from './wiki.mjs';
import {primaryBossImage,resolveBossImage} from './boss-images.mjs';

export function matchedEntranceImage(Parser,text,ids,objectType){
  for(const token of Parser.parse(text).querySelectorAll('template')){
    const name=String(token.name).replace(/^Template:/i,'').replaceAll('_',' ').trim().toLowerCase();
    const type=name==='infobox npc'?'NPC':['infobox object','infobox scenery'].includes(name)?'GAME_OBJECT':null;
    if(!type||objectType!=='ANY'&&type!==objectType)continue;
    const args=Object.fromEntries(token.getAllArgs().map(arg=>[arg.name.trim().toLowerCase(),String(arg.lastChild).trim()]));
    for(const [key,value] of Object.entries(args)){
      if(!/^id\d*$/.test(key)||!value.split(/[,\s]+/).some(id=>ids.includes(id)))continue;
      const suffix=key.slice(2),image=args[`image${suffix}`]||args.image;
      if(image)return primaryBossImage(Parser,`{{${name}|image=${image}}}`,true);
    }
  }
  return null;
}

export async function selectedEntranceImages(Parser,ids,objectType,request=api,read=fetchPage){
  const titles=new Set(),images=[];
  for(const id of ids.slice(0,4)){
    if(!/^\d+$/.test(id))continue;
    const data=await request({action:'query',list:'search',srsearch:`insource:${id}`,srlimit:'5'});
    for(const hit of data.query?.search??[])titles.add(hit.title);
  }
  for(const title of [...titles].slice(0,12)){
    const page=await read(title),file=matchedEntranceImage(Parser,page.text,ids,objectType);
    if(!file)continue;
    const image=await resolveBossImage(Parser,title,request,async()=>({...page,text:`{{Infobox object|image=[[${file}]]}}`}),true);
    if(image)images.push({...image,title:page.title});
    if(images.length===4)break;
  }
  return images;
}
