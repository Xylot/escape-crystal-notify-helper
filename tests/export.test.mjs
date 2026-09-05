import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyProposal,fullPatch,JAVA_PATH,PLUGIN_REPO } from '../src/core/proposal.mjs';
test('generated unified patch applies with git and preserves exact resulting source',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'crystal-patch-'));
  try {
    const source='public enum EscapeCrystalNotifyRegion {\n    BOSS_A("A", EscapeCrystalNotifyRegionType.BOSSES, EscapeCrystalNotifyRegionDeathType.UNSAFE, 12682);\n}\n';
    const proposal={version:1,repository:PLUGIN_REPO,baseCommit:'a'.repeat(40),changes:[{id:'BOSS_B',name:'B',deathType:'UNSAFE',regions:[12582],baseRaw:null,reviewed:true}]};
    const after=applyProposal(source,proposal);
    await mkdir(path.dirname(path.join(root,JAVA_PATH)),{recursive:true});await writeFile(path.join(root,JAVA_PATH),source);await writeFile(path.join(root,'test.patch'),fullPatch(source,after));
    execFileSync('git',['init','--quiet'],{cwd:root});execFileSync('git',['config','core.autocrlf','false'],{cwd:root});execFileSync('git',['apply','--check','test.patch'],{cwd:root});execFileSync('git',['apply','test.patch'],{cwd:root});
    assert.equal(await readFile(path.join(root,JAVA_PATH),'utf8'),after);
  } finally {
    // Only remove the verified, uniquely created temporary fixture directory.
    if(path.dirname(root)!==path.resolve(tmpdir())||!path.basename(root).startsWith('crystal-patch-'))throw new Error('Unsafe temporary cleanup path.');
    await rm(root,{recursive:true,force:true});
  }
});
