// The proxy domain's source on the web (hosts.ts via hostEnv().proxyDomain): unchanged from
// before the move: the page's data-proxy-domain attribute, an unrendered {{placeholder}} read as none, the override
// still first. The terminal side (no read at all) is term/app/live-ends.term.test.tsx 'no agent routing, no trap'.
import { afterEach, describe, expect, it } from 'vitest';
import { proxyDomain, setProxyDomain } from './hosts';
import { hostEnv } from './host-env';

afterEach(() => { document.documentElement.removeAttribute('data-proxy-domain'); setProxyDomain(null); });

describe('proxy domain on the web', () => {
  it('reads the page attribute through the host env', () => {
    setProxyDomain(null);
    document.documentElement.setAttribute('data-proxy-domain', 'proxy.example.test');
    expect(hostEnv().proxyDomain).toBe('proxy.example.test');
    expect(proxyDomain()).toBe('proxy.example.test');
  });
  it('an unrendered placeholder or no attribute is none; the override wins', () => {
    setProxyDomain(null);
    expect(proxyDomain()).toBe('');
    document.documentElement.setAttribute('data-proxy-domain', '{{PROXY_DOMAIN}}');
    expect(proxyDomain()).toBe('');
    setProxyDomain('fixed.example.test');
    expect(proxyDomain()).toBe('fixed.example.test');
  });
  it('the page route is the location hash', () => {
    const before = window.location.hash;
    window.location.hash = '#/keys/new';
    expect(hostEnv().pageRoute).toBe('#/keys/new');
    window.location.hash = before;
  });
});
