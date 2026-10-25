import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
const execute = promisify(execFile);
export async function docker(args, env = process.env, timeout = 240000) {
  const result = await execute('docker', args, { env, timeout, maxBuffer: 8 * 1024 * 1024 });
  return result.stdout.trim();
}
export async function buildImages(apiImage, webImage, env) {
  const common = ['--build-arg', 'HTTP_PROXY', '--build-arg', 'HTTPS_PROXY', '--build-arg', 'NO_PROXY'];
  if (env.NODE_EXTRA_CA_CERTS && existsSync(env.NODE_EXTRA_CA_CERTS)) common.push('--secret', `id=build_ca,src=${env.NODE_EXTRA_CA_CERTS}`);
  await docker(['build', ...common, '-f', 'deploy/Dockerfile.api', '-t', apiImage, '.'], env, 600000);
  await docker(['build', ...common, '--build-arg', 'VITE_SUPABASE_URL', '--build-arg', 'VITE_SUPABASE_ANON_KEY', '--build-arg', 'VITE_API_URL', '-f', 'deploy/Dockerfile.web', '-t', webImage, '.'], env, 600000);
}
export async function compose(project, args, env, timeout = 180000) {
  return docker(['compose', '-f', 'compose.staging.yml', '-p', project, '--profile', 'simulation', '--profile', 'web', ...args], env, timeout);
}
