import Parser from 'wikiparser-node';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseJava } from '../src/core/java.mjs';
import { importWiki } from '../src/core/wiki.mjs';
import { fetchBossCatalog, reconcileCatalog } from '../src/core/catalog.mjs';
import { PLUGIN_REPO, JAVA_PATH } from '../src/core/proposal.mjs';
const headers = { 'User-Agent':'EscapeCrystalContentEditor/0.1', ...(process.env.GH_TOKEN ? { Authorization:`Bearer ${process.env.GH_TOKEN}` } : {}) };
async function get(url) { const r = await fetch(url,{headers,signal:AbortSignal.timeout(30000)}); if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; }
const old = JSON.parse(await readFile('public/data/snapshot.json','utf8'));
const commit = await (await get(`https://api.github.com/repos/${PLUGIN_REPO}/commits/master`)).json();
const source = await (await get(`https://raw.githubusercontent.com/${PLUGIN_REPO}/${commit.sha}/${JAVA_PATH}`)).text();
const parsed = parseJava(source), warnings = [];
const aliases = JSON.parse(await readFile('config/aliases.json','utf8'));
const entries = parsed.entries.map(e=>({...e,maps:[],warnings:[],links:[],wikiTitle:aliases[e.id]??e.name}));
const catalog = await fetchBossCatalog(Parser);
// Retain every discovered boss, even when no location is available.
const candidates = reconcileCatalog(catalog.bosses,entries).map(b=>{
  const prior=old.candidates.find(c=>c.wikiTitle===b.wikiTitle);
  return {...b,maps:prior?.maps??[],links:prior?.links??[],warnings:prior?.warnings??[],locationsLoaded:prior?.locationsLoaded??false};
});
// Keep discovery quick. Enrich other entries on demand, or explicitly via --enrich.
for(const boss of candidates.filter(b=>b.wikiTitle==='Shellbane gryphon'||process.argv.includes('--enrich')&&!b.supportedBy.length)){
  try{const data=await importWiki(Parser,boss.wikiTitle,boss.locationTitles);Object.assign(boss,{maps:data.maps,links:data.links,warnings:data.warnings,locationsLoaded:true});}
  catch(error){boss.warnings.push(`Location refresh failed: ${error.message}`);}
}
const now=new Date().toISOString();
const snapshot = { version:1,generatedAt:now,baseCommit:commit.sha,source,entries,candidates,warnings,catalog:{source:catalog.source,revision:catalog.revision,count:candidates.length,fetchedAt:now} };
await mkdir('public/data',{recursive:true});
await writeFile('public/data/snapshot.json',JSON.stringify(snapshot,null,2)+'\n');
console.log(`Boss page revision ${catalog.revision}: ${candidates.length} bosses; ${candidates.filter(b=>!b.supportedBy.length).length} unsupported. Plugin ${commit.sha}.`);
