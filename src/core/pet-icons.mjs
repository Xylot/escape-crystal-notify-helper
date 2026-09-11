import {fetchPage,wikiTitle,wikiUrl} from './wiki.mjs';

const normalized=value=>String(value).replace(/^Template:/i,'').replaceAll('_',' ').trim().toLowerCase();
const titleKey=value=>wikiTitle(value).split('#')[0].normalize('NFKC').replaceAll('’',"'").toLowerCase();
const argsOf=token=>Object.fromEntries(token.getAllArgs().map(arg=>[arg.name.trim().toLowerCase(),String(arg.lastChild).trim()]));
const pageTitle=value=>{
  const title=String(value??'').split('#')[0].trim();
  return title&&!/[{}\[\]<>|:]/.test(title)?wikiTitle(title):null;
};

// The plinkt template expands to two rendered cells. Read the source cells,
// rather than applying the rendered colspan to an unexpanded parser table.
export function bossPetCatalog(Parser,page) {
  if(page.text.length>1_000_000)throw new Error('Pet catalog is too large.');
  const root=Parser.parse(page.text),pets=[];
  let section='',found=false;
  for(const node of root.childNodes) {
    if(node.type==='heading'){section=String(node).replace(/^=+|=+$/g,'').trim().toLowerCase();continue;}
    if(section!=='boss pets'||node.type!=='table')continue;
    const rows=node.getAllRows().map(row=>{
      const cells=[];
      for(const cell of row.childNodes.slice(2)){
        if(cell.type==='tr'||cell.type==='table-syntax')break;
        if(cell.type==='td'&&cell.subtype!=='caption')cells.push(cell);
      }
      return cells;
    });
    const header=rows.findIndex(row=>row[0]?.lastChild.text().trim()==='Pet'&&row[1]?.lastChild.text().trim()==='Source');
    if(header<0)continue;
    found=true;
    for(const row of rows.slice(header+1)) {
      if(row.length<2||row[0].subtype==='th')continue;
      const templates=row[0].querySelectorAll('template').filter(token=>normalized(token.name)==='plinkt');
      const names=templates.map(token=>token.getDuplicatedArgs().length?null:pageTitle(argsOf(token)['1'])).filter(Boolean);
      // Only source-column links themselves count, never links in footnotes.
      const sources=row[1].lastChild.childNodes.filter(token=>token.type==='link').map(token=>pageTitle(token.name)).filter(Boolean);
      for(const name of new Set(names))pets.push({name,sources});
    }
  }
  if(!found||!pets.length)throw new Error('The wiki boss-pet table could not be read. Enter an item ID manually.');
  return pets;
}

export function petItemIds(Parser,page,requested=page.title) {
  if(page.text.length>1_000_000)throw new Error('Pet page is too large.');
  const found=[];
  for(const token of Parser.parse(page.text).querySelectorAll('template')) {
    // Follower/NPC IDs are deliberately excluded, including Multi Infobox pages.
    if(normalized(token.name)!=='infobox item'||token.getDuplicatedArgs().length)continue;
    const args=argsOf(token),idKeys=Object.keys(args).filter(key=>/^id\d*$/.test(key));
    const valid=value=>/^[1-9]\d*$/.test(value??'')&&Number(value)<=2147483647;
    if(idKeys.length===1&&valid(args[idKeys[0]])){found.push(args[idKeys[0]]);continue;}
    const names=new Set([titleKey(requested),titleKey(page.title)]);
    let matched=idKeys.filter(key=>{
      const suffix=key.slice(2),name=pageTitle(args['name'+suffix]??args.name??args['version'+suffix]);
      return name&&names.has(titleKey(name));
    });
    if(args.defver&&/^\d+$/.test(args.defver)&&matched.includes('id'+args.defver))matched=['id'+args.defver];
    if(matched.some(key=>!valid(args[key])))return [];
    found.push(...matched.map(key=>args[key]));
  }
  return [...new Set(found)];
}

export function createPetResolver({read=fetchPage,now=Date.now,ttl=3600000}={}) {
  const cache=new Map();
  const page=title=>{
    const key=titleKey(title),saved=cache.get(key);
    if(saved&&now()-saved.at<ttl)return saved.promise;
    const entry={at:now(),promise:Promise.resolve().then(()=>read(title))};
    cache.set(key,entry);
    entry.promise.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});
    return entry.promise;
  };
  return async (Parser,title)=>{
    const catalogPage=await page('Pet'),catalog=bossPetCatalog(Parser,catalogPage);
    const matches=[...new Set(catalog.filter(pet=>pet.sources.some(source=>titleKey(source)===titleKey(title))).map(pet=>pet.name))];
    if(matches.length!==1)return {status:matches.length?'ambiguous':'not-found',pets:matches};
    const petPage=await page(matches[0]),ids=petItemIds(Parser,petPage,matches[0]);
    if(ids.length!==1)return {status:ids.length?'ambiguous':'not-found',pets:matches};
    return {status:'found',name:petPage.title,itemId:ids[0],source:wikiUrl(petPage.title),revision:petPage.revision,catalogRevision:catalogPage.revision};
  };
}
export const resolvePetIcon=createPetResolver();

// A delayed lookup must never replace a value typed while the request ran.
export const canApplyPetLookup=(startedRevision,currentRevision,currentValue,replace=false)=>startedRevision===currentRevision&&(replace||!currentValue);
