import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'wikiparser-node';
import {outlineCoverage} from '../src/core/map-outline.mjs';
import {chunkId} from '../src/core/coordinates.mjs';
import {extractWiki} from '../src/core/wiki.mjs';
import {cowFieldMap} from './fixtures/cow-field.mjs';

test('cow field vertices become one outline; selection covers edges and interior across regions',()=>{
  const result=extractWiki(Parser,{title:'Lumbridge cow field',revision:15156602,text:cowFieldMap});
  assert.equal(result.maps.length,1);assert.equal(result.warnings.length,0);
  const location=result.maps[0];assert.equal(location.mtype,'polygon');assert.equal(location.outline[0].length,27);
  assert.equal(location.revision,15156602);
  const {chunks,regions}=outlineCoverage(location.outline);
  assert.deepEqual(regions,[12850,12851,13106,13107]);
  assert.ok(chunks.includes(chunkId(3260,3260))); // Interior, not a vertex.
  assert.ok(chunks.includes(chunkId(3266,3280))); // Halfway along the long east edge.
  assert.ok(!chunks.includes(chunkId(3240,3260))); // Outside the concave western edge.
  assert.equal(chunks.length,25);
  for(const id of [827802,827803,827804])assert.ok(!chunks.includes(id)); // West of the field wall.
  assert.equal(chunks.length,new Set(chunks).size);
});

test('fills fully enclosed chunks and handles reversed and already closed rings',()=>{
  const ring=[[1,1],[31,1],[31,31],[1,31]];
  const coverage=outlineCoverage([ring]);
  assert.equal(coverage.chunks.length,16);assert.ok(coverage.chunks.includes(chunkId(16,16)));
  assert.deepEqual(outlineCoverage([[...ring,ring[0]]]),coverage);
  assert.deepEqual(outlineCoverage([[...ring].reverse()]),coverage);
});

test('excludes exterior chunks sharing only a wall or corner, with world bounds clamped',()=>{
  const {chunks}=outlineCoverage([[[8,8],[16,8],[16,16],[8,16]]]);
  assert.deepEqual(chunks,[chunkId(8,8)]);
  assert.deepEqual(outlineCoverage([[[0,0],[7,0],[7,7],[0,7]]]).chunks,[0]);
});

test('keeps partial overlaps even when no vertex or chunk center lies in the overlap',()=>{
  const outline=[[[1,1],[31,1],[31,2],[1,2]]];
  assert.deepEqual(outlineCoverage(outline).chunks,[0,2048,4096,6144]);
  assert.deepEqual(outlineCoverage([outline[0].slice().reverse()]),outlineCoverage(outline));
});

test('diagonal corner touches and hole walls do not select exterior chunks',()=>{
  const triangle=outlineCoverage([[[0,0],[16,0],[0,16]]]);
  assert.deepEqual(triangle.chunks,[chunkId(0,0),chunkId(0,8),chunkId(8,0)]);
  const hole=outlineCoverage([[[0,0],[32,0],[32,32],[0,32]],[[8,8],[24,8],[24,24],[8,24]]]);
  assert.equal(hole.chunks.length,12);
  for(const x of [8,16])for(const y of [8,16])assert.ok(!hole.chunks.includes(chunkId(x,y)));
});

test('preserves holes and concavities instead of selecting a bounding rectangle',()=>{
  const hole=outlineCoverage([[[1,1],[63,1],[63,63],[1,63]],[[9,9],[55,9],[55,55],[9,55]]]);
  assert.ok(!hole.chunks.includes(chunkId(24,24)));assert.ok(hole.chunks.includes(chunkId(8,24)));
  const concave=outlineCoverage([[[1,1],[31,1],[31,9],[9,9],[9,31],[1,31]]]);
  assert.ok(!concave.chunks.includes(chunkId(24,24)));assert.ok(concave.chunks.includes(chunkId(0,24)));
});

test('rejects malformed, degenerate, out-of-world, and excessive outlines',()=>{
  for(const ring of [[],[[1,1],[2,2],[3,3]],[[1,1],[NaN,5],[5,1]],[[1,1],[16384,5],[5,1]]]) assert.throws(()=>outlineCoverage([ring]));
  assert.throws(()=>outlineCoverage([[[0,0],[16383,0],[16383,16383],[0,16383]]]),/too large/);
});

test('polygon viewport is not a vertex; unresolved vertices cannot produce partial coverage',()=>{
  const parse=text=>extractWiki(Parser,{title:'Test',revision:1,text});
  const valid=parse('{{Map|mtype=polygon|x=999|y=999|1,1|31,1|31,31|1,31}}');
  assert.equal(outlineCoverage(valid.maps[0].outline).chunks.length,16);
  const invalid=parse('{{Map|mtype=polygon|1,1|31,1|{{#expr:31}},31|1,31}}');
  assert.equal(invalid.maps.length,0);assert.equal(invalid.warnings.length,1);
  assert.equal(parse('{{Map|mtype=polyline|1,1|31,31}}').maps.length,0);
});
