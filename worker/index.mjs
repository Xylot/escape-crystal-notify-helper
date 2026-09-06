import { Store } from './store.mjs';
import { GitHub } from './github.mjs';
import { target, prepare, submit, publicRecord } from './pr-service.mjs';
import { HttpError, digest, random, encrypt, decrypt, readJSON } from './security.mjs';
import { regionTileUrl, wikiRegionTileUrl } from '../src/core/coordinates.mjs';
import { mapContext } from '../src/core/pr-evidence.mjs';

const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const origins = env => (env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
function returnURL(value,env){const url=new URL(value);if(!origins(env).includes(url.origin)||url.username||url.password)throw new HttpError(403,'This editor origin is not allowed.');url.hash='';return url;}
const scriptJSON = value => JSON.stringify(value).replaceAll('<','\\u003c');

export async function handle(request,env){
  const url=new URL(request.url),store=new Store(env.DB),origin=request.headers.get('Origin');
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  if(url.pathname==='/config'&&request.method==='GET')return json({enabled:env.PR_ENABLED==='true'&&!!env.GITHUB_CLIENT_ID&&!!env.GITHUB_CLIENT_SECRET&&!!env.TOKEN_ENCRYPTION_KEY,...target(env)});
  if(env.PR_ENABLED!=='true')throw new HttpError(503,'PR creation is not enabled on this backend yet.');
  if(url.pathname==='/auth/start'&&request.method==='GET'){
    const destination=returnURL(url.searchParams.get('returnTo'),env),challenge=url.searchParams.get('challenge');
    if(!/^[A-Za-z0-9_-]{43}$/.test(challenge??''))throw new HttpError(400,'Invalid sign-in challenge.');
    const bucket=`auth:${await digest(request.headers.get('CF-Connecting-IP')||'local')}:${Math.floor(Date.now()/3600000)}`;
    if(!await store.rate(bucket,30))throw new HttpError(429,'Too many sign-in attempts. Try again later.');
    const state=random(),verifier=random();
    await store.flow(state,{destination:destination.href,challenge,verifier},Date.now()+600000);
    const auth=new URL('https://github.com/login/oauth/authorize');auth.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:`${url.origin}/auth/callback`,scope:'public_repo',state,code_challenge:await digest(verifier),code_challenge_method:'S256'}).toString();
    return Response.redirect(auth.href,302);
  }
  if(url.pathname==='/auth/callback'&&request.method==='GET'){
    const flow=await store.consumeFlow(url.searchParams.get('state'));if(!flow)throw new HttpError(400,'Sign-in expired. Return to the editor and try again.');
    if(url.searchParams.has('error'))throw new HttpError(401,'GitHub sign-in was cancelled. Return to the editor to retry.');
    const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:`${url.origin}/auth/callback`,code_verifier:flow.verifier}),signal:AbortSignal.timeout(25000)});
    const data=await response.json();if(!response.ok||!data.access_token)throw new HttpError(401,'GitHub authorization failed. Try signing in again.');
    if(!String(data.scope).split(/[ ,]/).some(s=>s==='public_repo'||s==='repo'))throw new HttpError(403,'Public repository access is required to create the PR.');
    const user=await new GitHub(data.access_token).request('/user');
    const ticket=random();await store.flow(ticket,{challenge:flow.challenge,origin:new URL(flow.destination).origin,encrypted:await encrypt({token:data.access_token,login:user.login,userId:String(user.id)},env.TOKEN_ENCRYPTION_KEY)},Date.now()+60000);
    const destination=new URL(flow.destination);destination.hash=`pr-auth=${ticket}`;
    const html=`<!doctype html><meta charset="utf-8"><title>GitHub connected</title><p>GitHub connected. Returning to the editor…</p><script>const message=${scriptJSON({type:'escape-crystal-auth',ticket})};if(window.opener){window.opener.postMessage(message,${scriptJSON(destination.origin)});window.close();}else{window.location.replace(${scriptJSON(destination.href)});}</script>`;
    return new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if(!origin||!origins(env).includes(origin))throw new HttpError(403,'This editor origin is not allowed.');
  if(url.pathname==='/auth/exchange'&&request.method==='POST'){
    const data=await readJSON(request,4000),flow=await store.consumeFlow(data.ticket);
    if(!flow||flow.origin!==origin||typeof data.verifier!=='string'||flow.challenge!==await digest(data.verifier))throw new HttpError(401,'Sign-in could not be verified. Please try again.');
    const token=random();await store.put('sessions',await digest(token),{encrypted:flow.encrypted,origin},Date.now()+8*3600000);
    const user=await decrypt(flow.encrypted,env.TOKEN_ENCRYPTION_KEY);return json({session:token,login:user.login});
  }
  const bearer=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const session=bearer?await store.session(await digest(bearer)):null;
  if(!session||session.origin!==origin)throw new HttpError(401,'Sign in with GitHub to continue.');
  const user=await decrypt(session.encrypted,env.TOKEN_ENCRYPTION_KEY),gh=new GitHub(user.token);
  if(url.pathname==='/session'&&request.method==='GET')return json({login:user.login});
  if(url.pathname==='/session'&&request.method==='DELETE'){await store.deleteSession(await digest(bearer));return json({signedOut:true});}
  if(!await store.rate(`api:${user.userId}:${Math.floor(Date.now()/3600000)}`,2000))throw new HttpError(429,'Too many requests. Try again later.');
  if(url.pathname==='/tiles'&&request.method==='POST'){
    const data=await readJSON(request,4000),context=mapContext(data.context);
    const tile=context.tiles?wikiRegionTileUrl(data.region,context.tiles,context.plane):regionTileUrl(data.region,context.plane);
    const response=await fetch(tile,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new HttpError(422,`Map tile ${data.region} is unavailable on plane ${context.plane} (HTTP ${response.status}). Choose the correct location or retry.`);
    if(!/^image\/(png|webp)/.test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length'))>2000000)throw new HttpError(422,'Invalid map tile response.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength>2000000)throw new HttpError(422,'Map tile is too large.');
    return new Response(bytes,{headers:{'Content-Type':response.headers.get('content-type'),'Cache-Control':'private, max-age=3600'}});
  }
  if(url.pathname==='/prepare'&&request.method==='POST')return json(await prepare(await readJSON(request,2500000),user.userId,gh,store,env));
  const match=url.pathname.match(/^\/submissions\/([a-f0-9-]{36})(\/submit)?$/);
  if(match&&request.method==='GET'&&!match[2]){const r=await store.get(match[1],user.userId);if(!r)throw new HttpError(404,'Submission not found.');return json(publicRecord(r));}
  if(match&&match[2]&&request.method==='POST')return json(await submit(match[1],await readJSON(request,23000000),user.userId,user.login,gh,store));
  throw new HttpError(404,'Endpoint not found.');
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin'),allowed=origins(env).includes(origin);
    if(origin&&!allowed)return json({error:'This editor origin is not allowed.'},403);
    let response;
    try{response=await handle(request,env);}catch(e){response=json({error:e instanceof HttpError?e.message:e instanceof TypeError?'Invalid request or unavailable service. Please retry.':e.message||'Request failed.'},e.status||400);}
    const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
    if(allowed){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');headers.set('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');}
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(_event,env){await new Store(env.DB).cleanup();},
};
