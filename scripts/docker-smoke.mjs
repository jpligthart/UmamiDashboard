import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = process.argv[2];
if (!image || image.startsWith('-')) {
  console.error('Gebruik: npm run docker:smoke -- <lokaal-api-image>'); process.exit(1);
}
const name = `umami-dashboard-smoke-${randomUUID()}`;
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Docker-opdracht mislukt');
  return result.stdout.trim();
}
let started = false;
try {
  // Exercise the image's real CMD, as its configured user, without credentials,
  // external networking, host ports or mounts of user configuration.
  docker(['run', '--detach', '--rm', '--name', name, '--network', 'none', '--env', 'DEMO_MODE=true', '--health-interval=1s', '--health-start-period=0s', image]);
  started = true;
  const deadline = Date.now() + 25000;
  while (docker(['inspect', '--format', '{{.State.Health.Status}}', name]) !== 'healthy') {
    if (Date.now() >= deadline) throw new Error('Container werd niet gezond binnen 25 seconden');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  docker(['exec', name, 'node', '--input-type=module', '-e', `
    const health = await fetch('http://127.0.0.1:3000/health').then(r => r.json());
    const response = await fetch('http://127.0.0.1:3000/api/dashboard');
    const data = await response.json();
    if (process.getuid() === 0 || health.mode !== 'demo' || !response.ok || data.demo !== true || !data.sites?.length) process.exit(1);
  `]);
  console.log('Geslaagd: standaard containerstart, Docker-healthcheck en dashboard-API werken als niet-rootgebruiker.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Containercontrole mislukt');
  if (started) {
    const logs = spawnSync('docker', ['logs', '--tail', '40', name], { encoding: 'utf8' });
    console.error(logs.stdout || logs.stderr);
  }
  process.exitCode = 1;
} finally {
  if (started) spawnSync('docker', ['rm', '--force', name], { stdio: 'ignore' });
}
