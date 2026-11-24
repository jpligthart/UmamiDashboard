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
const extraTags = setting('IMAGE_EXTRA_TAGS', '').split(/[\s,]+/).filter(Boolean);
const tags = [...new Set([version, ...extraTags])];
if (tags.some(tag => !/^[\w][\w.-]{0,127}$/.test(tag))) {
  console.error('IMAGE_TAG moet één geldige tag bevatten. Zet extra tags kommagescheiden in IMAGE_EXTRA_TAGS.'); process.exit(1);
}
const platforms = setting('IMAGE_PLATFORMS', 'linux/amd64,linux/arm64');
const source = setting('IMAGE_SOURCE', '');
if (!registry || !/^https:\/\//.test(source) || source.includes('example.invalid')) {
  console.error('Stel IMAGE_REGISTRY en de echte HTTPS-repository-URL in IMAGE_SOURCE in.'); process.exit(1);
}
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
if (revision.status !== 0) { console.error('Maak eerst een Git-commit voor een herleidbare image-revisie.'); process.exit(1); }
const labels = { IMAGE_SOURCE: source, IMAGE_VERSION: version, IMAGE_REVISION: revision.stdout.trim(), IMAGE_CREATED: new Date().toISOString() };
for (const service of ['api', 'web']) {
  const args = ['buildx', 'build', '--platform', platforms, '--file', `Dockerfile.${service}`];
  for (const tag of tags) args.push('--tag', `${registry.replace(/\/$/, '')}/umami-dashboard-${service}:${tag}`);
  args.push('--push');
  for (const [key, value] of Object.entries(labels)) args.push('--build-arg', `${key}=${value}`);
  args.push('.');
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify({ command: 'docker', args }, null, 2)); continue; }
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
