import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';

// Playwright transpiles specs to CJS (no "type": "module" at the root), so __dirname is safe.
const repoRoot = path.resolve(__dirname, '..');

/** Wipe all tables and re-insert the dogfood seed. */
export function resetDb(): void {
  execFileSync('pnpm', ['db:reset'], { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('pnpm', ['db:seed'], { cwd: repoRoot, stdio: 'inherit' });
}

/** Playwright globalSetup: start every run from a known seeded state. */
export default function globalSetup(): void {
  resetDb();
}

// ---- minimal API shapes (mirrors @productmap/shared without a runtime dep) ----

export interface FeatureLike {
  id: string;
  title: string;
  horizon: 'now' | 'next' | 'later';
  status: string;
  startDate: string | null;
  endDate: string | null;
  documents: { id: string; type: string; title: string; status: string }[];
}

export async function getFeatures(request: APIRequestContext): Promise<FeatureLike[]> {
  const res = await request.get('/api/features');
  if (!res.ok()) throw new Error(`GET /api/features failed: ${res.status()}`);
  return (await res.json()) as FeatureLike[];
}

export async function getFeatureByTitle(
  request: APIRequestContext,
  title: string,
): Promise<FeatureLike> {
  const features = await getFeatures(request);
  const feature = features.find((f) => f.title === title);
  if (!feature) throw new Error(`No feature titled '${title}'`);
  return feature;
}

export async function createDocument(
  request: APIRequestContext,
  body: { featureId: string; type: string; title: string; fromTemplate: boolean },
): Promise<{ id: string }> {
  const res = await request.post('/api/documents', { data: body });
  if (res.status() !== 201) throw new Error(`POST /api/documents failed: ${res.status()}`);
  return (await res.json()) as { id: string };
}

/** Shift an ISO yyyy-MM-dd date by whole days (UTC-safe). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 1×1 red PNG for upload tests. */
export const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** SSE body used to mock POST /api/ai/generate-doc. */
export const MOCK_SSE_BODY = [
  'event: chunk\ndata: {"text":"# Demo draft\\n\\n## Overview\\nThis document was "}\n\n',
  'event: chunk\ndata: {"text":"streamed from a mocked SSE endpoint.\\n\\n"}\n\n',
  'event: chunk\ndata: {"text":"## Requirements\\n- Must stream progressively\\n- Must end structured\\n"}\n\n',
  'event: done\ndata: {}\n\n',
].join('');
