import {isDungeon} from '../src/core/encounter-kind.mjs';
import {itemIconId,itemIconName} from '../src/core/item-icon.mjs';
import {moidImage} from '../src/core/moid-images.mjs';
const md=value=>String(value).replace(/[\\`*_{}[\]<>()!#|]/g,'\\$&').replace(/[\r\n]+/g,' ');
const html=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function stateBody(record,c,images){
  const dungeon=isDungeon(c),entrance=c.entrance,overlay=entrance?.overlay??c.entranceOverlay;
  let text=`- Encounter name: ${md(c.name)}\n- Dangerous for: ${c.deathType==='UNSAFE'?'HC & HCGIM':c.deathType==='UNSAFE_HCGIM'?'HCGIM only':'Neither'}\n`;
  if(!dungeon){
    text+=`- Recommended inactivity time: ${c.recommendedSeconds!==undefined?`${c.recommendedSeconds} seconds`:'Unchanged'}\n`;
    text+=`- Entrance priority: ${overlay?overlay.startsWith('DEPRIORITIZED')?'Deprioritized':'Prioritized':c.entranceRaw?'Preserved source settings':'No entrance'}\n`;
    text+=`- Entrance dangerous: ${c.entranceDangerous===false?'No':c.entranceDangerous===true?'Yes':c.entranceRaw?'Same as encounter':'Not applicable'}\n`;
    text+=`- Boss instanced: ${c.bossInstanced?'Yes':'No'}\n\n### Pet: ${md(itemIconName(c.petIcon))}\n\n`;
    const petId=itemIconId(c.petIcon);
    text+=petId?`![Pet icon](https://static.runelite.net/cache/item/icon/${petId}.png)\n\n`:c.petIcon?'Icon unavailable for this item constant.\n\n':'Not configured.\n\n';
    text+='### Entrance Model\n\n';
    const models=record.presentation?.[c.id]?.images??[];
    for(const id of models){const image=moidImage(id);text+=`<a href="${image.source}"><img src="${image.url}" alt="Entrance model reference" width="180" /></a>\n`;}
    if(!models.length)text+='No model reference selected.\n';
  }
  text+='\n### Region & Chunk screenshots\n\n';
  for(const p of record.evidence.panels.filter(p=>p.bossId===c.id))text+=`![${md(c.name)} ${p.label??p.kind}](${images[p.id]})\n\n`;
  text+='<details>\n<summary>IDs and technical details</summary>\n\n';
  text+=`- Encounter ID: ${md(c.id)}\n- Death classification: ${md(c.deathType)}\n- ${dungeon?'Dungeon':'Arena'} regions: ${(c.arenaRegions??c.regions).join(', ')}\n- ${dungeon?'Dungeon':'Arena'} chunks: ${c.chunks?.join(', ')||'Whole selected regions'}\n`;
  if(!dungeon){
    text+=`- Entrance regions: ${c.entranceRegions?.join(', ')||'None'}\n- Entrance coverage chunks: ${c.entranceNotifyChunks?.join(', ')||'Whole entrance area'}\n`;
    if(entrance)text+=`- Entrance IDs: ${entrance.ids.map(md).join(', ')}\n- Entrance object type: ${md(entrance.objectType)}\n- Entrance chunks: ${entrance.chunks.join(', ')||'None'}\n- Entrance options: ${md(entrance.overlay)}, direction ${md(entrance.direction||'default')}, plane ${md(entrance.plane||'default')}\n`;
    text+=`- Pet item: ${md(c.petIcon??'None')}${itemIconId(c.petIcon)?` (ID ${itemIconId(c.petIcon)})`:''}\n`;
    if(c.bossInstanced)text+='- Instance behavior: region notifications activate only inside the instance.\n';
    if(c.entranceDangerous===false)text+='- Entrance area: Not dangerous; region notifications disabled.\n';
  }
  if(c.entranceRaw&&!entrance)text+='\nEntrance source settings:\n\n<pre>'+html(c.entranceRaw)+'</pre>\n';
  if(c.extraSettings?.length)text+='\nAdditional settings:\n\n<pre>'+html(c.extraSettings.join('\n'))+'</pre>\n';
  text+='\n### Wiki sources\n\n'+record.evidence.sources[c.id].map((url,i)=>`- [Wiki source ${i+1}](${url})`).join('\n');
  return text+'\n\n</details>';
}
