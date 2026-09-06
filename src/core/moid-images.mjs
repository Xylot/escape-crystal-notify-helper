export function moidImage(id) {
  const value=String(id);
  if(!/^\d{1,9}$/.test(value))throw new Error('Enter a numeric object ID.');
  return {id:String(Number(value)),url:`https://chisel.weirdgloop.org/static/img/osrs-object/${Number(value)}_orient0.png`,source:`https://chisel.weirdgloop.org/moid/object_id.html#${Number(value)}`};
}
export function parseMoidSelection(input) {
  let text=input.trim();
  if(/^https?:/i.test(text)){
    const url=new URL(text);
    if(url.origin!=='https://chisel.weirdgloop.org'||url.pathname!=='/moid/object_id.html')throw new Error('Use a MOID object-ID page URL.');
    text=decodeURIComponent(url.hash.slice(1));
  }
  const ids=new Set();
  for(const part of text.split(/[\s,]+/).filter(Boolean)){
    const match=part.match(/^(\d{1,9})(?:-(\d{1,9}))?$/);
    if(!match)throw new Error('Enter object IDs, a range such as 58439-58442, or a MOID URL.');
    const from=Number(match[1]),to=Number(match[2]??match[1]);
    if(to<from||to-from>=32)throw new Error('Choose up to 32 object images at a time.');
    for(let id=from;id<=to;id++){ids.add(String(id));if(ids.size>32)throw new Error('Choose up to 32 object images at a time.');}
  }
  if(!ids.size)throw new Error('Enter an object ID or MOID URL.');
  return [...ids];
}
