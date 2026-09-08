import { paintGrid } from './core/map-grid.mjs';
import { panelSize } from './core/pr-evidence.mjs';
import { prRequest } from './pr-client';
import { evidenceTile } from './core/evidence-tiles.mjs';
export type EvidenceImage={id:string;png:string;url:string};
const tileCache=new Map<string,Promise<ImageBitmap>>();
async function tile(region:number,context:any){
  const key=JSON.stringify({region,context});
  if(!tileCache.has(key))tileCache.set(key,evidenceTile(region,context,(region:number,context:any)=>prRequest('/tiles',{region,context})).then((blob:Blob)=>createImageBitmap(blob)).then((bitmap:ImageBitmap)=>{
    if(bitmap.width!==256||bitmap.height!==256){bitmap.close();throw new Error(`Map tile ${region} has unexpected dimensions.`);}
    return bitmap;
  }).catch((e:Error)=>{tileCache.delete(key);throw e;}));
  return tileCache.get(key)!;
}
export async function renderEvidence(panels:any[],progress:(value:string)=>void){
  const images:EvidenceImage[]=[];
  for(const [index,p] of panels.entries()){
    const label=[p.state==='before'?'Before':p.state==='after'?'After':'',p.label??p.kind].filter(Boolean).join(' · ');
    progress(`Rendering screenshot ${index+1} of ${panels.length}: ${p.name} ${label}`);
    const canvas=document.createElement('canvas'),size=panelSize(p);canvas.width=size.width;canvas.height=size.height;
    const scale=p.renderScale===2?2:1,width=canvas.width/scale,height=canvas.height/scale;
    const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#f7f7f4';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#263244';ctx.font='bold 18px sans-serif';ctx.fillText(`${p.name} · ${label} · Plane ${p.context.plane}`,16,28,width-32);
    ctx.font='12px sans-serif';ctx.fillText('North ↑ · Purple outlines: selected regions / chunks · Editor selections, not in-game verification',16,51,width-32);
    const overlay=document.createElement('canvas');overlay.width=overlay.height=256*scale;overlay.getContext('2d')!.scale(scale,scale);
    // Fetch in groups of four, including when a large selection spans many panels.
    for(let offset=0;offset<p.regions.length;offset+=4){
      const batch=p.regions.slice(offset,offset+4);const bitmaps=await Promise.all(batch.map((id:number)=>tile(id,p.context)));
      for(const [i,id] of batch.entries()){
        const x=16+((id>>8)-p.minX)*256,y=64+(p.maxY-(id&255))*256;
        ctx.drawImage(bitmaps[i],x,y,256,256);
        if(p.restrictChunks){
          ctx.fillStyle='#26324488';ctx.fillRect(x,y,256,256);
          for(const chunk of p.chunks){if(((chunk>>11)>>3)!==(id>>8)||(((chunk&2047)>>3)!==(id&255)))continue;const sx=((chunk>>11)&7)*32,sy=(7-(chunk&7))*32;ctx.drawImage(bitmaps[i],sx,sy,32,32,x+sx,y+sy,32,32);}
        }
        paintGrid(overlay.getContext('2d'),{region:id,selected:p.regions,existing:[],chunks:p.chunks,chunkMode:p.restrictChunks,fine:p.restrictChunks});ctx.drawImage(overlay,x,y,256,256);
      }
    }
    let y=64+p.rows*256+22;ctx.font='12px monospace';ctx.fillStyle='#263244';
    ctx.fillText(`Regions: ${p.regions.join(', ')}`,16,y,width-32);y+=20;
    if(p.chunks.length){for(let i=0;i<p.chunks.length;i+=10){ctx.fillText(`${i===0?'Chunks: ':''}${p.chunks.slice(i,i+10).join(', ')}`,16,y,width-32);y+=18;}}
    ctx.font='11px sans-serif';ctx.fillText('Map tiles: OSRS Wiki / Explv · Game imagery © Jagex',16,height-18);
    const url=canvas.toDataURL('image/png');images.push({id:p.id,url,png:url.split(',')[1]});
  }
  return images;
}
