import test from 'node:test';
import assert from 'node:assert/strict';
import {fullPatch} from '../src/core/proposal.mjs';
import {reviewDiff} from '../src/core/review-diff.mjs';
test('review removes unchanged file content and retains changed line numbers across files',()=>{
  const result=reviewDiff(fullPatch('same\nold\ntail\n','same\nnew\ntail\n','a.java')+fullPatch('x\n','x\ny\n','b.java'));
  assert.deepEqual(result,[{path:'a.java',changes:[{kind:'removed',line:2,text:'old'},{kind:'added',line:2,text:'new'}]},{path:'b.java',changes:[{kind:'added',line:2,text:'y'}]}]);
  assert.deepEqual(reviewDiff(fullPatch('same\n','same\n')),[]);
});
