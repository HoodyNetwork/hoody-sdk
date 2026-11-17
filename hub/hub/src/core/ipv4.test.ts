// ipv4.test.ts: the shared IPv4 allow list rules (Keys and Bots).
import { describe, expect, it } from 'vitest';
import { ALLOWLIST_MAX, appendIp, ipv4Problem, myIpRoute, parseAllowlist, privateV4 } from './index';

describe('ipv4Problem', () => {
  it('accepts canonical addresses and CIDRs with zero host bits; rejects, never repairs', () => {
    expect(ipv4Problem('203.0.113.7')).toBeNull();
    expect(ipv4Problem('203.0.113.0/24')).toBeNull();
    expect(ipv4Problem('0.0.0.0/0')).toBeNull();
    expect(ipv4Problem('::1')).toBe('ipv6');
    expect(ipv4Problem('203.0.113')).toBe('bad_ip');
    expect(ipv4Problem('203.0.113.07')).toBe('bad_ip');
    expect(ipv4Problem('203.0.113.256')).toBe('bad_ip');
    expect(ipv4Problem('203.0.113.0/33')).toBe('bad_prefix');
    expect(ipv4Problem('203.0.113.0/024')).toBe('bad_prefix');
    expect(ipv4Problem('203.0.113.7/24')).toBe('host_bits');
  });
});

describe('parseAllowlist / appendIp / privateV4', () => {
  it('splits on spaces, commas and new lines; dedupes; reports rejects and too many', () => {
    const p = parseAllowlist('1.2.3.4, 1.2.3.4\n5.6.7.0/24  bad ::1');
    expect(p.entries).toEqual(['1.2.3.4', '5.6.7.0/24']);
    expect(p.errors).toEqual([{ entry: 'bad', code: 'bad_ip' }, { entry: '::1', code: 'ipv6' }]);
    expect(p.tooMany).toBe(false);
    expect(parseAllowlist('').entries).toEqual([]);
    const many = Array.from({ length: ALLOWLIST_MAX + 1 }, (_, i) => `10.0.${i}.1`).join(' ');
    expect(parseAllowlist(many).tooMany).toBe(true);
    expect(parseAllowlist('1.1.1.1 2.2.2.2', 1).tooMany).toBe(true);
  });
  it('appendIp adds once and keeps every typed part, a rejected one included', () => {
    expect(appendIp('', '1.2.3.4')).toBe('1.2.3.4');
    expect(appendIp('5.6.7.8, oops', '1.2.3.4')).toBe('5.6.7.8, oops, 1.2.3.4');
    expect(appendIp('1.2.3.4', '1.2.3.4')).toBe('1.2.3.4');
  });
  it('privateV4: private, loopback, link-local and shared ranges', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '0.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '100.127.0.1']) expect(privateV4(ip)).toBe(true);
    for (const ip of ['172.32.0.1', '100.128.0.1', '203.0.113.7', 'nope']) expect(privateV4(ip)).toBe(false);
  });
  it('myIpRoute is GET /ip on the base host only', () => {
    expect(myIpRoute).toMatchObject({ method: 'GET', path: '/ip', scope: 'base', baseOnly: true });
  });
});
