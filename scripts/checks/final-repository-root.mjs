import path from 'node:path';

export function resolveFinalRepositoryRoot(localRoot, environment = process.env) {
  const configured = environment.BATTLE_CONSOLE_FINAL_REPOSITORY_ROOT;
  if (configured === undefined || configured === '') return path.resolve(localRoot);
  if (!path.isAbsolute(configured)) throw new Error('final repository root must be absolute');
  return path.resolve(configured);
}

export function resolveFinalGitExecutable(environment = process.env) {
  const configured = environment.BATTLE_CONSOLE_FINAL_GIT_EXECUTABLE;
  if (configured === undefined || configured === '') return 'git';
  if (!path.isAbsolute(configured)) throw new Error('final Git executable must be absolute');
  return path.resolve(configured);
}
