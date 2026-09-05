import { regionId } from './coordinates.mjs';
export const WIKI = 'https://oldschool.runescape.wiki';
export function wikiTitle(input) {
  if (/^https?:/i.test(input)) {
    const url = new URL(input);
    if (url.origin !== WIKI || !url.pathname.startsWith('/w/')) throw new Error('Use an Old School RuneScape Wiki article URL.');
    return decodeURIComponent(url.pathname.slice(3)).replaceAll('_', ' ');
  }
  const title = input.trim().replaceAll('_', ' ');
  if (!title || title.length > 250 || /[\x00-\x1f]/.test(title)) throw new Error('Enter a wiki title or URL.');
  return title;
}
export function wikiUrl(title) { return `${WIKI}/w/${encodeURIComponent(title.replaceAll(' ', '_'))}`; }
export async function api(params) {
  const url = new URL('/api.php', WIKI);
  url.search = new URLSearchParams({ format: 'json', origin: '*', ...params }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Wiki request failed (${response.status}). Try pasted wikitext or the saved snapshot.`);
  const data = await response.json(); if (data.error) throw new Error(data.error.info); return data;
}
export async function fetchPage(title) {
  const data = await api({ action:'query', prop:'revisions', rvprop:'ids|content', rvslots:'main', redirects:'1', titles: wikiTitle(title), formatversion:'2' });
  const page = data.query.pages[0];
  if (page.missing || !page.revisions?.[0]) throw new Error(`Wiki page not found: ${title}`);
  return { title: page.title, revision: page.revisions[0].revid, text: page.revisions[0].slots.main.content };
}
const normalized = name => String(name).replace(/^Template:/i,'').replaceAll('_',' ').trim().toLowerCase();
// getAllArgs is shared by Node and the browser LSP bundle; getValue is Node-only.
const templateValues = token => Object.fromEntries(token.getAllArgs().map(arg=>[arg.name,String(arg.lastChild)]));
// Parser handles syntax; this adapter only interprets the OSRS Map template.
export function extractWiki(Parser, page) {
  if (page.text.length > 1_000_000) throw new Error('Wiki text exceeds the 1 MB import limit.');
  const root = Parser.parse(page.text), maps = [], warnings = [];
  for (const token of root.querySelectorAll('template')) {
    if (normalized(token.name) !== 'map') continue;
    const args = templateValues(token), coords = [];
    if (token.getDuplicatedArgs().length) { warnings.push('A Map template has duplicate parameters; review its source.'); continue; }
    if (args.x !== undefined && args.y !== undefined) coords.push([args.x.trim(), args.y.trim()]);
    for (const [key, value] of Object.entries(args)) if (/^\d+$/.test(key)) {
      const match = String(value).trim().match(/^(\d+)\s*,\s*(\d+)$/); if (match) coords.push([match[1],match[2]]);
    }
    if (!coords.length) warnings.push('A Map template has no literal coordinates. Template expansion or manual review is needed.');
    for (const [sx,sy] of coords) {
      if (!/^\d+$/.test(sx) || !/^\d+$/.test(sy) || +sx > 16383 || +sy > 16383) { warnings.push('Unresolved or invalid map coordinates.'); continue; }
      const planeText = args.plane?.trim();
      const plane = planeText !== undefined && /^[0-3]$/.test(planeText) ? +planeText : null;
      const caption = args.caption || '';
      maps.push({ x:+sx, y:+sy, region:regionId(+sx,+sy), plane, mapId:args.mapID ?? args.mapid ?? null,
        mtype:args.mtype??null,icon:args.icon??(args.mtype==='pin'?'greenPin':null),zoom:args.zoom===undefined?null:Number(args.zoom),
        role:/entrance|enter|outside/i.test(caption) ? 'entrance' : 'location', caption,
        source:wikiUrl(page.title), title:page.title, revision:page.revision, verified:false });
    }
  }
  const links = [...new Set(root.querySelectorAll('link').map(t => String(t.target ?? t.name ?? '').replaceAll('_',' ')).filter(t=>t && !t.includes(':') && !t.startsWith('#')))];
  return { title:page.title, revision:page.revision, maps, links, warnings };
}
export async function importWiki(Parser, title, knownLocations = []) {
  async function read(title){
    const page=await fetchPage(title),result=extractWiki(Parser,page);
    try{
      const {mergeRenderedMaps}=await import('./rendered-maps.mjs');
      const data=await api({action:'parse',oldid:String(page.revision),prop:'text|jsconfigvars'});
      result.maps=mergeRenderedMaps(result.maps,data.parse,{title:page.title,revision:page.revision,source:wikiUrl(page.title)});
    }catch(error){result.warnings.push(`Rendered map metadata unavailable: ${error.message}. Template coordinates remain unverified.`);}
    return result;
  }
  const result = await read(title);
  // Bounded follow-up: surface other links for the user instead of crawling the wiki.
  const locations = [...new Set([...knownLocations,...result.links.filter(t => /cave|lair|dungeon|chamber|island|conch/i.test(t))])].filter(t=>t!==result.title).slice(0,4);
  for (const linked of locations) {
    try { const next = await read(linked); result.maps.push(...next.maps); result.warnings.push(...next.warnings); }
    catch (error) { result.warnings.push(`Could not inspect ${linked}: ${error.message}`); }
  }
  result.maps = result.maps.filter((m,i,all)=>all.findIndex(n=>n.x===m.x && n.y===m.y && n.source===m.source)===i);
  return result;
}
export async function findEntranceCandidates(Parser, bossName) {
  const data=await api({action:'query',list:'search',srsearch:`${bossName} entrance`,srlimit:'5'}),candidates=[];
  for(const hit of data.query.search) {
    const page=await fetchPage(hit.title),root=Parser.parse(page.text);
    for(const token of root.querySelectorAll('template')) {
      const name=normalized(token.name);
      if(!['infobox scenery','infobox object','infobox npc'].includes(name))continue;
      const values=templateValues(token),ids=[];
      for(const [key,value] of Object.entries(values))if(/^id\d*$/.test(key))for(const id of String(value).split(/[,\s]+/))if(/^\d+$/.test(id))ids.push(id);
      if(ids.length)candidates.push({title:page.title,source:wikiUrl(page.title),revision:page.revision,ids:[...new Set(ids)],objectType:name==='infobox npc'?'NPC':'GAME_OBJECT'});
    }
  }
  return candidates;
}
