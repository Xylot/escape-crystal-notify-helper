import { digest } from './pr-hash';
export const PR_API = (import.meta.env.VITE_PR_API_URL || '').replace(/\/$/, '');
const SESSION='escape-crystal-pr-session',VERIFIER='escape-crystal-pr-verifier';
export class PRFailure extends Error { constructor(message:string,public status:number){super(message);} }
export async function prRequest(path:string,body?:unknown,method=body===undefined?'GET':'POST') {
  const response=await fetch(PR_API+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(sessionStorage.getItem(SESSION)?{Authorization:`Bearer ${sessionStorage.getItem(SESSION)}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){let error;try{error=(await response.json()).error;}catch{}if(response.status===401)sessionStorage.removeItem(SESSION);throw new PRFailure(error||`Request failed (${response.status}).`,response.status);}
  return response;
}
export async function prJSON(path:string,body?:unknown,method?:string){return (await prRequest(path,body,method)).json();}
async function exchange(ticket:string){
  const verifier=sessionStorage.getItem(VERIFIER);if(!verifier)throw new Error('Sign-in expired. Please sign in again.');
  const result=await prJSON('/auth/exchange',{ticket,verifier});sessionStorage.setItem(SESSION,result.session);sessionStorage.removeItem(VERIFIER);return result.login as string;
}
export async function finishRedirect(){
  if(!location.hash.startsWith('#pr-auth='))return null;
  const ticket=location.hash.slice(9);history.replaceState(null,'',location.pathname+location.search+'#encounters');return exchange(ticket);
}
export async function signIn(redirect=false){
  // Open synchronously from the click, before awaiting hashing, to avoid popup blocking.
  const popup=redirect?null:window.open('about:blank','escape-crystal-github','popup,width=650,height=740');
  const verifier=crypto.randomUUID()+crypto.randomUUID();sessionStorage.setItem(VERIFIER,verifier);
  const returnTo=location.href.split('#')[0],url=`${PR_API}/auth/start?${new URLSearchParams({returnTo,challenge:await digest(verifier)})}`;
  if(!popup){location.assign(url);return new Promise<string>(()=>{});}
  return new Promise<string>((resolve,reject)=>{
    const cleanup=()=>{window.removeEventListener('message',listener);clearInterval(timer);};
    const listener=(event:MessageEvent)=>{if(event.origin!==new URL(PR_API).origin||event.source!==popup||event.data?.type!=='escape-crystal-auth')return;cleanup();exchange(event.data.ticket).then(resolve,reject);};
    window.addEventListener('message',listener);
    const started=Date.now();const timer=window.setInterval(()=>{if(popup.closed||Date.now()-started>600000){cleanup();reject(new Error('Sign-in window closed or expired. Please try again.'));}},1000);
    popup.location.href=url;
  });
}
export async function signOut(){try{await prJSON('/session',undefined,'DELETE');}finally{sessionStorage.removeItem(SESSION);}}
