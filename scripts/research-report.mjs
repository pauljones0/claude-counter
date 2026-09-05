import { readFile, writeFile } from 'node:fs/promises';
const audit=JSON.parse(await readFile('research/forks.json','utf8'));
const branches=JSON.parse(await readFile('research/branches.json','utf8'));
const rows=['# Upstream fork inventory','','Snapshot: '+audit.checkedAt+'. Public GitHub API enumeration; default-branch comparisons and all discoverable branch heads. Raw responses remain local in ignored research JSON files; regenerate with scripts/audit-forks.mjs and scripts/audit-branches.mjs.','','The API returned 275 fork entries while the repository counter reported 276. SalwynC/claude-counter returned 404 repeatedly. da1g/claude-counter feature-settings has no shared ancestor; its tree and popup source were inspected directly (settings and local history). These are access/history limitations, not evidence that the branches have no changes.','','| Repository | Default branch vs upstream | Other branch heads |','| --- | --- | --- |'];
for(const fork of [...audit.forks].sort((a,b)=>a.repository.localeCompare(b.repository))) {
  const b=branches.find(b=>b.repository===fork.repository);
  const extras=b?.extra?.map(x=>`${x.name} (${x.ahead} ahead)`).join('; ') || (b?.error?'See limitation above':'None distinct');
  rows.push(`| [${fork.repository}](https://github.com/${fork.repository}) | ${fork.error?'Unavailable':`${fork.status}; +${fork.ahead}/-${fork.behind}`} | ${extras.replaceAll('|','/')} |`);
}
await writeFile('research/INVENTORY.md',rows.join('\n')+'\n');
console.log(`Recorded ${audit.forks.length} forks, ${branches.filter(b=>b.extra?.length).length} with additional distinct branch heads`);
