import type { Hono } from 'hono';
import { createServerPluginRegistry } from '@productmap/sdk';
import { getEntitlements } from './middleware/entitlements';

// Core registers ZERO plugins. The private edition imports this singleton and
// calls `serverPlugins.add(...)` before `installServerPlugins(app)` at its boot.
export const serverPlugins = createServerPluginRegistry();

// `any` env mirrors the SDK contract: the host app's typed env is irrelevant
// to plugin mounting — see packages/sdk/src/server-plugins.ts for rationale.
export function installServerPlugins(app: Hono<any, any, any>): void {
  serverPlugins.registerAll(app, { entitlements: getEntitlements() });
}
