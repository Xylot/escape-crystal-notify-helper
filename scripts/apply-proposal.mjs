import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyProposal,JAVA_PATH } from '../src/core/proposal.mjs';
const [file,root='.']=process.argv.slice(2);
if(!file)throw new Error('Usage: node scripts/apply-proposal.mjs proposal.json /path/to/plugin');
const text=await readFile(file,'utf8');if(Buffer.byteLength(text)>60000)throw new Error('Proposal exceeds 60 KB.');
const proposal=JSON.parse(text),target=path.resolve(root,JAVA_PATH);
const source=await readFile(target,'utf8'),result=applyProposal(source,proposal);
await writeFile(target,result);console.log(`Applied ${proposal.changes.length} reviewed changes to ${target}.`);
