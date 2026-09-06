import { HttpError } from './security.mjs';
import { JAVA_PATH } from '../src/core/proposal.mjs';

export class GitHub {
  constructor(token, fetcher=(...args)=>fetch(...args)){this.token=token;this.fetcher=fetcher;}
  async request(path, method='GET', body) {
    const response=await this.fetcher(`https://api.github.com${path}`,{method,headers:{Authorization:`Bearer ${this.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Escape-Crystal-Editor','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    if(!response.ok){const e=new HttpError(response.status===401?401:response.status===403?403:502,response.status===401?'GitHub login expired. Sign in again.':response.status===403?'GitHub denied this request or its rate limit was reached. Check access and retry later.':`GitHub request failed (${response.status}). Retry this submission.`);e.githubStatus=response.status;throw e;}
    return response.status===204?null:response.json();
  }
  async optional(path){try{return await this.request(path);}catch(e){if(e.githubStatus===404)return null;throw e;}}
  async upstream(repo,branch){
    const commit=await this.request(`/repos/${repo}/commits/${encodeURIComponent(branch)}`);
    const blob=await this.request(`/repos/${repo}/contents/${JAVA_PATH}?ref=${commit.sha}`);
    if(blob.encoding!=='base64')throw new HttpError(502,'GitHub did not return the plugin source.');
    const source=new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\s/g,'')),c=>c.charCodeAt(0)));
    return {sha:commit.sha,tree:commit.commit.tree.sha,source};
  }
  async fork(repo,login){
    const target=await this.request(`/repos/${repo}`);
    if(target.owner.login.toLowerCase()===login.toLowerCase())return repo;
    let candidate=await this.optional(`/repos/${login}/${target.name}`);
    if(candidate&&(!candidate.fork||candidate.parent?.id!==target.id&&candidate.source?.id!==target.id))throw new HttpError(409,'A repository with this name already exists in your account and is not the plugin fork. Rename it or use another account.');
    if(!candidate)candidate=await this.request(`/repos/${repo}/forks`,'POST',{default_branch_only:true});
    if(candidate.private)throw new HttpError(409,'Evidence requires a public fork.');
    return candidate.full_name;
  }
  async ensureRef(repo,branch,sha){
    const path=`/repos/${repo}/git/ref/heads/${branch}`, existing=await this.optional(path);
    if(existing){if(existing.object.sha!==sha)throw new HttpError(409,'The submission branch was changed on GitHub. Start a new preview.');return;}
    try{await this.request(`/repos/${repo}/git/refs`,'POST',{ref:`refs/heads/${branch}`,sha});}
    catch(e){const recovered=await this.optional(path);if(recovered?.object.sha===sha)return;throw e;}
  }
  async commit(repo,tree,parents,message){return this.request(`/repos/${repo}/git/commits`,'POST',{tree,parents,message});}
  async tree(repo,entries,base_tree){return this.request(`/repos/${repo}/git/trees`,'POST',{...(base_tree?{base_tree}:{}),tree:entries});}
  async blob(repo,content,encoding='utf-8'){return this.request(`/repos/${repo}/git/blobs`,'POST',{content,encoding});}
  async findPR(repo,head,base){const rows=await this.request(`/repos/${repo}/pulls?state=all&head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}`);return rows[0]??null;}
  async createPR(repo,data){return this.request(`/repos/${repo}/pulls`,'POST',data);}
}
