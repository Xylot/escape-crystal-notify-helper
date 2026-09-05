import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { findEntranceCandidates, extractWiki } from '../src/core/wiki.mjs';
import { extractBossCatalog } from '../src/core/catalog.mjs';
import '../scripts/vendor-parser.mjs';

const context=vm.createContext({console,URL,setTimeout,clearTimeout});
vm.runInContext(await readFile(new URL('../public/vendor/wikiparser.js',import.meta.url),'utf8'),context);
const Parser=context.Parser;

test('shipped browser bundle supports map and catalog AST queries',()=>{
  const maps=extractWiki(Parser,{title:'Test',revision:1,text:'{{Map|x=3176|y=2477|caption=Entrance}}'});
  assert.equal(maps.maps[0].region,12582);
  const catalog=extractBossCatalog(Parser,{title:'Boss',revision:1,text:'== Slayer bosses ==\n{| class="wikitable"\n! Boss !! Location\n|-\n| [[Shellbane gryphon]] || [[Shellbane Gryphon Cave]]\n|}'});
  assert.ok(JSON.stringify(catalog).includes('Shellbane gryphon'));
});

test('entrance search runs against the shipped browser bundle',async t=>{
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);
    return {ok:true,json:async()=>url.searchParams.get('list')==='search'
      ? {query:{search:[{title:'Cave entrance'},{title:'Entrance guardian'}]}}
      : {query:{pages:[{title:url.searchParams.get('titles'),revisions:[{revid:42,slots:{main:{content:url.searchParams.get('titles')==='Cave entrance'
        ? '{{Infobox Scenery|id=123, 456|id2=123|name=Cave entrance}}'
        : '{{Infobox NPC|id=789|name=Entrance guardian}}'}}}]}]}}};
  });
  const results=await findEntranceCandidates(Parser,'Shellbane gryphon');
  assert.equal(results.length,2);
  assert.deepEqual(results[0].ids,['123','456']);
  assert.equal(results[0].objectType,'GAME_OBJECT');
  assert.equal(results[1].objectType,'NPC');
  assert.equal(results[1].revision,42);
});
