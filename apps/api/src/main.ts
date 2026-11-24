import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createApp } from './server.js';

try {
  const config = loadConfig(process.env.DASHBOARD_CONFIG ?? fileURLToPath(new URL('../../../config/dashboard.json', import.meta.url)));
  const demo = process.argv.includes('--demo') || process.env.DEMO_MODE === 'true';
  const port = Number(process.env.PORT ?? 18472);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ongeldige PORT');
  const server = createApp(config, { demo, url: process.env.UMAMI_URL, key: process.env.UMAMI_API_KEY });
  server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Dashboard API luistert op poort ${port} (${demo ? 'DEMO' : 'live'}).`));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
} catch {
  console.error('API kon niet starten. Controleer dashboard.json, DASHBOARD_CONFIG, UMAMI_URL en PORT.');
  process.exit(1);
}
