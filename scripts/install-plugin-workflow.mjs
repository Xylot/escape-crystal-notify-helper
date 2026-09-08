// Run explicitly against a local plugin checkout; never modifies a remote repo.
import { readFile,copyFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2];if(!root)throw new Error('Usage: node scripts/install-plugin-workflow.mjs /path/to/plugin');
await readFile(path.join(root,'src/main/java/com/escapecrystalnotify/EscapeCrystalNotifyRegion.java'));
const base=path.join(root,'.github/content-editor');
await mkdir(path.join(base,'src/core'),{recursive:true});await mkdir(path.join(base,'scripts'),{recursive:true});await mkdir(path.join(root,'.github/workflows'),{recursive:true});
for(const file of ['encounter-kind.mjs','encounter-export.mjs','coordinates.mjs','java.mjs','proposal.mjs','entrance.mjs','gameval-code.mjs','gameval-ids.mjs'])await copyFile(`src/core/${file}`,path.join(base,'src/core',file));
await copyFile('scripts/apply-proposal.mjs',path.join(base,'scripts/apply-proposal.mjs'));
await copyFile('integration/content-proposal.yml',path.join(root,'.github/workflows/content-proposal.yml'));
console.log('Installed workflow and deterministic proposal validator. Review and commit these files in the plugin checkout.');
