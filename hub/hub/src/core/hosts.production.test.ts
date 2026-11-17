// @vitest-environment node
// The production build of hosts.ts. Vitest compiles every file with __HUB_FIXTURES__ = true, so
// this test compiles hosts.ts the way a production build does (vite's define: __HUB_FIXTURES__ -> false), evaluates
// that module, and checks it: no proxy domain means no address at all, never the hoody.example fixture stand-in.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type * as HostsModule from './hosts';

type Hosts = typeof HostsModule;

function compile(fixtures: boolean): Hosts {
  const source = readFileSync(new URL('./hosts.ts', import.meta.url), 'utf8');
  expect(source).toContain('__HUB_FIXTURES__');
  const defined = source.replace(/\b__HUB_FIXTURES__\b/g, JSON.stringify(fixtures));
  const { outputText } = ts.transpileModule(defined, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} as Record<string, unknown> };
  // hosts.ts's one runtime import is the host env (the proxy domain's source): a host with no proxy domain, as a page
  // without the attribute. Any other import fails: compile it with that module too.
  const hostEnvStub = { hostEnv: () => ({ proxyDomain: null }) };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, (id: string) => {
    if (id === './host-env') return hostEnvStub;
    throw new Error(`hosts.ts gained a runtime import (${id}): compile it with that module too`);
  });
  return mod.exports as unknown as Hosts;
}

const project = { id: '6a0000000000000000000001' };
const container = { id: 'c0a7150000000000000000a1', server_name: 'n12' };

describe('hosts.ts as a production build compiles it (fixtures off)', () => {
  it('no proxy domain: portAddress is empty, with no hoody.example stand-in', () => {
    const h = compile(false);
    h.setProxyDomain('');
    expect(h.portAddress(project, container, 3000)).toBe('');
    expect(h.portAddress(project, container, 8080, 'http')).toBe('');
    expect(h.buildPortUrl(project, container, 'http', 3000)).toBe('');
  });

  it('a proxy domain: the real address, the same one the fixture build gives', () => {
    const h = compile(false);
    h.setProxyDomain('proxy.example.test');
    expect(h.portAddress(project, container, 3000)).toBe(`https://${project.id}-${container.id}-http-3000.n12.proxy.example.test`);
  });

  it('no server name or no target: empty, whatever the build', () => {
    for (const fixtures of [false, true]) {
      const h = compile(fixtures);
      h.setProxyDomain('proxy.example.test');
      expect(h.portAddress(project, { id: container.id }, 3000)).toBe('');
      expect(h.portAddress(null, container, 3000)).toBe('');
    }
  });

  it('control: the same source compiled for fixtures does fall back to hoody.example (so the test compiles what it claims)', () => {
    const h = compile(true);
    h.setProxyDomain('');
    expect(h.portAddress(project, container, 3000)).toBe(`https://${project.id}-${container.id}-http-3000.n12.hoody.example`);
  });
});
