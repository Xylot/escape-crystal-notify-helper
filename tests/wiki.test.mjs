import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import { extractWiki } from '../src/core/wiki.mjs';
test('WikiParser handles nested, multiline and standalone maps',()=>{
 const result=extractWiki(Parser,{title:'Shellbane Gryphon Cave',revision:42,text:`{{Infobox Location
 |name=Shellbane Gryphon Cave
 |map={{Map|x=3179|y=8876|mapID=-1|zoom=3}}
 }}
 {{Map|x=3176|y=2477|caption=The entrance to the cave.}}
 [[Shellbane gryphon|Boss]]`});
 assert.equal(result.maps.length,2);assert.equal(result.maps[0].region,12682);assert.equal(result.maps[0].mapId,'-1');assert.equal(result.maps[0].plane,null);assert.equal(result.maps[1].role,'entrance');
});
test('comments, nested caption markup and positional coordinate pairs',()=>{
 const result=extractWiki(Parser,{title:'Test',revision:1,text:'<!-- {{Map|x=1|y=2}} --> {{Map|3179,8876|3176,2477|caption=[[Cave|An entrance]]}}'});
 assert.equal(result.maps.length,2);assert.equal(result.maps[0].role,'entrance');
});
test('duplicate parameters and expression coordinates remain unresolved',()=>{
 const result=extractWiki(Parser,{title:'Test',revision:1,text:'{{Map|x=1|x=2|y=3}} {{Map|x={{#expr:1+2}}|y=4}}'});
 assert.equal(result.maps.length,0);assert.equal(result.warnings.length,2);
});
