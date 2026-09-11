import {readFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
export const snapshot=JSON.parse(readFileSync(new URL('../public/data/snapshot.json',import.meta.url)));
export const change={id:'BOSS_PR_TEST',name:'PR test',regions:[12682],deathType:'UNSAFE',baseRaw:null};
export const input={changes:[change],contexts:{[change.id]:{arena:{x:3179,y:8876,plane:0,source:'https://oldschool.runescape.wiki/w/Shellbane_Gryphon_Cave',revision:123}}},sources:{[change.id]:['https://oldschool.runescape.wiki/w/Shellbane_gryphon']}};
export const env={DEPLOYMENT_MODE:'test',TEST_TARGET_REPO:'test/plugin',BASE_BRANCH:'master'};
export class MemoryStore{
  rows=new Map();locks=new Set();
  async create(r){const old=await this.byFingerprint(r.owner,r.fingerprint);if(old)return old;this.rows.set(r.id,structuredClone(r));return structuredClone(r);}
  async byFingerprint(owner,fingerprint){return structuredClone([...this.rows.values()].find(r=>r.owner===owner&&r.fingerprint===fingerprint)??null);}
  async submitted(owner,revision){return structuredClone([...this.rows.values()].filter(r=>r.owner===owner&&r.revision===revision&&r.pr));}
  async history(owner){return structuredClone([...this.rows.values()].filter(r=>r.owner===owner&&r.pr));}
  async get(id,owner){const r=this.rows.get(id);return r?.owner===owner?structuredClone(r):null;}
  async save(r){this.rows.set(r.id,structuredClone(r));}
  async lock(id){if(this.locks.has(id))return false;this.locks.add(id);return true;}
  async unlock(id){this.locks.delete(id);}
}
export class FakeGitHub{
  sha=snapshot.baseCommit;source=snapshot.source;calls=[];refs=new Map();prs=[];ready=true;failUpload=false;losePRResponse=false;counter=0;
  async upstream(){return {sha:this.sha,tree:'tree-base',source:this.source};}
  async fork(){this.calls.push('fork');return 'contributor/plugin';}
  async optional(){return this.ready?{sha:this.sha}:null;}
  async blob(repo,content,encoding){this.calls.push(['blob',repo,content,encoding]);if(this.failUpload){this.failUpload=false;throw Error('Upload interrupted');}return {sha:`blob-${++this.counter}`};}
  async tree(repo,entries,base){this.calls.push(['tree',entries,base]);return {sha:`tree-${++this.counter}`};}
  async commit(repo,tree,parents,message){this.calls.push(['commit',parents,message]);return {sha:`commit-${++this.counter}`};}
  async ensureRef(repo,branch,sha){this.calls.push(['ref',branch,sha]);if(this.refs.has(branch)&&this.refs.get(branch)!==sha)throw Error('Branch changed');this.refs.set(branch,sha);}
  async findPR(repo,head){return this.prs.find(p=>p.head===head)??null;}
  async pullRequest(repo,number){const pr=this.prs.find(p=>p.number===number);if(!pr)throw Error('PR not found');return pr;}
  async branchHead(repo,branch){return this.refs.get(branch);}
  async advanceRef(repo,branch,expected,sha){const head=this.refs.get(branch);if(head!==expected&&head!==sha)throw Error('Branch changed');this.refs.set(branch,sha);this.calls.push(['advance',branch,sha]);}
  async updatePR(repo,number,data){const pr=await this.pullRequest(repo,number);Object.assign(pr,data);this.calls.push(['update-pr',number]);return pr;}
  async createPR(repo,data){this.calls.push(['pr',data]);const pr={...data,number:this.prs.length+1,html_url:`https://github.com/test/plugin/pull/${this.prs.length+1}`,state:'open',merged_at:null};this.prs.push(pr);if(this.losePRResponse){this.losePRResponse=false;throw Error('Response lost');}return pr;}
}
export function png(width,height){
  const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([length,type,data,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const body=Buffer.alloc((width*4+1)*height);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(body)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
