export function paintGrid(ctx,state){
 const {region,selected,existing,chunks,chunkMode,fine}=state;
 ctx.clearRect(0,0,256,256);const chosen=selected.includes(region),old=existing.includes(region);
 const restrictChunks=chunkMode||chunks.length>0;
 // Dim only excluded coverage; selected terrain stays unobscured.

 const rx=region>>8,ry=region&255;
 if(restrictChunks||fine){for(let x=0;x<8;x++)for(let y=0;y<8;y++){
 const id=((rx*8+x)<<11)|(ry*8+y);const px=x*32,py=(7-y)*32;
 const selectedChunk=chunks.includes(id);

 ctx.strokeStyle=selectedChunk?'#6452bb':'#70879e66';ctx.lineWidth=selectedChunk?2:.5;ctx.strokeRect(px,py,32,32);
 }}
 ctx.strokeStyle=chosen?'#6452bb':old?'#b95b4b':'#70879e';ctx.lineWidth=chosen?3:1;ctx.strokeRect(.5,.5,255,255);
 ctx.fillStyle=chosen?'#51419d':'#ffffffed';ctx.fillRect(99,116,58,23);ctx.fillStyle=chosen?'white':'#26314b';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(String(region),128,132);
}
