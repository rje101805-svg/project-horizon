import {execFileSync} from 'node:child_process';
// Public deployment identity only. Never expose environment values wholesale.
export function deploymentRevision(renderCommit:unknown,readGit:()=>string):string {
 if(typeof renderCommit==='string'&&/^[a-f0-9]{40}$/i.test(renderCommit))return renderCommit.toLowerCase();
 try{const revision=readGit().trim();if(/^[a-f0-9]{40}$/i.test(revision))return revision.toLowerCase();}catch{/* Source archives may omit Git metadata. */}
 return 'unknown';
}
export const SERVER_REVISION=deploymentRevision(process.env.RENDER_GIT_COMMIT,()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
