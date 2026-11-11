import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const dir=new URL('../.github/workflows/',import.meta.url);
const workflows=readdirSync(dir).filter(name=>name.endsWith('.yml')).map(name=>({name,source:readFileSync(new URL(name,dir),'utf8')}));

test('all workflow action references are immutable and Azure OIDC is job-scoped',()=>{
  for(const {name,source}of workflows){
    for(const match of source.matchAll(/uses:\s*([^\s#]+)/g)){
      if(match[1].startsWith('./.github/workflows/')){continue;}
      assert.match(match[1],/^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/,'Immutable action in '+name);
    }
    const [head,...body]=source.split('jobs:\n');assert.doesNotMatch(head,/id-token:\s*write/,'No workflow-wide OIDC in '+name);
    for(const job of body.join('jobs:\n').split(/(?=^ {2}[\w-]+:\s*$)/m)){
      if(job.includes('uses: azure/login@')){assert.match(job,/ {4}permissions:\n(?: {6}[^\n]+\n)* {6}id-token: write/,'Only the Azure job requests OIDC in '+name);}
      if(job.includes('    environment: Production')){assert.match(job,/^ {4}if: .*github\.ref == 'refs\/heads\/main'/m,'Production job is main-only in '+name);}
    }
  }
});

test('historical production mutators and release jobs require explicit manual dispatch',()=>{
  for(const {name,source}of workflows){
    if(['backfill-legacy-tenant-memberships.yml','configure-evia-webhook.yml','deploy-quixo-homes-marketing.yml'].includes(name)||name.startsWith('r3-b04-')||name.startsWith('audit-')||name.startsWith('diagnose-')||['prepare-quixo-marketing-dns.yml','bind-quixo-app-domain.yml','run-production-db-migrations.yml'].includes(name)){
      assert.doesNotMatch(source,/^ {2}push:/m,'No automatic operational execution in '+name);assert.match(source,/^ {2}workflow_dispatch:/m);
      assert.doesNotMatch(source,/cancel-in-progress: true/);
    }
  }
  const deploy=workflows.find(w=>w.name==='deploy-container-apps.yml').source;
  const job=deploy.slice(deploy.indexOf('  deploy:\n'));
  assert.match(job,/if: github\.ref == 'refs\/heads\/main' && github\.event_name == 'workflow_dispatch'/);
  assert.match(deploy,/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});
