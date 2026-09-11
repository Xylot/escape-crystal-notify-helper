import {stateBody} from './pr-description.mjs';
import {isDungeon} from '../src/core/encounter-kind.mjs';
import { applyProposalFiles, validateProposal, proposalPatch, PLUGIN_REPO, JAVA_PATH } from '../src/core/proposal.mjs';
import { cleanChanges, panelSize, stableJSON } from '../src/core/pr-evidence.mjs';
import {proposalStates, comparisonEvidence, stateDifferences} from '../src/core/pr-states.mjs';
import { digest, HttpError, validatePNG, validatePixels } from './security.mjs';
import { cleanPresentation, defaultPRText } from '../src/core/pr-presentation.mjs';
import { moidImage } from '../src/core/moid-images.mjs';

export function target(env){
  const repo=env.DEPLOYMENT_MODE==='test'?env.TEST_TARGET_REPO:PLUGIN_REPO;
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??''))throw new HttpError(503,'Target repository is not configured.');
  return {repo,branch:env.BASE_BRANCH||'master'};
}
const md = value => String(value).replace(/[\\`*_{}[\]<>()!#|]/g,'\\$&').replace(/[\r\n]+/g,' ');
const validationBody=record=>`## Validation\n\nStructured proposal validation and edited-entry conflict checks passed against \`${record.base.sha}\`. Screenshots show editor selections, not in-game verification. Plugin compilation and repository checks are left to the normal PR checks.\n\n<!-- escape-crystal-submission:${record.id} -->`;
export function prBody(record,introduction,images){
  let text=`${introduction.trim()}\n\n`;
  for(const change of record.changes){
    const pair=record.states?.[change.id];
    text+=`## ${md(change.name)}\n\n`;
    // Existing prepared/submitted records keep their original evidence contract.
    if(!pair){text+=stateBody(record,change,images)+'\n\n';continue;}
    for(const phase of pair.before?['after','before']:['after']){
      const state=pair[phase],label=phase==='before'?'Before':'After';
      const presentation=record.presentation?.[change.id];
      const scoped={...record,changes:[state],presentation:{[state.id]:{...presentation,images:phase==='before'?presentation?.beforeImages??[]:presentation?.images??[]}},
        evidence:{...record.evidence,panels:record.evidence.panels.filter(p=>p.bossId===state.id&&(!pair.before||p.state===phase))}};
      const body=stateBody(scoped,state,images);
      if(pair.before)text+=`<details${phase==='after'?' open':''}>\n<summary>${label}</summary>\n\n${body}\n\n</details>\n\n`;
      else text+=body+'\n\n';
    }
  }
  return text+validationBody(record);
}
const html=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function publicRecord(r){
  const images=Object.fromEntries(r.evidence.panels.map(p=>[p.id,r.evidenceCommit?`https://raw.githubusercontent.com/${r.fork}/${r.evidenceCommit}/${p.id}.png`:`evidence://${p.id}`]));
  return {id:r.id,revision:r.revision,repo:r.repo,branch:r.branch,baseSha:r.base.sha,patch:r.patch,changes:r.changes,states:r.states,evidence:r.evidence,presentation:r.presentation,title:r.title,introduction:r.introduction,body:prBody(r,r.introduction,images),status:r.status,pr:r.pr??null,updatePR:r.update?.pr??null,error:r.error??null};
}

function prReference(pr){
  if(!['open','closed'].includes(pr.state))throw new HttpError(502,'Could not confirm the pull request status. Check GitHub and try again.');
  return {url:pr.html_url,number:pr.number,state:pr.state,merged:!!(pr.merged||pr.merged_at)};
}
const prStatus=pr=>pr.merged?'merged':pr.state==='closed'?'closed':'complete';
const canReplace=pr=>pr.state==='closed'&&!pr.merged;
export async function refreshPR(record,gh,store){
  if(!record.pr)return record;
  const pr=prReference(await gh.pullRequest(record.repo,record.pr.number)),status=prStatus(pr);
  if(JSON.stringify(record.pr)!==JSON.stringify(pr)||record.status!==status){record.pr=pr;record.status=status;record.error=null;await store.save(record);}
  return record;
}
export async function submissionStatus(id,owner,gh,store){
  const record=await store.get(id,owner);if(!record)throw new HttpError(404,'Submission not found.');
  return publicRecord(await refreshPR(record,gh,store));
}
async function submittedRecords(owner,revision,gh,store){
  const records=await store.submitted(owner,revision);
  for(const record of records)await refreshPR(record,gh,store);
  return records;
}

export async function prepare(input,owner,gh,store,env){
  const {repo,branch}=target(env);
  let changes=cleanChanges(input.changes),update;
  validateProposal({version:4,repository:PLUGIN_REPO,baseCommit:'0'.repeat(40),changes});
  const encounter=c=>c.metadataBase?.canonicalId??c.id.replace(/_ENTRANCE$/,'');
  const selected=new Set(changes.map(encounter)),candidates=new Map();
  for(const old of await store.history(owner)){
    if(old.repo!==repo||old.branch!==branch||!old.changes.some(c=>selected.has(encounter(c))))continue;
    await refreshPR(old,gh,store);
    if(old.pr.state!=='open'||old.pr.merged)continue;
    const headBranch=old.update?.headBranch??`codex/encounters-${old.id}`;
    const head=await gh.branchHead(old.fork,headBranch);
    // Several saved revisions can refer to one PR; use the one at its current head.
    const candidate={old,headBranch,head,matched:head===old.codeCommit};
    if(!candidates.has(old.pr.number)||candidate.matched)candidates.set(old.pr.number,candidate);
  }
  if(candidates.size>1)throw new HttpError(409,'These encounters belong to multiple open PRs. Update each PR separately.');
  const candidate=[...candidates.values()][0];
  if(candidate){
    const {old,headBranch,head,matched}=candidate;
    if(!matched)throw new HttpError(409,'The existing PR branch has changes outside this tool. Review those changes on GitHub before updating.');
    changes=cleanChanges([...old.changes.filter(c=>!selected.has(encounter(c))),...changes]);
    const previousContexts=Object.fromEntries(Object.entries(old.evidence.contexts).map(([id,phases])=>[id,phases.after??phases]));
    input={...input,contexts:{...previousContexts,...input.contexts},sources:{...old.evidence.sources,...input.sources},presentation:{...old.presentation,...input.presentation}};
    update={pr:old.pr,fork:old.fork,headBranch,head,lockId:old.update?.lockId??old.id};
  }
  const states=proposalStates(changes);
  const evidence=comparisonEvidence(changes,states,input.contexts,input.sources);
  const presentation=cleanPresentation(changes,input.presentation);
  // Bump when generation changes so persisted previews cannot retain old output.
  const revision=await digest(stableJSON({generator:6,changes,evidence,presentation,repo,branch}));
  const submitted=await submittedRecords(owner,revision,gh,store);
  const blocking=submitted.find(r=>!canReplace(r.pr)&&(!update||r.codeCommit===update.head));if(blocking)return publicRecord(blocking);
  const base=await gh.upstream(repo,branch),sources=base.sources??{[JAVA_PATH]:base.source},afterFiles=applyProposalFiles(sources,{version:4,repository:PLUGIN_REPO,baseCommit:base.sha,changes}),after=afterFiles[JAVA_PATH];
  if(Object.entries(afterFiles).every(([path,text])=>text===sources[path]))throw new HttpError(409,'These settings already match the plugin. There are no changes to submit.');
  // Closed attempts keep their evidence and history. A deterministic new fingerprint
  // gives concurrent preparations one fresh submission, with separate branch names.
  const fingerprint=await digest(revision+base.sha+(update?.head??'')+submitted.map(r=>r.id).sort().join(',')),existing=await store.byFingerprint(owner,fingerprint);
  if(existing)return publicRecord(await refreshPR(existing,gh,store));
  const record={id:crypto.randomUUID(),owner,revision,fingerprint,repo,branch,base,after,afterFiles,changes,states,evidence,presentation,patch:proposalPatch(sources,afterFiles),...defaultPRText(changes,presentation),...(update?{update,title:candidate.old.title,introduction:candidate.old.introduction}:{}),status:'prepared'};
  return publicRecord(await store.create(record));
}

export async function submit(id,input,owner,login,gh,store){
  let r=await store.get(id,owner);if(!r)throw new HttpError(404,'Preview not found. Prepare your PR again.');
  if(r.pr)return publicRecord(await refreshPR(r,gh,store));
  if(!await store.lock(id))return {...publicRecord(r),status:'working'};
  let updateLocked=false;
  const save=async status=>{r.status=status;r.error=null;await store.save(r);};
  try{
    r=await store.get(id,owner);
    if(r.pr)return publicRecord(await refreshPR(r,gh,store));
    if(r.update){
      updateLocked=await store.lock(r.update.lockId);
      if(!updateLocked)return {...publicRecord(r),status:'working'};
      const live=await gh.pullRequest(r.repo,r.update.pr.number);
      if(live.state!=='open'||live.merged||live.merged_at)throw new HttpError(409,'This PR is no longer open. Prepare a new preview.');
      if(live.head?.repo&&(live.head.repo.full_name!==r.update.fork||live.head.ref!==r.update.headBranch||live.base.ref!==r.branch))throw new HttpError(409,'The PR target changed. Prepare a new preview.');
      const head=await gh.branchHead(r.update.fork,r.update.headBranch);
      if(head!==r.update.head&&head!==r.codeCommit)throw new HttpError(409,'The PR branch changed since preview. Prepare a fresh preview before updating.');
    }
    // Reconcile uncertain PR responses before rejecting a now-stale upstream preview.
    if(r.fork&&!r.update){const found=await gh.findPR(r.repo,`${login}:codex/encounters-${r.id}`,r.branch);if(found){r.pr=prReference(found);await save(prStatus(r.pr));return publicRecord(r);}}
    const blocking=(await submittedRecords(owner,r.revision,gh,store)).find(other=>other.id!==r.id&&!canReplace(other.pr)&&other.pr.number!==r.update?.pr.number);
    if(blocking)throw new HttpError(409,`Pull request #${blocking.pr.number} is ${blocking.pr.merged?'merged':'open'} for this draft revision. Refresh the preview to view it.`);
    if(!r.update){
      const ids=new Set(r.changes.map(c=>c.metadataBase?.canonicalId??c.id.replace(/_ENTRANCE$/,'')));
      for(const other of await store.history(owner)){
        if(other.repo!==r.repo||other.branch!==r.branch||!other.changes.some(c=>ids.has(c.metadataBase?.canonicalId??c.id.replace(/_ENTRANCE$/,''))))continue;
        await refreshPR(other,gh,store);
        if(other.pr.state==='open'&&!other.pr.merged)throw new HttpError(409,`Pull request #${other.pr.number} is now open for this encounter. Prepare again to update it.`);
      }
    }
    const current=await gh.upstream(r.repo,r.branch);
    if(current.sha!==r.base.sha)throw new HttpError(409,'Upstream changed. Prepare and review a fresh preview before creating the PR.');
    if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200||/[\r\n\x00-\x1f]/.test(input.title))throw new HttpError(400,'Enter a PR title of 1–200 characters.');
    if(typeof input.introduction!=='string'||input.introduction.length>6000)throw new HttpError(400,'Keep the introduction under 6,000 characters.');
    if(!Array.isArray(input.images)||input.images.length!==r.evidence.panels.length)throw new HttpError(400,'Generate every screenshot before submitting.');
    const images=new Map();let bytes=0;
    for(const image of input.images){const p=r.evidence.panels.find(p=>p.id===image.id);if(!p||images.has(image.id))throw new HttpError(400,'Unexpected or duplicate screenshot.');const decoded=validatePNG(image.png,panelSize(p));await validatePixels(decoded,panelSize(p));bytes+=decoded.length;images.set(image.id,image.png);}
    if(bytes>16000000)throw new HttpError(413,'Screenshots exceed 16 MB. Split this into smaller PRs.');
    const imageHash=await digest(stableJSON(input.images));
    if(r.imageHash&&r.imageHash!==imageHash)throw new HttpError(409,'The screenshot set changed after submission began. Restore the submitted preview or prepare a new draft revision.');
    r.imageHash=imageHash;r.title=input.title.trim();r.introduction=input.introduction;
    await save('creating-fork');
    if(!r.fork){r.fork=r.update?.fork??await gh.fork(r.repo,login);await store.save(r);}
    if(!await gh.optional(`/repos/${r.fork}/git/commits/${r.base.sha}`))throw new HttpError(425,'GitHub is still preparing your fork. Retry in a few seconds.');
    await save('uploading-screenshots');
    if(!r.evidenceCommit){
      const entries=[];
      r.imageBlobs??={};
      for(const panel of r.evidence.panels){if(!r.imageBlobs[panel.id]){r.imageBlobs[panel.id]=(await gh.blob(r.fork,images.get(panel.id),'base64')).sha;await store.save(r);}entries.push({path:`${panel.id}.png`,mode:'100644',type:'blob',sha:r.imageBlobs[panel.id]});}
      const manifest=await gh.blob(r.fork,JSON.stringify({submission:r.id,revision:r.revision,base:r.base.sha,evidence:r.evidence,presentation:r.presentation,states:r.states},null,2));
      entries.push({path:'manifest.json',mode:'100644',type:'blob',sha:manifest.sha});
      const tree=await gh.tree(r.fork,entries);r.evidenceCommit=(await gh.commit(r.fork,tree.sha,[],`Map evidence for ${r.title}`)).sha;await store.save(r);
    }
    await gh.ensureRef(r.fork,`codex/evidence-${r.id}`,r.evidenceCommit);
    await save('committing-code');
    if(!r.codeCommit){const entries=[];for(const [path,text] of Object.entries(r.afterFiles??{[JAVA_PATH]:r.after})){if(text===(r.base.sources??{[JAVA_PATH]:r.base.source})[path])continue;const blob=await gh.blob(r.fork,text);entries.push({path,mode:'100644',type:'blob',sha:blob.sha});}const tree=await gh.tree(r.fork,entries,r.base.tree);r.codeCommit=(await gh.commit(r.fork,tree.sha,r.update?[...new Set([r.update.head,r.base.sha])]:[r.base.sha],r.title)).sha;await store.save(r);}
    if(r.update){
      const live=await gh.pullRequest(r.repo,r.update.pr.number);
      if(live.state!=='open'||live.merged||live.merged_at)throw new HttpError(409,'This PR is no longer open. Prepare a new preview.');
      await gh.advanceRef(r.fork,r.update.headBranch,r.update.head,r.codeCommit);
      await save('updating-pr');
      const pr=await gh.updatePR(r.repo,r.update.pr.number,{title:r.title,body:publicRecord(r).body});
      r.pr=prReference(pr);await save(prStatus(r.pr));return publicRecord(r);
    }
    await gh.ensureRef(r.fork,`codex/encounters-${r.id}`,r.codeCommit);
    await save('creating-pr');
    const head=`${login}:codex/encounters-${r.id}`;
    let pr=await gh.findPR(r.repo,head,r.branch);
    if(!pr){try{pr=await gh.createPR(r.repo,{title:r.title,body:publicRecord(r).body,head,base:r.branch,draft:false});}catch(e){pr=await gh.findPR(r.repo,head,r.branch);if(!pr)throw e;}}
    r.pr=prReference(pr);await save(prStatus(r.pr));return publicRecord(r);
  }catch(e){r.status='retry';r.error=e.message;await store.save(r);throw e;}finally{if(updateLocked)await store.unlock(r.update.lockId);await store.unlock(id);}
}
