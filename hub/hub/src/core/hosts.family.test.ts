// familyDomains / hostUnderFamily: a proxy domain under a host family label stands for both families
// (`computers.x` and `containers.x`); any other domain stands for itself. Exact suffix only.
import { describe, expect, it } from 'vitest';
import { familyDomains, hostUnderFamily } from './index';

describe('familyDomains', () => {
  it('gives both families for a domain whose first label is a family label', () => {
    expect(familyDomains('computers.example.test')).toEqual(['computers.example.test', 'containers.example.test']);
    expect(familyDomains(' Containers.Hdyn.Network. ')).toEqual(['computers.hdyn.network', 'containers.hdyn.network']);
  });
  it('gives the domain itself otherwise, and nothing for an empty one', () => {
    expect(familyDomains('proxy.example')).toEqual(['proxy.example']);
    expect(familyDomains('a.computers.example')).toEqual(['a.computers.example']);
    expect(familyDomains('computers')).toEqual(['computers']);
    expect(familyDomains('')).toEqual([]);
    expect(familyDomains(' . ')).toEqual([]);
  });
});

describe('hostUnderFamily', () => {
  const D = 'computers.example.test';
  it('takes subdomains and the domain itself on both families', () => {
    expect(hostUnderFamily('a.srv.computers.example.test', D)).toBe(true);
    expect(hostUnderFamily('a.srv.containers.example.test', D)).toBe(true);
    expect(hostUnderFamily('containers.example.test', D)).toBe(true);
    expect(hostUnderFamily('A.SRV.CONTAINERS.EXAMPLE.TEST.', D)).toBe(true);
  });
  it('strict leaves the domain itself out', () => {
    expect(hostUnderFamily('containers.example.test', D, true)).toBe(false);
    expect(hostUnderFamily('a.containers.example.test', D, true)).toBe(true);
  });
  it.each([
    'evilcomputers.example.test',
    'a.containers.example.test.evil.org',
    'a.containers.other.example',
    'example.test',
    'computersexample.test',
    '',
  ])('refuses %j', (h) => {
    expect(hostUnderFamily(h, D)).toBe(false);
  });
  it('refuses everything for an empty domain', () => {
    expect(hostUnderFamily('a.containers.example.test', '')).toBe(false);
  });
});
