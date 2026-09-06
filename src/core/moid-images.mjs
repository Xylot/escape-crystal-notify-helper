export function moidImage(id) {
  const value=String(id);
  if(!/^\d{1,9}$/.test(value))throw new Error('Enter a numeric object ID.');
  return {id:String(Number(value)),url:`https://chisel.weirdgloop.org/static/img/osrs-object/${Number(value)}_orient0.png`,source:`https://chisel.weirdgloop.org/moid/object_id.html#${Number(value)}`};
}

// Walk both directions: selecting a child also includes its parent and siblings.
export function modelFamily(types, ids) {
  const found = new Set(ids.map(id => moidImage(id).id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [parent, definition] of Object.entries(types)) {
      const family = [parent, ...(definition.forms ?? []).filter(f => Number.isInteger(f.locId) && f.locId >= 0).map(f => String(f.locId))];
      if (!family.some(id => found.has(id))) continue;
      for (const id of family) if (!found.has(id)) {
        found.add(id); changed = true;
        if (found.size > 128) throw new Error('This selection has more than 128 related models. Split it into smaller contributions.');
      }
    }
  }
  return [...found];
}

// A missing parent's thumbnail can be represented by its descendants only.
export function modelVariants(types, id) {
  const parent=moidImage(id).id, found=new Set([parent]), pending=[parent];
  while(pending.length) {
    for(const form of types[pending.pop()]?.forms??[]) {
      if(!Number.isInteger(form.locId)||form.locId<0)continue;
      const next=moidImage(form.locId).id;
      if(found.has(next))continue;
      found.add(next);pending.push(next);
      if(found.size>129)throw new Error('This object has more than 128 related variants.');
    }
  }
  return [...found].filter(value=>value!==parent);
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
