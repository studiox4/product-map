import type { Hono } from 'hono';
import type { EntitlementProvider } from './entitlements';

export interface PluginContext {
  entitlements: EntitlementProvider;
}

export interface ServerPlugin {
  /** Mounts routes under /api/ee/<name>. Must be unique across the install. */
  name: string;
  // `any` env is intentional: plugins mount routes on the host app regardless
  // of how the core typed its Variables/Bindings — constraining to BlankEnv
  // would reject every real app instance (e.g. Hono<AuthEnv, …>).
  register(app: Hono<any, any, any>, ctx: PluginContext): void;
}

export interface ServerPluginRegistry {
  add(plugin: ServerPlugin): void;
  list(): readonly ServerPlugin[];
  // See ServerPlugin.register for why `any` env is correct here.
  registerAll(app: Hono<any, any, any>, ctx: PluginContext): void;
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
