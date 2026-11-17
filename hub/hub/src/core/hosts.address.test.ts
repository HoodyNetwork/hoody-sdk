// portAddress and maskAddress: the one port address and the one on-screen mask every page uses.
import { afterEach, describe, expect, it } from 'vitest';
import { maskAddress, portAddress, setProxyDomain } from './hosts';

const project = { id: '6a0000000000000000000001' };
const container = { id: 'c0ffee0000000000000000aa', server_name: 'n12' };

afterEach(() => {
  setProxyDomain(null);
});

describe('portAddress', () => {
  it('names the http port on the proxy domain', () => {
    setProxyDomain('proxy.example');
    expect(portAddress(project, container, 8080)).toBe(`https://${project.id}-${container.id}-http-8080.n12.proxy.example`);
    expect(portAddress(project, container, 1, 'terminal')).toBe(`https://${project.id}-${container.id}-terminal-1.n12.proxy.example`);
  });

  it('is empty without a server or a computer', () => {
    setProxyDomain('proxy.example');
    expect(portAddress(project, { id: container.id }, 8080)).toBe('');
    expect(portAddress(null, container, 8080)).toBe('');
    expect(portAddress(project, null, 8080)).toBe('');
  });

  // Vitest runs in fixture mode (__HUB_FIXTURES__ folds to true); a build folds the stand-in away.
  it('fixture mode with no proxy domain: the same address under hoody.example; still none without a server', () => {
    setProxyDomain('');
    expect(portAddress(project, container, 8080)).toBe(`https://${project.id}-${container.id}-http-8080.n12.hoody.example`);
    expect(portAddress(project, { id: container.id }, 8080)).toBe('');
  });
});

describe('maskAddress', () => {
  it('keeps the first and last four of every 24-hex run, and nothing else changes', () => {
    expect(maskAddress(`https://${project.id}-${container.id}-http-8080.n12.proxy.example`)).toBe('https://6a00…0001-c0ff…00aa-http-8080.n12.proxy.example');
    expect(maskAddress('https://shop.example.test')).toBe('https://shop.example.test');
    expect(maskAddress(undefined)).toBe('');
    expect(maskAddress(null)).toBe('');
  });

  it('masks uppercase and mixed-case ids too', () => {
    expect(maskAddress('https://6A00000000000000000000FF-c0FFee0000000000000000Aa-http-1.n12.proxy.example')).toBe('https://6A00…00FF-c0FF…00Aa-http-1.n12.proxy.example');
  });
});
