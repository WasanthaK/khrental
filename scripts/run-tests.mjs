import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
export const discoverTestFiles = () => {
  const files=[];
  const visit=dir=>{
    for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
      const name=path.posix.join(dir,entry.name);
      if(entry.isDirectory()){visit(name);}
      else if(entry.isFile()&&/\.test\.(?:js|mjs|cjs)$/.test(entry.name)){files.push(name);}
    }
  };
  visit('tests');return files.sort();
};
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const files=discoverTestFiles();
  if(!files.length){throw new Error('No tests discovered.');}
  const result=spawnSync(process.execPath,['--test',...process.argv.slice(2),...files],{cwd:root,stdio:'inherit'});
  if(result.error){throw result.error;}
  process.exitCode=result.status??1;
}
