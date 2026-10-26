import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

let revision=process.argv[2];
if(!revision){
  const metadata=await fetch('https://repo.runelite.net/net/runelite/client/maven-metadata.xml',{signal:AbortSignal.timeout(30000)});
  if(!metadata.ok)throw new Error(`RuneLite release metadata request failed (${metadata.status}).`);
  const release=(await metadata.text()).match(/<release>([0-9]+(?:\.[0-9]+){1,3})<\/release>/)?.[1];
  if(!release)throw new Error('No stable RuneLite release was found. Existing definitions were preserved.');
  const response=await fetch(`https://api.github.com/repos/runelite/runelite/commits/runelite-parent-${release}`,{signal:AbortSignal.timeout(30000),headers:process.env.GH_TOKEN?{Authorization:`Bearer ${process.env.GH_TOKEN}`}:{}});
  if(!response.ok)throw new Error(`RuneLite commit request failed (${response.status}).`);
  revision=(await response.json()).sha;
  console.log(`Using published RuneLite release ${release}.`);
}
if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('Provide a full RuneLite commit SHA.');
await mkdir('work',{recursive:true});
const staging=await mkdtemp(resolve('work/definitions-'));
for(const script of ['refresh-item-ids.mjs','refresh-gameval.mjs'])execFileSync(process.execPath,[`scripts/${script}`,revision],{stdio:'inherit',env:{...process.env,DEFINITIONS_OUTPUT_DIR:staging}});
const items=await import(pathToFileURL(join(staging,'item-ids.mjs')).href),gameval=await import(pathToFileURL(join(staging,'gameval-ids.mjs')).href),labels=await import(pathToFileURL(join(staging,'item-labels.mjs')).href);
if(items.ITEM_REVISION!==revision||gameval.GAMEVAL_REVISION!==revision||!gameval.OBJECT_NAMES[32534]||!items.ITEM_NAMES[27352]||!labels.ITEM_LABELS[27352])throw new Error('Incomplete or mismatched RuneLite definitions. Existing tables were preserved.');
// Publish only after every staged source has downloaded and parsed successfully.
const files=['item-ids.mjs','item-labels.mjs','gameval-ids.mjs'],contents=await Promise.all(files.map(file=>readFile(join(staging,file))));
for(let i=0;i<files.length;i++)await writeFile(join('src/core',files[i]),contents[i]);
console.log(`Refreshed item, object and NPC definitions together at ${revision}.`);
