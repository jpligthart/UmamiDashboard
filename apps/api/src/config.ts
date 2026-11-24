import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { z } from 'zod';

const siteSchema = z.object({
  id: z.uuid(), name: z.string().min(1).optional(), domain: z.string().optional(),
  group: z.string().default('Applicaties'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  hidden: z.boolean().default(false), order: z.number().default(100),
}).strict();
export const configSchema = z.object({
  title: z.string().default('Mijn overzicht'),
  timezone: z.string().refine(value => DateTime.now().setZone(value).isValid, 'Ongeldige tijdzone').default('Europe/Amsterdam'),
  discovery: z.enum(['auto', 'manual']).default('auto'),
  refreshSeconds: z.number().int().min(15).max(3600).default(60),
  cacheSeconds: z.number().int().min(5).max(300).default(30),
  columns: z.array(z.enum(['active', 'visitors', 'pageviews', 'visits', 'bounce', 'trend'])).min(1)
    .default(['active', 'visitors', 'pageviews', 'visits', 'bounce', 'trend']),
  sites: z.array(siteSchema).default([]),
}).strict().superRefine((config, ctx) => {
  if (new Set(config.sites.map(site => site.id)).size !== config.sites.length)
    ctx.addIssue({ code: 'custom', message: 'Applicatie-ID’s moeten uniek zijn', path: ['sites'] });
  if (new Set(config.columns).size !== config.columns.length)
    ctx.addIssue({ code: 'custom', message: 'Kolommen moeten uniek zijn', path: ['columns'] });
});
export type Config = z.infer<typeof configSchema>;
export function loadConfig(path: string): Config {
  return configSchema.parse(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')));
}
