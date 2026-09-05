import { enumName } from './java.mjs';
import { fetchPage, wikiUrl } from './wiki.mjs';

export const bossKey = title => title.split('#')[0].replaceAll('_',' ').normalize('NFKC').toLowerCase().replace(/^the\s+/,'').replace(/[^a-z0-9]/g,'');
const linkTitle = token => String(token.name ?? '').split('#')[0].replaceAll('_',' ').trim();
const linksIn = token => [...new Set(token.querySelectorAll('link').map(linkTitle).filter(t=>t&&!t.includes(':')))];

/** Read table structure and quest list nodes from WikiParser, never scrape all page links. */
export function extractBossCatalog(Parser, page) {
  const root=Parser.parse(page.text), found=new Map(), sections=[];
  let category='', list=[];
  const add=(title, locations=[], group=category)=>{
    const key=bossKey(title);if(!key)return;
    const prior=found.get(key);
    if(prior){prior.categories=[...new Set([...prior.categories,group])];prior.locationTitles=[...new Set([...prior.locationTitles,...locations])];return;}
    found.set(key,{id:enumName(title),name:title,wikiTitle:title,categories:[group],locationTitles:locations,
      catalogSource:wikiUrl('Boss'),catalogRevision:page.revision,regions:[],raw:null,deathType:'',optionalArgs:[],maps:[],links:[],warnings:[]});
  };
  const finishList=()=>{
    if(!list.length)return;
    const linkNodes=list.filter(n=>n.type==='link');
    if(category==='Quest bosses'&&linkNodes[0])add(linkTitle(linkNodes[0]));
    if(category==='Quests with multiple bosses'&&linkNodes.length>1){
      const firstQuest=linkTitle(linkNodes[0]);
      const colon=list.findIndex(n=>n.type==='text'&&String(n).includes(':'));
      const candidates=colon>=0?list.slice(colon+1):list.slice(list.indexOf(linkNodes[0])+1);
      for(const node of candidates)if(node.type==='link'&&bossKey(linkTitle(node))!==bossKey(firstQuest))add(linkTitle(node),[firstQuest],'Quest bosses');
    }
    list=[];
  };
  for(const node of root.childNodes){
    if(node.type==='heading'){
      finishList();category=String(node).replace(/^=+|=+$/g,'').trim();sections.push(category);continue;
    }
    if(node.type==='list'){finishList();if(category==='Quest bosses'||category==='Quests with multiple bosses')list=[node];continue;}
    if(list.length)list.push(node);
    if(node.type!=='table'||['Boss slayer','Nightmare Zone','See also'].includes(category))continue;
    const layout=node.getLayout();
    // Browser bundles expose layout and row ASTs, but omit getNthCell/innerText.
    const rows=node.getAllRows().map(row=>{
      const cells=[];let include=false;
      for(const cell of row.childNodes.slice(2)){
        if(cell.type==='tr'||cell.type==='table-syntax')break;
        if(cell.type!=='td')continue;
        if(cell.isIndependent())include=cell.subtype!=='caption';
        if(include)cells.push(cell);
      }
      return cells;
    });
    const cellAt=(x,y)=>{const pos=layout[y]?.[x];return pos?rows[pos.row]?.[pos.column]:undefined;};
    let header=-1,bossCol=-1,locationCol=-1;
    for(let y=0;y<Math.min(layout.length,3);y++){
      for(let x=0;x<layout[y].length;x++){
        const cell=cellAt(x,y);if(!cell||cell.subtype!=='th')continue;
        const title=cell.lastChild.text().trim().toLowerCase();
        if(title==='boss'&&bossCol<0){bossCol=x;header=y;}
        if(['location','minigame'].includes(title))locationCol=x;
      }
      if(header>=0)break;
    }
    if(header<0)continue;
    for(let y=header+1;y<layout.length;y++){
      const cell=cellAt(bossCol,y);if(!cell||cell.subtype==='th')continue;
      const loc=locationCol>=0?cellAt(locationCol,y):null;
      const locations=loc?linksIn(loc):[];
      // Raid tables have no location column; their enclosing heading supplies it.
      if(['Chambers of Xeric','Theatre of Blood','Tombs of Amascut'].includes(category))locations.push(category);
      for(const title of linksIn(cell))add(title,locations);
    }
  }
  finishList();
  if(!found.size)throw new Error('No boss table/list entries were recognized on the Boss page. The previous catalog is unchanged.');
  return {source:wikiUrl('Boss'),revision:page.revision,sections,bosses:[...found.values()].sort((a,b)=>a.name.localeCompare(b.name))};
}
export async function fetchBossCatalog(Parser){return extractBossCatalog(Parser,await fetchPage('Boss'));}

// Explicit encounter membership avoids fuzzy matching unrelated bosses sharing a dungeon.
export const SUPPORT_GROUPS={
  BOSS_BARROWS:['Ahrim the Blighted','Karil the Tainted','Dharok the Wretched','Guthan the Infested','Torag the Corrupted','Verac the Defiled','Barrows brothers'],
  BOSS_DKS:['Dagannoth Supreme','Dagannoth Rex','Dagannoth Prime'],
  BOSS_PERILOUS_MOONS:['Blood Moon','Blue Moon','Eclipse Moon','Moons of Peril'],
  BOSS_GROTESQUE_GUARDIANS:['Dusk','Dawn'],
  BOSS_ROYAL_TITANS:['Branda the Fire Queen','Eldric the Ice King'],
  BOSS_GAUNTLET:['Crystalline Hunllef'],BOSS_CORRUPTED_GAUNTLET:['Corrupted Hunllef'],
  BOSS_TZHAAR_FIGHT_CAVES:['TzTok-Jad','TzHaar Fight Cave','TzHaar Fight Caves'],
  BOSS_INFERNO:['TzKal-Zuk','JalTok-Jad'],BOSS_FORTIS_COLOSSEUM:['Sol Heredit'],
  BOSS_NIGHTMARE:['The Nightmare'],
  RAIDS_CHAMBERS_OF_XERIC:['Tekton','Vasa Nistirio','Vespula','Great Olm','Mutadiles','Muttadile','Vanguard','Guardians'],
  RAIDS_THEATRE_OF_BLOOD:['The Maiden of Sugadinti','Pestilent Bloat','Nylocas Vasilias','Sotetseg','Xarpus','Verzik Vitur'],
  RAIDS_TOMBS_OF_AMASCUT:['Akkha','Ba-Ba','Kephri','Zebak','Tumeken’s Warden',"Tumeken's Warden",'Elidinis’ Warden',"Elidinis' Warden",'The Wardens'],
  MG_BARBARIAN_ASSAULT:['Penance Queen']
};
export function supportFor(boss,entries){
  const key=bossKey(boss.wikiTitle??boss.name);
  return entries.filter(e=>!e.id.endsWith('_ENTRANCE')&&(bossKey(e.wikiTitle??e.name)===key||bossKey(e.name)===key||(SUPPORT_GROUPS[e.id]??[]).some(name=>bossKey(name)===key)));
}
export function reconcileCatalog(catalog,entries){return catalog.map(b=>({...b,supportedBy:supportFor(b,entries).map(e=>({id:e.id,name:e.name})),supportKnown:entries.length>0}));}
