import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const upstream = 'she-llac/claude-counter';
function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { maxBuffer: 30 * 1024 * 1024 }));
}
const forks = [];
for (let page = 1; ; page++) {
  const batch = api(`repos/${upstream}/forks?per_page=100&page=${page}`);
  forks.push(...batch);
  if (batch.length < 100) break;
}
const results = [];
for (const [index, fork] of forks.entries()) {
  try {
    const comparison = api(`repos/${upstream}/compare/main...${fork.owner.login}:${fork.default_branch}`);
    results.push({ repository: fork.full_name, branch: fork.default_branch,
      status: comparison.status, ahead: comparison.ahead_by, behind: comparison.behind_by,
      commits: comparison.commits.map(c => ({ sha: c.sha, message: c.commit.message })),
      files: comparison.files?.map(f => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })) });
  } catch (error) {
    results.push({ repository: fork.full_name, error: error.message });
  }
  if ((index + 1) % 25 === 0) console.log(`Compared ${index + 1}/${forks.length} forks`);
}
await mkdir('research', { recursive: true });
await writeFile('research/forks.json', JSON.stringify({ checkedAt: new Date().toISOString(), upstream, forks: results }, null, 2));
console.log(JSON.stringify({ total: forks.length, changed: results.filter(r => r.ahead > 0).map(r => ({repository:r.repository,ahead:r.ahead,files:r.files?.length})), errors: results.filter(r => r.error) }, null, 2));
