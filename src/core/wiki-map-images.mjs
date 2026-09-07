import {parseFragment} from 'parse5';

// The wiki's static Kartographer preview provides its exact tile URLs and pixel
// offsets. Keep that framing rather than guessing a region from an entrance pin.
export function wikiMapImage(rendered,page){
  const frames=[];
  const visit=node=>{
    const a=Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]));
    if((a.class??'').split(/\s+/).includes('mw-kartographer-map')){
      const width=Number(a['data-width']),height=Number(a['data-height']);
      const style=Object.fromEntries((a.style??'').split(';').map(rule=>{const colon=rule.indexOf(':');return [rule.slice(0,colon).trim().toLowerCase(),rule.slice(colon+1).trim()];}));
      const urls=[...(style['background-image']??'').matchAll(/url\(\s*["']?(https:\/\/maps\.runescape\.wiki\/osrs\/versions\/[A-Za-z0-9_-]+\/tiles\/rendered\/-?\d+\/[0-5]\/[0-3]_\d+_\d+\.png)["']?\s*\)/g)].map(m=>m[1]);
      const positions=(style['background-position']??'').split(',').map(p=>p.trim().match(/^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px$/));
      if(width>0&&width<=2048&&height>0&&height<=2048&&urls.length&&urls.length<=100&&urls.length===positions.length&&positions.every(Boolean)){
        const tiles=urls.map((url,i)=>({url,x:Number(positions[i][1]),y:Number(positions[i][2])})).filter(t=>t.x<width&&t.y<height&&t.x+256>0&&t.y+256>0);
        if(tiles.length)frames.push({width,height,tiles});
      }
    }
    (node.childNodes??[]).forEach(visit);
  };
  visit(parseFragment(rendered.text?.['*']??''));
  const map=frames[0];if(!map)return null;
  const source=page.source,revisionURL=new URL(source);if(page.revision)revisionURL.searchParams.set('oldid',String(page.revision));
  return {kind:'wiki-map',url:source,width:map.width,height:map.height,source,filePage:revisionURL.href,map};
}
