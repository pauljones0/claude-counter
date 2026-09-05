import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
const exec = promisify(execFile);
const api = async path => JSON.parse((await exec('gh',['api',path],{maxBuffer:20*1024*1024})).stdout);
const audit=JSON.parse(await readFile('research/forks.json','utf8'));
let done=0;
const queue=[...audit.forks];
const results=[];
async function worker() {
  while(queue.length) {
    const fork=queue.shift();
    try {
      const branches=[];
      for(let page=1;;page++) {
        const batch=await api(`repos/${fork.repository}/branches?per_page=100&page=${page}`);
        branches.push(...batch);
        if(batch.length<100) break;
      }
      const extra=[];
      const main=branches.find(b=>b.name===(fork.branch||'main'));
      const seen=new Set([main?.commit.sha]);
      for(const branch of branches) {
        if(seen.has(branch.commit.sha)) continue;
        seen.add(branch.commit.sha);
        const diff=await api(`repos/she-llac/claude-counter/compare/main...${fork.repository.split('/')[0]}:${encodeURIComponent(branch.name)}`);
        extra.push({name:branch.name,sha:branch.commit.sha,ahead:diff.ahead_by,commits:diff.commits.map(c=>c.commit.message),files:diff.files?.map(f=>({filename:f.filename,patch:f.patch}))});
      }
      results.push({repository:fork.repository,branches:branches.map(b=>({name:b.name,sha:b.commit.sha})),extra});
    } catch(error) {results.push({repository:fork.repository,error:error.message});}
    if(++done%50===0) console.log(`Branches checked: ${done}/${audit.forks.length}`);
  }
}
await Promise.all(Array.from({length:6},worker));
await writeFile('research/branches.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.filter(r=>r.error||r.extra.length).map(r=>({repository:r.repository,error:r.error,extra:r.extra?.map(b=>({name:b.name,ahead:b.ahead,commits:b.commits}))})),null,2));
