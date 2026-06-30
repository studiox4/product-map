import type { Hono } from 'hono';
import { createServerPluginRegistry } from '@productmap/sdk';
import { getEntitlements } from './middleware/entitlements';

// Core registers ZERO plugins. The private edition imports this singleton and
// calls `serverPlugins.add(...)` before `installServerPlugins(app)` at its boot.
export const serverPlugins = createServerPluginRegistry();

export function installServerPlugins(app: Hono): void {
  serverPlugins.registerAll(app, { entitlements: getEntitlements() });
}
