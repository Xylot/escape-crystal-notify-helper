import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {stripVTControlCharacters} from 'node:util';

if(process.argv.length>3)throw new Error('Usage: npm run test:bosses -- [path/to/EscapeCrystalNotifyRegion.java]');
const source=process.argv[2];
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(path.join(root,'work'),{recursive:true});
const result=spawnSync(process.execPath,['--test',
  '--test-reporter=spec','--test-reporter-destination=stdout',
  '--test-reporter=spec','--test-reporter-destination=work/boss-roundtrip.log',
  '--test-reporter=junit','--test-reporter-destination=work/boss-roundtrip.xml',
  'tests/boss-roundtrip.test.mjs'],{
  cwd:root,
  env:{...process.env,...(source?{PLUGIN_REGION_SOURCE:path.resolve(source)}:{})},
  stdio:['inherit','pipe','inherit'],
  encoding:'utf8',
});
if(result.error)throw result.error;
const color=process.env.FORCE_COLOR!==undefined?process.env.FORCE_COLOR!=='0'
  : process.env.NO_COLOR===undefined&&!!process.stdout.isTTY;
process.stdout.write(color?result.stdout.replace(/[^\r\n]+/g,line=>{
  const plain=stripVTControlCharacters(line);
  return /SOURCE COVERAGE DISCREPANCY|[1-9]\d* confirmed SOURCE COVERAGE DISCREPANCIES|PRESERVED ONLY|^[✖✗]|^ℹ fail [1-9]/.test(plain)
    ? `\x1b[31m${plain}\x1b[0m` : line;
}):result.stdout);
console.log('Detailed results: work/boss-roundtrip.log; machine-readable results: work/boss-roundtrip.xml');
process.exitCode=result.status??1;
