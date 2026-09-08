import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './pr-runtime.mjs';
import { digest } from '../worker/security.mjs';
import { input, png, snapshot } from './pr-fixtures.mjs';
import {existingDraft} from '../src/core/editing.mjs';
import {encounterLocations} from '../src/core/encounter.mjs';
import { panelSize } from '../src/core/pr-evidence.mjs';

test('real Worker runtime and D1: OAuth, encrypted sessions, preparation, evidence, PR and logout',async()=>{
  const entry=snapshot.entries.find(e=>e.name==='King Black Dragon Entrance'),locations=encounterLocations({...entry,maps:[]});
  const comparisonInput={changes:[...input.changes,{...existingDraft(entry),name:'Updated KBD entrance'}],contexts:{...input.contexts,[entry.id]:{arena:locations.arena[0],entrance:locations.entrance[0]}},sources:{...input.sources,[entry.id]:['https://oldschool.runescape.wiki/w/King_Black_Dragon']}};
  const {mf,db,calls,refs,setPRState}=await runtime();
  try{
    const origin='http://editor.test',verifier='local-client-verifier',challenge=await digest(verifier);
    const start=await mf.dispatchFetch(`http://api.test/auth/start?${new URLSearchParams({returnTo:origin+'/',challenge})}`,{redirect:'manual'});
    assert.equal(start.status,302);const githubURL=new URL(start.headers.get('location'));assert.equal(githubURL.searchParams.get('code_challenge_method'),'S256');
    const state=githubURL.searchParams.get('state');
    const callback=await mf.dispatchFetch(`http://api.test/auth/callback?state=${state}&code=fixture-code`);assert.equal(callback.status,200,await callback.clone().text());
    const html=await callback.text(),ticket=html.match(/"ticket":"([A-Za-z0-9_-]+)"/)[1];assert.ok(!html.includes('fixture-github-token'));
    const exchange=await mf.dispatchFetch('http://api.test/auth/exchange',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({ticket,verifier})});assert.equal(exchange.status,200);
    const session=(await exchange.json()).session;
    const headers={Origin:origin,'Content-Type':'application/json',Authorization:`Bearer ${session}`};
    const rows=await db.prepare('SELECT data FROM sessions').all();assert.ok(!JSON.stringify(rows).includes('fixture-github-token'));
    assert.equal((await mf.dispatchFetch('http://api.test/auth/exchange',{method:'POST',headers,body:JSON.stringify({ticket,verifier})})).status,401);
    const pResponse=await mf.dispatchFetch('http://api.test/prepare',{method:'POST',headers,body:JSON.stringify(comparisonInput)});assert.equal(pResponse.status,200);const p=await pResponse.json();
    assert.deepEqual(p.states[entry.id].before.chunks,[785665,785666]);
    assert.equal(p.evidence.panels.filter(p=>p.state==='before').length,2);
    assert.match(p.body,/<summary>Before<\/summary>/);assert.match(p.body,/<summary>After<\/summary>/);
    assert.ok(!calls.some(c=>c.method==='POST'&&c.host==='api.github.com'));
    const tile=await mf.dispatchFetch('http://api.test/tiles',{method:'POST',headers,body:JSON.stringify({region:12682,context:input.contexts.BOSS_PR_TEST.arena})});assert.equal(tile.status,200,await tile.clone().text());
    const data={title:p.title,introduction:p.introduction,images:p.evidence.panels.map(panel=>({id:panel.id,png:png(panelSize(panel).width,panelSize(panel).height)}))};
    const submitted=await mf.dispatchFetch(`http://api.test/submissions/${p.id}/submit`,{method:'POST',headers,body:JSON.stringify(data)});const result=await submitted.json();assert.equal(submitted.status,200,JSON.stringify(result));assert.equal(result.pr.number,123);
    assert.equal(refs.size,2);assert.ok(!refs.has('master'));
    const retry=await mf.dispatchFetch(`http://api.test/submissions/${p.id}/submit`,{method:'POST',headers,body:JSON.stringify(data)});assert.equal((await retry.json()).pr.number,123);assert.equal(calls.filter(c=>c.path.endsWith('/pulls')&&c.method==='POST').length,1);
    setPRState('closed');
    const closed=await mf.dispatchFetch(`http://api.test/submissions/${p.id}`,{headers});assert.equal((await closed.json()).status,'closed');
    const replacement=await mf.dispatchFetch('http://api.test/prepare',{method:'POST',headers,body:JSON.stringify(comparisonInput)});assert.equal(replacement.status,200);
    const next=await replacement.json();assert.notEqual(next.id,p.id);assert.equal(next.pr,null);
    const repeated=await mf.dispatchFetch('http://api.test/prepare',{method:'POST',headers,body:JSON.stringify(comparisonInput)});assert.equal((await repeated.json()).id,next.id);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM submissions').first()).count,2);assert.equal(refs.size,2);
    setPRState('open');
    const reopened=await mf.dispatchFetch('http://api.test/prepare',{method:'POST',headers,body:JSON.stringify(comparisonInput)});assert.equal((await reopened.json()).pr.state,'open');
    assert.equal((await mf.dispatchFetch('http://api.test/session',{method:'DELETE',headers})).status,200);
    assert.equal((await mf.dispatchFetch('http://api.test/session',{headers})).status,401);
  }finally{await mf.dispose();}
});
