import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeConfig } from '../src/init-config.js';

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'umami-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const defaults = join(root, 'defaults.json');
  writeFileSync(defaults, '{"title":"Standaard"}');
  return { path: join(root, 'config', 'dashboard.json'), defaults };
}
test('first start creates a complete config and subsequent starts preserve user settings', t => {
  const f = fixture(t);
  assert.equal(initializeConfig(f.path, f.defaults), 'created');
  const created = JSON.parse(readFileSync(f.path, 'utf8'));
  assert.equal(created.title, 'Standaard'); assert.equal(created.discovery, 'auto');
  const custom = '{"title":"Mijn eigen titel","sites":[]}\n';
  writeFileSync(f.path, custom);
  assert.equal(initializeConfig(f.path, f.defaults), 'existing');
  assert.equal(readFileSync(f.path, 'utf8'), custom);
});
test('repairs an empty dashboard.json directory left by old Docker mounts', t => {
  const f = fixture(t); mkdirSync(f.path, { recursive: true });
  assert.equal(initializeConfig(f.path, f.defaults), 'created');
  assert.equal(JSON.parse(readFileSync(f.path, 'utf8')).title, 'Standaard');
});
test('preserves invalid custom config and non-empty directories instead of resetting them', t => {
  const f = fixture(t); mkdirSync(f.path, { recursive: true });
  writeFileSync(join(f.path, 'keep.txt'), 'keep');
  assert.throws(() => initializeConfig(f.path, f.defaults));
  assert.equal(readFileSync(join(f.path, 'keep.txt'), 'utf8'), 'keep');
  const invalid = join(f.path, 'invalid.json'); writeFileSync(invalid, '{broken');
  assert.throws(() => initializeConfig(invalid, f.defaults));
  assert.equal(readFileSync(invalid, 'utf8'), '{broken');
});
