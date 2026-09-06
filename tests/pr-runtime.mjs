import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { snapshot, png } from './pr-fixtures.mjs';
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wranglerRequire('miniflare');
const {build}=wranglerRequire('esbuild');

// All outbound traffic is replaced by a local fixture. Never contacts GitHub.
export async function runtime({port=0,origin='http://editor.test',interactive=false}={}){
  const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  const calls=[],refs=new Map();let seq=0,pr=null;
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const mf=new Miniflare(convertV4MiniflareOptions({port,host:'127.0.0.1',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-05',d1Databases:{DB:'local-pr-test'},bindings:{PR_ENABLED:'true',DEPLOYMENT_MODE:'test',TEST_TARGET_REPO:'test/plugin',BASE_BRANCH:'master',ALLOWED_ORIGINS:origin,GITHUB_CLIENT_ID:'fixture-client',GITHUB_CLIENT_SECRET:'fixture-secret',TOKEN_ENCRYPTION_KEY:'local-fixture-encryption-key-not-for-production'},outboundService:async request=>{
    const url=new URL(request.url);calls.push({host:url.host,path:url.pathname,method:request.method});
    if(url.host==='github.com'&&url.pathname==='/login/oauth/access_token')return response({access_token:'fixture-github-token',scope:'public_repo'});
    if(url.host==='raw.githubusercontent.com'||url.host==='maps.runescape.wiki')return new Response(Buffer.from(png(256,256),'base64'),{headers:{'Content-Type':'image/png'}});
    if(url.host!=='api.github.com')throw Error('Unexpected outbound request');
    const path=url.pathname,method=request.method;
    if(path==='/user')return response({id:42,login:'local-contributor'});
    if(path==='/repos/test/plugin/commits/master')return response({sha:snapshot.baseCommit,commit:{tree:{sha:'base-tree'}}});
    if(path.includes('/contents/'))return response({encoding:'base64',content:Buffer.from(snapshot.source).toString('base64')});
    if(path==='/repos/test/plugin')return response({id:1,name:'plugin',owner:{login:'test'}});
    if(path==='/repos/local-contributor/plugin')return response({id:2,name:'plugin',full_name:'local-contributor/plugin',fork:true,parent:{id:1},private:false});
    if(path==='/repos/test/plugin/pulls/123')return response(pr);
    if(path.endsWith('/pulls')){if(method==='GET')return response(pr?[pr]:[]);const body=await request.json();pr={...body,number:123,html_url:'https://github.com/test/plugin/pull/123',state:'open',merged_at:null};return response(pr,201);}
    if(path.includes('/git/ref/heads/')){const branch=path.split('/git/ref/heads/')[1];return refs.has(branch)?response({object:{sha:refs.get(branch)}}):response({},404);}
    if(path.endsWith('/git/refs')){const b=await request.json();refs.set(b.ref.replace('refs/heads/',''),b.sha);return response(b,201);}
    if(path.includes('/git/commits/')&&method==='GET')return response({sha:snapshot.baseCommit});
    if(['/git/blobs','/git/trees','/git/commits'].some(end=>path.endsWith(end)))return response({sha:(++seq).toString(16).padStart(40,'0')},201);
    throw Error(`Unmocked GitHub path: ${path}`);
  }}));
  await mf.ready;const db=await mf.getD1Database('DB');
  for(const sql of readFileSync('worker/migrations/0001_initial.sql','utf8').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  if(interactive){
    // Browser verification fixture only. A synthetic session is inserted into the
    // local emulator, never in a production deployment or the shipped Worker.
    const {digest,encrypt}=await import('../worker/security.mjs');const token='T'.repeat(43);
    await db.prepare('INSERT INTO sessions (id,data,expires) VALUES (?,?,?)').bind(await digest(token),JSON.stringify({origin,encrypted:await encrypt({token:'fixture-github-token',login:'local-contributor',userId:'42'},'local-fixture-encryption-key-not-for-production')}),Date.now()+3600000).run();
  }
  return {mf,db,calls,refs,setPRState:(state,merged_at=null)=>{pr={...pr,state,merged_at};}};
}
