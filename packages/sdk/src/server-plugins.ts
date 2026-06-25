import type { Hono } from 'hono';
import type { EntitlementProvider } from './entitlements';

export interface PluginContext {
  entitlements: EntitlementProvider;
}

export interface ServerPlugin {
  /** Mounts routes under /api/ee/<name>. Must be unique across the install. */
  name: string;
  register(app: Hono, ctx: PluginContext): void;
}

export interface ServerPluginRegistry {
  add(plugin: ServerPlugin): void;
  list(): readonly ServerPlugin[];
  registerAll(app: Hono, ctx: PluginContext): void;
}

export function createServerPluginRegistry(): ServerPluginRegistry {
  const plugins = new Map<string, ServerPlugin>();
  return {
    add(plugin) {
      if (plugins.has(plugin.name)) {
        throw new Error(`Duplicate server plugin: ${plugin.name}`);
      }
      plugins.set(plugin.name, plugin);
    },
    list: () => [...plugins.values()],
    registerAll(app, ctx) {
      for (const plugin of plugins.values()) plugin.register(app, ctx);
    },
  };
}
