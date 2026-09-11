import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyProposalFiles,JAVA_PATH } from '../src/core/proposal.mjs';
import {hasMetadata,METADATA_PATHS} from '../src/core/encounter-metadata.mjs';
const [file,root='.']=process.argv.slice(2);
if(!file)throw new Error('Usage: node scripts/apply-proposal.mjs proposal.json /path/to/plugin');
const text=await readFile(file,'utf8');if(Buffer.byteLength(text)>60000)throw new Error('Proposal exceeds 60 KB.');
const proposal=JSON.parse(text),paths=[JAVA_PATH,...(proposal.changes?.some(hasMetadata)?METADATA_PATHS:[])];
const sources=Object.fromEntries(await Promise.all(paths.map(async file=>[file,await readFile(path.resolve(root,file),'utf8')])));
// Validate every file before writing any of them.
const result=applyProposalFiles(sources,proposal);
for(const [file,source] of Object.entries(result))if(source!==sources[file])await writeFile(path.resolve(root,file),source);
console.log(`Applied ${proposal.changes.length} changes across ${Object.keys(result).length} plugin source files.`);
