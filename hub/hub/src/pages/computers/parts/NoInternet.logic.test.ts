// "No internet": the switch's state comes from the rules alone; nextStep names the ONE change to send next.
import { describe, expect, it } from 'vitest';
import type { FwList, FwRule } from './Firewall.logic';
import { inPlace, NO_INTERNET_MARK, NO_INTERNET_RULES, nextStep, noInternetState } from './NoInternet.logic';

const list = (egress: FwRule[], o: Partial<FwList> = {}): FwList => ({ computer: 'c', ingress: [], egress, unreadable: 0, unreadableIn: 0, unreadableOut: 0, count: null, maxRules: null, bytes: null, maxBytes: null, ...o });
const [TCP, UDP, PING] = NO_INTERNET_RULES as [FwRule, FwRule, FwRule];
const MAIL: FwRule = { direction: 'egress', action: 'drop', protocol: 'tcp', description: 'No outbound mail', destination_port: '25', state: 'enabled' };

describe('No internet state', () => {
  it('the group: three outbound drops without a destination (every TCP and UDP port, and IPv4 ICMP), one fixed marker', () => {
    expect(NO_INTERNET_RULES.map((r) => [r.direction, r.action, r.protocol, r.destination_port ?? '', r.destination ?? '', r.description])).toEqual([
      ['egress', 'drop', 'tcp', '1-65535', '', NO_INTERNET_MARK],
      ['egress', 'drop', 'udp', '1-65535', '', NO_INTERNET_MARK],
      ['egress', 'drop', 'icmp4', '', '', NO_INTERNET_MARK],
    ]);
  });
  it('all three once = on; none = off; other rules do not count', () => {
    expect(noInternetState(list([MAIL, TCP, UDP, PING]))).toBe('on');
    expect(noInternetState(list([MAIL]))).toBe('off');
    expect(noInternetState(list([]))).toBe('off');
  });
  it('some, a marked one off, a changed one, a marked inbound rule, or an identical copy = partial', () => {
    expect(noInternetState(list([TCP]))).toBe('partial');
    expect(noInternetState(list([TCP, UDP, { ...PING, state: 'disabled' }]))).toBe('partial');
    expect(noInternetState(list([TCP, UDP, PING, { ...TCP, destination_port: '80' }]))).toBe('partial');
    expect(noInternetState(list([TCP, UDP, PING], { ingress: [{ ...TCP, direction: 'ingress' }] }))).toBe('partial');
    expect(noInternetState(list([TCP, UDP, PING, { ...TCP }]))).toBe('partial');
  });
  it('nothing read, or any rule the page could not read = unknown (never off)', () => {
    expect(noInternetState(undefined)).toBe('unknown');
    expect(noInternetState(list([], { unreadable: 1, unreadableOut: 1 }))).toBe('unknown');
    expect(noInternetState(list([TCP, UDP, PING], { unreadable: 1, unreadableIn: 1 }))).toBe('unknown');
  });
  it('in place counts the switch\'s own exact rules', () => {
    expect(inPlace(list([TCP, { ...PING, state: 'disabled' }]))).toBe(1);
    expect(inPlace(list([TCP, UDP, PING]))).toBe(3);
  });
});

describe('No internet: the next change', () => {
  it('on: adds the first missing rule; an off marked rule is removed first; all there = done', () => {
    expect(nextStep(list([UDP]), 'on')).toEqual({ kind: 'add', rule: TCP });
    const off = { ...PING, state: 'disabled' as const };
    expect(nextStep(list([TCP, UDP, off]), 'on')).toEqual({ kind: 'remove', rule: off });
    expect(nextStep(list([TCP, UDP, PING]), 'on')).toEqual({ kind: 'done' });
  });
  it('off: removes marked rules one at a time and no other rule; none left = done', () => {
    expect(nextStep(list([MAIL, TCP, UDP, PING]), 'off')).toEqual({ kind: 'remove', rule: TCP });
    expect(nextStep(list([MAIL]), 'off')).toEqual({ kind: 'done' });
  });
  it('overlapping marked rules: the one the host would pick first goes first (a later one waits for the next read)', () => {
    const wide = { ...TCP, destination_port: '80' };
    const narrow = { ...TCP, destination_port: '80', destination: '203.0.113.5' };
    // narrow listed first: its fields do not match wide (wide has no destination), so it is the host's pick.
    expect(nextStep(list([narrow, wide]), 'off')).toEqual({ kind: 'remove', rule: narrow });
    // wide listed first: the host picks wide for wide's fields; narrow's fields would also pick narrow only.
    expect(nextStep(list([wide, narrow]), 'off')).toEqual({ kind: 'remove', rule: wide });
    // a broader marked rule listed BEFORE would be hit by the narrow one's fields? No: a sent field must equal; an
    // unsent one matches anything, so only a rule with every sent field equal (a superset) is hit.
    const superset = { ...UDP, destination: '198.51.100.1' };
    expect(nextStep(list([superset, UDP]), 'off')).toEqual({ kind: 'remove', rule: superset });
    expect(nextStep(list([UDP, superset]), 'off')).toEqual({ kind: 'remove', rule: UDP });
  });
  it('identical marked rules are blocked as twins (one delete leaves its twin: no read could prove it)', () => {
    expect(nextStep(list([UDP, { ...UDP }]), 'off')).toEqual({ kind: 'blocked', why: 'twins' });
    expect(nextStep(list([TCP, UDP, PING, { ...TCP }]), 'on')).toEqual({ kind: 'blocked', why: 'twins' });
  });
  it('on: a marked stray the host would match against one of the three first: that one goes first, then the stray, then it comes back', () => {
    const wide: FwRule = { direction: 'egress', action: 'drop', protocol: 'tcp', description: NO_INTERNET_MARK, state: 'enabled' };
    expect(nextStep(list([MAIL, TCP, UDP, PING, wide]), 'on')).toEqual({ kind: 'remove', rule: TCP });
    expect(nextStep(list([MAIL, UDP, PING, wide]), 'on')).toEqual({ kind: 'remove', rule: wide });
    expect(nextStep(list([MAIL, UDP, PING]), 'on')).toEqual({ kind: 'add', rule: TCP });
    // off: the same list removes the three first (each is the host's pick for itself), never the mail rule.
    expect(nextStep(list([MAIL, TCP, UDP, PING, wide]), 'off')).toEqual({ kind: 'remove', rule: TCP });
  });
  it('a read with an unreadable rule decides nothing', () => {
    expect(nextStep(list([TCP], { unreadable: 1, unreadableOut: 1 }), 'on')).toEqual({ kind: 'unknown' });
  });
});
