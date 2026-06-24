// @vitest-environment node
// PGlite's WASM init needs a complete fetch/Blob (node), not the jsdom mock; the
// real browser path is validated by the Playwright e2e. node-vs-jsdom here is a
// test-isolation choice, not a portability concern (the spike proved browsers).
import { describe, it, expect } from 'vitest';
import { createDemoDb } from './demoDb';
import { seedDemo } from '../../../../packages/db/src/seed-data';
import { markdownToTiptap } from '../../../../apps/api/src/lib/markdown';
import { features } from '../../../../packages/db/src/schema';

const stubHash = async () => 'demo-no-login';

/**
 * G1 — zero persistence. Each demo boot is a fresh in-memory PGlite. A real page
 * refresh tears down the whole JS context, so the only thing that proves "nothing
 * saves" within one process is that an independently-constructed demo db is
 * unaffected by mutations to a prior one.
 */
describe('demo zero-persistence (G1)', () => {
  it('a fresh demo db is unaffected by mutations to a previous one', async () => {
    const a = await createDemoDb();
    await seedDemo(a.db, markdownToTiptap, stubHash);
    const baseline = (await a.db.select().from(features)).length;
    expect(baseline).toBeGreaterThan(0);

    // Mutate instance A: wipe its features.
    await a.db.delete(features);
    expect((await a.db.select().from(features)).length).toBe(0);

    // A real refresh tears down the page, so only one PGlite is ever live at a
    // time; close A before standing up the "refreshed" instance.
    await a.client.close();

    // A brand-new demo db (what a refresh produces) carries the full seed again —
    // none of A's mutations carried over. That IS the zero-persistence guarantee.
    const b = await createDemoDb();
    await seedDemo(b.db, markdownToTiptap, stubHash);
    expect((await b.db.select().from(features)).length).toBe(baseline);
    await b.client.close();
  });
});
