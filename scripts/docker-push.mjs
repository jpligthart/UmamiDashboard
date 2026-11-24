import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Parse only IMAGE_* settings; never source .env or export application secrets.
const settings = {};
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(IMAGE_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) settings[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const setting = (key, fallback) => process.env[key] || settings[key] || fallback;
const registry = setting('IMAGE_REGISTRY', '');
const version = setting('IMAGE_TAG', 'latest');
const platforms = setting('IMAGE_PLATFORMS', 'linux/amd64,linux/arm64');
const source = setting('IMAGE_SOURCE', '');
if (!registry || !/^https:\/\//.test(source) || source.includes('example.invalid')) {
  console.error('Stel IMAGE_REGISTRY en de echte HTTPS-repository-URL in IMAGE_SOURCE in.'); process.exit(1);
}
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
if (revision.status !== 0) { console.error('Maak eerst een Git-commit voor een herleidbare image-revisie.'); process.exit(1); }
const labels = { IMAGE_SOURCE: source, IMAGE_VERSION: version, IMAGE_REVISION: revision.stdout.trim(), IMAGE_CREATED: new Date().toISOString() };
for (const service of ['api', 'web']) {
  const args = ['buildx', 'build', '--platform', platforms, '--file', `Dockerfile.${service}`, '--tag', `${registry.replace(/\/$/, '')}/umami-dashboard-${service}:${version}`, '--push'];
  for (const [key, value] of Object.entries(labels)) args.push('--build-arg', `${key}=${value}`);
  args.push('.');
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
