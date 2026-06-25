import { describe, it, expect, vi } from 'vitest';
import { createServerPluginRegistry, type ServerPlugin } from './server-plugins';
import { createCommunityProvider } from './entitlements';

const ctx = { entitlements: createCommunityProvider() };
const fakeApp = {} as never;

function fakePlugin(name: string): ServerPlugin {
  return { name, register: vi.fn() };
}

describe('server plugin registry', () => {
  it('registers all added plugins exactly once', () => {
    const reg = createServerPluginRegistry();
    const a = fakePlugin('a');
    const b = fakePlugin('b');
    reg.add(a);
    reg.add(b);
    reg.registerAll(fakeApp, ctx);
    expect(a.register).toHaveBeenCalledWith(fakeApp, ctx);
    expect(b.register).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate plugin names', () => {
    const reg = createServerPluginRegistry();
    reg.add(fakePlugin('dup'));
    expect(() => reg.add(fakePlugin('dup'))).toThrow(/dup/);
  });

  it('starts empty', () => {
    expect(createServerPluginRegistry().list()).toHaveLength(0);
  });
});
