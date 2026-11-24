import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configSchema, loadConfig } from './config.js';

export function initializeConfig(path: string, defaultsPath: string): 'created' | 'existing' {
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (info.isDirectory() && readdirSync(path).length === 0) {
      // Repair only the empty directory created by older file bind mounts.
      rmdirSync(path);
    } else {
      if (!info.isFile()) throw new Error('dashboard.json moet een normaal bestand zijn; bestaande gegevens zijn niet gewijzigd.');
      try { loadConfig(path); } catch { throw new Error('Bestaande dashboard.json is ongeldig; het bestand is niet overschreven.'); }
      return 'existing';
    }
  }
  const defaults = configSchema.parse(JSON.parse(readFileSync(defaultsPath, 'utf8').replace(/^\uFEFF/, '')));
  mkdirSync(dirname(path), { recursive: true });
  try { writeFileSync(path, JSON.stringify(defaults, null, 2) + '\n', { flag: 'wx', mode: 0o644 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') { loadConfig(path); return 'existing'; }
    throw error;
  }
  return 'created';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = initializeConfig(process.env.DASHBOARD_CONFIG ?? '/app/config/dashboard.json', process.env.DASHBOARD_DEFAULT_CONFIG ?? '/app/defaults/dashboard.json');
    console.log(result === 'created' ? 'Standaard dashboard.json aangemaakt.' : 'Bestaande dashboard.json behouden.');
  } catch (error) {
    console.error('Configuratie kon niet worden voorbereid. Controleer bestandstype, JSON-inhoud en schrijfrechten van de configuratiemap.');
    if (error instanceof Error && /^dashboard.json|^Bestaande dashboard.json/.test(error.message)) console.error(error.message);
    process.exitCode = 1;
  }
}
