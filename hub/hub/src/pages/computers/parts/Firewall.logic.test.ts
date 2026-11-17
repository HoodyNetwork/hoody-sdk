// Computer firewall: the pure rules behind the Network tab's Firewall section. What a list answer reads
// as, each rule in words, the form's checks (the Hoody API's own), the lock-out warning, presets, edit planning,
// what a fresh read proves, and the secret-free Agent snapshot.
import { ASK_CONTEXT_MARK, ASK_MAX_TEXT, agentStartText, makeT } from '@kit';
import { describe, expect, it } from 'vitest';
import {
  KIT_PORTS,
  addProved,
  blankForm,
  bodyOf,
  complementSpans,
  cutsOff,
  editPlan,
  matchBodyOf,
  matchesOf,
  formOf,
  formProblems,
  listOf,
  presetRules,
  removeProved,
  resetProved,
  exactKey,
  ruleKey,
  shapeKey,
  ruleSentence,
  snapshotText,
  agentSafe,
  agentStartOf,
  blocksSsh,
  summaryOf,
  toggleProved,
  type FwRule,
} from './Firewall.logic';
import strings from './Firewall.strings.en.json';

const t = makeT(strings);
const ID = 'c'.repeat(24);
const rule = (r: Partial<FwRule> = {}): FwRule => ({ direction: 'ingress', action: 'drop', protocol: 'tcp', description: 'Block web', destination_port: '80', state: 'enabled', ...r });

describe('firewall: a list answer', () => {
  it('reads both directions, the capacity gauge, and drops nothing silently', () => {
    const l = listOf({ data: {
      ingress: [{ action: 'allow', protocol: 'tcp', description: 'web', destination_port: '443', source: '0.0.0.0/0', state: 'enabled' }, { action: 'boom', protocol: 'tcp', description: 'x' }],
      egress: [{ action: 'drop', protocol: 'tcp', description: 'mail', destination_port: '25', destination: '0.0.0.0/0', state: 'disabled' }],
      rule_count: 3, max_rules: 500, byte_count: 900, max_bytes: 262144,
    } }, ID);
    expect(l).not.toBeNull();
    expect(l!.computer).toBe(ID);
    expect(l!.ingress).toHaveLength(1);
    expect(l!.ingress[0]).toMatchObject({ direction: 'ingress', action: 'allow', source: '0.0.0.0/0' });
    expect(l!.egress[0]).toMatchObject({ direction: 'egress', state: 'disabled', destination: '0.0.0.0/0' });
    expect(l!.unreadable).toBe(1);
    expect(l).toMatchObject({ count: 3, maxRules: 500 });
  });
  it('an answer without both lists is unreadable, never "no rules"', () => {
    expect(listOf({ data: { ingress: [] } }, ID)).toBeNull();
    expect(listOf(null, ID)).toBeNull();
    expect(listOf({ data: { ingress: [], egress: [] } }, ID)).toMatchObject({ ingress: [], egress: [], unreadable: 0 });
  });
  it('a missing state reads as on (the API default)', () => {
    expect(listOf({ data: { ingress: [{ action: 'drop', protocol: 'udp', description: 'd', destination_port: '53' }], egress: [] } }, ID)!.ingress[0]?.state).toBe('enabled');
  });
});

describe('firewall: each rule in words', () => {
  it('says the action, protocol, ports and addresses', () => {
    expect(ruleSentence(rule({ action: 'allow', destination_port: '443', source: '0.0.0.0/0' }), t)).toBe('Allow TCP port 443 from anywhere');
    expect(ruleSentence(rule({ direction: 'egress', action: 'drop', destination_port: '25', destination: '10.0.0.0/8' }), t)).toBe('Block TCP port 25 to 10.0.0.0/8');
    expect(ruleSentence(rule({ action: 'reject', protocol: 'udp', destination_port: '80,443', source: '1.2.3.4, 5.6.7.0/24' }), t)).toBe('Refuse UDP ports 80, 443 from 1.2.3.4, 5.6.7.0/24');
    expect(ruleSentence(rule({ destination_port: '1000-2000' }), t)).toBe('Block TCP ports 1000-2000 from anywhere');
    expect(ruleSentence(rule({ direction: 'egress', destination_port: '53' }), t)).toBe('Block TCP port 53 to anywhere');
  });
  it('ping and other ICMP', () => {
    expect(ruleSentence(rule({ protocol: 'icmp4', destination_port: undefined, icmp_type: '8' }), t)).toBe('Block ping from anywhere');
    expect(ruleSentence(rule({ protocol: 'icmp4', destination_port: undefined }), t)).toBe('Block all ICMP from anywhere');
    expect(ruleSentence(rule({ protocol: 'icmp4', destination_port: undefined, icmp_type: '3', icmp_code: '1' }), t)).toBe('Block ICMP type 3 code 1 from anywhere');
  });
  it('a source port filter is said too', () => {
    expect(ruleSentence(rule({ source_port: '1024-65535' }), t)).toBe('Block TCP port 80 from anywhere (source ports 1024-65535)');
  });
});

describe('firewall: the form checks what the Hoody API checks', () => {
  const f = (o: Partial<ReturnType<typeof blankForm>>) => ({ ...blankForm('ingress'), description: 'd', ports: '80', ...o });
  it('ports: 1-65535, low-high, lists', () => {
    expect(formProblems(f({ ports: '80,443,8000-8100' }))).toEqual({});
    expect(formProblems(f({ ports: '0' })).ports).toBe('bad');
    expect(formProblems(f({ ports: '70000' })).ports).toBe('bad');
    expect(formProblems(f({ ports: '90-80' })).ports).toBe('bad');
    expect(formProblems(f({ ports: '80-80' })).ports).toBe('bad');
    expect(formProblems(f({ ports: '' })).ports).toBe('needed');
    expect(formProblems(f({ ports: '1,'.repeat(40) + '2' })).ports).toBe('long');
  });
  it('addresses: empty is anywhere, else IPv4 or CIDR items', () => {
    expect(formProblems(f({ addresses: '' }))).toEqual({});
    expect(formProblems(f({ addresses: '203.0.113.5, 10.0.0.0/8' }))).toEqual({});
    expect(formProblems(f({ addresses: '999.1.1.1' })).addresses).toBe('bad');
    expect(formProblems(f({ addresses: '1.1.1.0/40' })).addresses).toBe('bad');
    expect(formProblems(f({ addresses: '01.2.3.4' })).addresses).toBe('bad');
    expect(formProblems(f({ addresses: '::1' })).addresses).toBe('bad');
    expect(formProblems(f({ addresses: Array(40).fill('203.0.113.255').join(',') })).addresses).toBe('long');
  });
  it('ICMP takes no ports, type and code are 0-255', () => {
    expect(formProblems(f({ protocol: 'icmp4', ports: '', icmpType: '8', icmpCode: '0' }))).toEqual({});
    expect(formProblems(f({ protocol: 'icmp4', ports: '', icmpType: '256' })).icmpType).toBe('bad');
    expect(formProblems(f({ protocol: 'icmp4', ports: '', icmpCode: 'x' })).icmpCode).toBe('bad');
    expect(formProblems(f({ protocol: 'icmp4', ports: '', icmpCode: '1' })).icmpCode).toBe('needsType');
  });
  it('a description is required and at most 255', () => {
    expect(formProblems(f({ description: '  ' })).description).toBe('needed');
    expect(formProblems(f({ description: 'x'.repeat(256) })).description).toBe('long');
  });
});

describe('firewall: what is sent', () => {
  it('an inbound TCP rule: ports and source, items tidied the way the host stores them', () => {
    const b = bodyOf({ ...blankForm('ingress'), action: 'drop', description: ' Block web ', ports: ' 80 , 443 ', addresses: '1.2.3.4 , 10.0.0.0/8' });
    expect(b).toEqual({ action: 'drop', protocol: 'tcp', description: 'Block web', destination_port: '80,443', source: '1.2.3.4,10.0.0.0/8', state: 'enabled' });
  });
  it('anywhere sends no address, outbound uses destination, ICMP sends no ports', () => {
    expect(bodyOf({ ...blankForm('egress'), description: 'd', ports: '25' })).toEqual({ action: 'drop', protocol: 'tcp', description: 'd', destination_port: '25', state: 'enabled' });
    expect(bodyOf({ ...blankForm('egress'), description: 'd', ports: '25', addresses: '8.8.8.8' }).destination).toBe('8.8.8.8');
    expect(bodyOf({ ...blankForm('ingress'), protocol: 'icmp4', description: 'p', ports: '80', icmpType: '8' })).toEqual({ action: 'drop', protocol: 'icmp4', description: 'p', icmp_type: '8', state: 'enabled' });
  });
  it('a delete or toggle names the whole rule (first match of every field), never `all`', () => {
    const r = rule({ source: '0.0.0.0/0', state: 'disabled' });
    expect(matchBodyOf(r)).toEqual({ action: 'drop', protocol: 'tcp', description: 'Block web', destination_port: '80', source: '0.0.0.0/0', state: 'disabled' });
    expect(matchBodyOf(r)).not.toHaveProperty('all');
    expect(matchBodyOf(r)).not.toHaveProperty('direction');
    expect(matchBodyOf(rule({ direction: 'egress', destination: '1.1.1.1' }))).toHaveProperty('destination', '1.1.1.1');
  });
  it('formOf(rule) round-trips to the same body', () => {
    const r = rule({ source: '1.2.3.4', source_port: '1024-2000' });
    const b = bodyOf(formOf(r));
    expect(b).toMatchObject({ action: r.action, protocol: r.protocol, description: r.description, destination_port: '80', source: '1.2.3.4', source_port: '1024-2000' });
  });
});

describe('firewall: lock-out warning (mutant-tested)', () => {
  const f = (o: Partial<ReturnType<typeof blankForm>>) => ({ ...blankForm('ingress'), description: 'd', ...o });
  it('an inbound block or refuse on TCP covering a Hoody kit port warns, with the ports; SSH (22) is not one', () => {
    expect(cutsOff(f({ action: 'drop', ports: '1-1024' }))).toEqual(expect.arrayContaining([4, 5, 44, 78]));
    expect(cutsOff(f({ action: 'drop', ports: '1-1024' }))).not.toContain(22);
    expect(cutsOff(f({ action: 'reject', ports: '22' }))).toEqual([]);
    expect(cutsOff(f({ action: 'drop', ports: '3998' }))).toEqual([3998]);
    expect(cutsOff(f({ action: 'drop', ports: '23333' }))).toEqual([23333]);
  });
  it('no warning: allow, outbound, UDP, ICMP, ports nobody uses, or a rule turned off', () => {
    expect(cutsOff(f({ action: 'allow', ports: '1-65535' }))).toEqual([]);
    expect(cutsOff({ ...f({ action: 'drop', ports: '22' }), direction: 'egress' })).toEqual([]);
    expect(cutsOff(f({ action: 'drop', protocol: 'udp', ports: '1-65535' }))).toEqual([]);
    expect(cutsOff(f({ action: 'drop', protocol: 'icmp4', ports: '' }))).toEqual([]);
    expect(cutsOff(f({ action: 'drop', ports: '8080' }))).toEqual([]);
    expect(cutsOff(f({ action: 'drop', ports: '22', enabled: false }))).toEqual([]);
  });
  it('a restricted source still warns (the Hub cannot tell which addresses reach the computer)', () => {
    expect(cutsOff(f({ action: 'drop', ports: '3999', addresses: '203.0.113.0/24' }))).toEqual([3999]);
  });
  it('SSH: a block covering 22 gets the plain note (SSH from Hoody does not pass this firewall), never the typed one', () => {
    expect(blocksSsh(f({ action: 'drop', ports: '22' }))).toBe(true);
    expect(blocksSsh(f({ action: 'reject', ports: '20-30' }))).toBe(true);
    expect(blocksSsh(f({ action: 'drop', ports: '' }))).toBe(true);
    expect(blocksSsh(f({ action: 'drop', ports: '2222' }))).toBe(false);
    expect(blocksSsh(f({ action: 'allow', ports: '22' }))).toBe(false);
    expect(blocksSsh(f({ action: 'drop', ports: '22', enabled: false }))).toBe(false);
    expect(blocksSsh({ ...f({ action: 'drop', ports: '22' }), direction: 'egress' })).toBe(false);
  });
  it('the kit port list is the Hoody API default list', () => {
    expect(KIT_PORTS).toEqual([4, 5, 44, 45, 46, 48, 50, 55, 59, 60, 61, 74, 75, 76, 77, 78, 3971, 3998, 3999, 23333]);
  });
});

describe('firewall: presets', () => {
  it('block outbound mail', () => {
    expect(presetRules('mail', {})).toEqual([{ direction: 'egress', action: 'drop', protocol: 'tcp', description: 'Block outbound mail (port 25)', destination_port: '25', state: 'enabled' }]);
  });
  it('block outbound to private networks: TCP and UDP to the RFC 1918 ranges, every port but DNS', () => {
    const rs = presetRules('privateOut', {});
    expect(rs.map((r) => r.protocol)).toEqual(['tcp', 'udp']);
    for (const r of rs) expect(r).toMatchObject({ direction: 'egress', action: 'drop', destination_port: '1-52,54-65535', destination: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16' });
  });
  it('block inbound except web, SSH and Hoody: every other TCP port, split to fit 64 characters a rule, none cuts off', () => {
    const rs = presetRules('inboundExceptWeb', {});
    expect(rs.length).toBeGreaterThan(1);
    const covered = new Set<number>();
    for (const r of rs) {
      expect(r).toMatchObject({ direction: 'ingress', action: 'drop', protocol: 'tcp' });
      expect(r.destination_port!.length).toBeLessThanOrEqual(64);
      for (const item of r.destination_port!.split(',')) {
        const [a = 0, b] = item.split('-').map(Number);
        for (let p = a; p <= (b ?? a); p++) covered.add(p);
      }
      expect(cutsOff(formOf(r))).toEqual([]);
    }
    for (const keep of [22, 80, 443, ...KIT_PORTS]) expect(covered.has(keep)).toBe(false);
    expect(covered.size).toBe(65535 - new Set([22, 80, 443, ...KIT_PORTS]).size);
  });
  it('block these addresses: TCP and UDP on every port from the list; a bad list gives nothing', () => {
    const rs = presetRules('addresses', { addresses: '203.0.113.7, 198.51.100.0/24' });
    expect(rs).toHaveLength(2);
    expect(rs.map((r) => r.protocol)).toEqual(['tcp', 'udp']);
    expect(rs[0]).toMatchObject({ direction: 'ingress', action: 'drop', destination_port: '1-65535', source: '203.0.113.7,198.51.100.0/24' });
    expect(presetRules('addresses', { addresses: 'nope' })).toEqual([]);
    expect(presetRules('addresses', { addresses: '' })).toEqual([]);
  });
  it('complementSpans', () => {
    expect(complementSpans([2, 3, 10], 12)).toEqual([[1, 1], [4, 9], [11, 12]]);
  });
});

describe('firewall: editing (no edit route: add the new rule, then remove the old one)', () => {
  it('only the state changed: one toggle', () => {
    expect(editPlan(rule(), formOf(rule({ state: 'disabled' })))).toEqual({ kind: 'toggle', state: 'disabled' });
  });
  it('nothing changed: nothing to send', () => {
    expect(editPlan(rule(), formOf(rule()))).toEqual({ kind: 'none' });
  });
  it('anything else: replace', () => {
    const p = editPlan(rule(), formOf(rule({ destination_port: '81' })));
    expect(p.kind).toBe('replace');
  });
});

describe('firewall: what a fresh read proves', () => {
  const read = (ingress: FwRule[], egress: FwRule[] = [], unreadable = 0) => [[{ computer: ID, ingress, egress, unreadable, unreadableIn: unreadable, unreadableOut: 0, count: 0, maxRules: null, bytes: null, maxBytes: null }]];
  const r = rule();
  const off = rule({ state: 'disabled' });
  it('an add: a read of that computer holding exactly the rule, state included', () => {
    expect(addProved({ computer: ID, key: exactKey(r) }, read([r]))).toBe('applied');
    expect(addProved({ computer: ID, key: exactKey(r) }, read([]))).toBeUndefined();
    expect(addProved({ computer: 'x'.repeat(24), key: exactKey(r) }, read([r]))).toBeUndefined();
    // A disabled twin is not the enabled rule that was added.
    expect(addProved({ computer: ID, key: exactKey(r) }, read([off]))).toBeUndefined();
  });
  it('a delete: a fully readable read without the rule', () => {
    expect(removeProved({ computer: ID, key: exactKey(r) }, read([]))).toBe('applied');
    expect(removeProved({ computer: ID, key: exactKey(r) }, read([r]))).toBeUndefined();
    expect(removeProved({ computer: ID, key: exactKey(r) }, [[]])).toBeUndefined();
    expect(removeProved({ computer: ID, key: exactKey(r) }, read([off]))).toBe('applied');
    // Absence is never read from an incomplete list.
    expect(removeProved({ computer: ID, key: exactKey(r) }, read([], [], 1))).toBeUndefined();
  });
  it('a toggle: the rule in the new state and none of its shape left in the old one, from a readable list', () => {
    const v = { computer: ID, shape: shapeKey(r), from: 'enabled', state: 'disabled' };
    expect(toggleProved(v, read([off]))).toBe('applied');
    expect(toggleProved(v, read([r]))).toBeUndefined();
    // A disabled twin already there while the enabled one remains proves nothing.
    expect(toggleProved(v, read([off, r]))).toBeUndefined();
    expect(toggleProved(v, read([off], [], 1))).toBeUndefined();
    // Literal: a rule whose description differs only in spaces is another rule.
    expect(toggleProved(v, read([{ ...off, description: ` ${off.description} ` }]))).toBeUndefined();
  });
  it('a reset: both lists empty', () => {
    expect(resetProved({ computer: ID }, read([], []))).toBe('applied');
    expect(resetProved({ computer: ID }, read([r], []))).toBeUndefined();
    expect(resetProved({ computer: ID }, read([], [], 1))).toBeUndefined();
  });
  it('ruleKey (the shape) ignores the state and item spacing; exactKey keeps the state', () => {
    expect(ruleKey(rule({ destination_port: '80, 443' }))).toBe(ruleKey(rule({ destination_port: '80,443', state: 'disabled' })));
    expect(exactKey(r)).not.toBe(exactKey(off));
  });
});

describe('firewall: Agent snapshot', () => {
  it('names the computer and every rule in words and fields; never the computer id', () => {
    const l = listOf({ data: { ingress: [{ action: 'drop', protocol: 'tcp', description: 'Block SSH', destination_port: '22', source: '0.0.0.0/0', state: 'enabled' }], egress: [], rule_count: 1, max_rules: 500 } }, ID)!;
    const s = snapshotText('atlas', l, t);
    expect(s).toContain('atlas');
    expect(s).toContain('Block TCP port 22 from anywhere');
    expect(s).toContain('"description":"Block SSH"');
    expect(s).toContain('unmatched traffic is allowed');
    expect(s).not.toContain(ID);
  });
  it('says what it left out when the list is long', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ action: 'drop', protocol: 'tcp', description: `r${i}`, destination_port: String(i + 1), state: 'enabled' }));
    const l = listOf({ data: { ingress: many, egress: [] } }, ID)!;
    const s = snapshotText('atlas', l, t);
    expect(s).toMatch(/100 more rules left out/);
    expect(s).toContain('"description":"r199"');
    expect(s).not.toContain('"description":"r200"');
  });
});

describe('firewall: an unchanged edit of an "anywhere" rule sends nothing', () => {
  it('0.0.0.0/0 stays in the form', () => {
    const r = rule({ source: '0.0.0.0/0' });
    expect(editPlan(r, formOf(r))).toEqual({ kind: 'none' });
  });
});

describe('firewall: naming one rule (the host acts on the first exact match; an unsent field matches anything)', () => {
  const a = rule({ description: 'x' });
  const b = rule({ description: 'x', source: '1.2.3.4' });
  it('a rule without a source is also matched by one with a source', () => {
    expect(matchesOf([b, a], 1, 'remove')).toEqual({ first: false, others: 1 });
    expect(matchesOf([a, b], 0, 'remove')).toEqual({ first: true, others: 1 });
    expect(matchesOf([b, a], 1, 'toggle')).toEqual({ first: false, others: 1 });
  });
  it('the rule with more fields is named alone', () => {
    expect(matchesOf([a, b], 1, 'remove')).toEqual({ first: true, others: 0 });
  });
  it('a delete matches the state; a switch does not (the host ignores it there)', () => {
    const offB = { ...b, state: 'disabled' as const };
    expect(matchesOf([offB, b], 1, 'remove')).toEqual({ first: true, others: 0 });
    expect(matchesOf([offB, b], 1, 'toggle')).toEqual({ first: false, others: 1 });
  });
  it('another direction never counts; values compare exactly as listed', () => {
    expect(matchesOf([{ ...b, direction: 'egress', destination: '1.2.3.4', source: undefined }, a], 1, 'remove')).toEqual({ first: true, others: 0 });
    expect(matchesOf([rule({ destination_port: '80,443' }), rule({ destination_port: '80, 443' })], 1, 'remove')).toEqual({ first: true, others: 0 });
  });
});

describe('firewall: reading the rules', () => {
  it('unreadable rules are counted per direction', () => {
    const l = listOf({ data: { ingress: [{ action: 'x' }], egress: [] } }, ID)!;
    expect(l).toMatchObject({ unreadable: 1, unreadableIn: 1, unreadableOut: 0 });
  });
  it('a bare 0.0.0.0 is one address, not anywhere', () => {
    expect(ruleSentence(rule({ destination_port: '22', source: '0.0.0.0' }), t)).toBe('Block TCP port 22 from 0.0.0.0');
    expect(ruleSentence(rule({ destination_port: '22', source: '0.0.0.0/0' }), t)).toBe('Block TCP port 22 from anywhere');
  });
});

describe('firewall: the Agent start', () => {
  const many = (n: number) => listOf({ data: { ingress: Array.from({ length: n }, (_, i) => ({ action: 'drop', protocol: 'tcp', description: `rule number ${i}`, source: `203.0.113.${i % 250}`, destination_port: String(i + 1), state: 'enabled' })), egress: [], rule_count: n, max_rules: 500 } }, ID)!;
  it('explain: a fixed question, the snapshot as context, the page named; never the computer id', () => {
    const l = many(2);
    const s = agentStartOf({ kind: 'explain' }, 'atlas', l, t);
    expect(s.source).toBe('Firewall');
    expect(s.text).toMatch(/atlas/);
    expect(s.context).toMatch(/I'm not sure/);
    expect(s.context).toContain('Block TCP port 1 from 203.0.113.0');
    expect(`${s.text}${s.context}`).not.toContain(ID);
    expect(`${s.text}${s.context}`).not.toContain(ID.slice(-12));
  });
  it('tell: the person\'s words are the question; the guidance (approve each change, the lock-out) rides in the context', () => {
    const s = agentStartOf({ kind: 'tell', request: '  block outbound mail  ' }, 'atlas', many(1), t);
    expect(s.text).toBe('block outbound mail');
    expect(s.context).toMatch(/approve/);
    expect(s.context).toMatch(/Hoody port/);
    expect(s.fits).toBe(true);
    expect(s.context).toContain('rule number 0');
  });
  it('a long list fits the Agent\'s limit whole: rules left out are counted, never cut mid-rule by the dock', () => {
    const l = many(400);
    const s = agentStartOf({ kind: 'explain' }, 'atlas', l, t);
    const sent = agentStartText(s.text, s.context);
    expect(sent).not.toBeNull();
    expect(sent!.length).toBeLessThanOrEqual(ASK_MAX_TEXT);
    expect(sent!).not.toMatch(/\[…\]$/);
    const listed = (s.context.match(/^- /gm) ?? []).length;
    expect(listed).toBeGreaterThan(5);
    expect(s.context).toContain(`${400 - listed} more rules left out`);
  });
  it('a tell request too long for any context: refused (empty), never sent without the rules', () => {
    for (const n of [3000, 3400, 3500, 3900]) {
      // The kit would clip the context (guidance, then rules) and still send; never allowed.
      const long = agentStartOf({ kind: 'tell', request: 'x'.repeat(n) }, 'atlas', many(1), t);
      const whole = long.text.length + ASK_CONTEXT_MARK.length + long.context.length <= ASK_MAX_TEXT;
      expect(long.fits).toBe(whole && long.context.includes('rule number 0'));
    }
    expect(agentStartOf({ kind: 'tell', request: 'x'.repeat(3500) }, 'atlas', many(1), t).fits).toBe(false);
    expect(agentStartOf({ kind: 'tell', request: 'x'.repeat(1000) }, 'atlas', many(1), t).fits).toBe(true);
    const s = agentStartOf({ kind: 'tell', request: 'x'.repeat(ASK_MAX_TEXT) }, 'atlas', many(1), t);
    expect(s.fits).toBe(false);
    expect(agentStartText(s.text, s.context)).toBeNull();
  });
  it('unreadable rules are said in the context', () => {
    const l = listOf({ data: { ingress: [{ action: 'boom' }], egress: [] } }, ID)!;
    expect(agentStartOf({ kind: 'explain' }, 'atlas', l, t).context).toMatch(/could not read/);
  });
});

describe('firewall: what the Agent is given carries no key and no whole id', () => {
  // A rule's description and the computer's name are author text: a key pasted into a description, or an id in either,
  // must never reach the Agent (or the "What the Agent reads" disclosure, which shows the same context).
  const KEY = 'Zx9Qw2Ab7Lm4Np8Rt';
  const HEX = '5f0e1a2b3c4d5e6f7a8b9c0d';
  const one = (description: string) => listOf({ data: { ingress: [{ action: 'drop', protocol: 'tcp', description, destination_port: '22', state: 'enabled' }], egress: [] } }, ID)!;
  it('a description holding a key: the key is hidden, the other words stay, and the Agent is told to read the rules itself', () => {
    const s = agentStartOf({ kind: 'explain' }, 'atlas', one(`office key ${KEY} here`), t);
    const all = `${s.text}\n${s.context}`;
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(KEY.slice(0, 12));
    expect(s.context).toContain('"description":"office key [hidden] here"');
    expect(s.context).toContain(t('fw.snap.hidden'));
    expect(s.fits).toBe(true);
  });
  it('a description holding a 24-hex id: shortened, never whole', () => {
    const s = agentStartOf({ kind: 'explain' }, 'atlas', one(`for ${HEX}`), t);
    expect(s.context).not.toContain(HEX);
    expect(s.context).toContain('"description":"for 5f0e…9c0d"');
    expect(s.context).toContain(t('fw.snap.hidden'));
  });
  // A chat-bot token is one kind of character after its id, so only the Hub's key patterns (kit scrubSecrets) know it.
  const BOT = `123456789:${'abcdefghij'.repeat(4)}`;
  it('a key-shaped token the Hub knows (kit scrubSecrets) is hidden too, though it mixes no kinds', () => {
    const s = agentStartOf({ kind: 'explain' }, 'atlas', one(`alerts ${BOT}`), t);
    expect(s.context).not.toContain(BOT.slice(10, 30));
    expect(s.context).toContain(t('fw.snap.hidden'));
  });
  it('a key whose tail is a token of another family (-ak-) is hidden whole, its start with it', () => {
    const tail = ['ak-', 'Ab12Cd34Ef56Gh78Ij90'].join('');
    const s = agentStartOf({ kind: 'explain' }, 'atlas', one(`alerts sk-12345678-${tail}`), t);
    expect(s.context).not.toContain('sk-12345678');
    expect(s.context).not.toContain(tail);
  });
  it('a computer name holding an id: shortened in the question, the guidance and the rules', () => {
    for (const ask of [{ kind: 'explain' as const }, { kind: 'tell' as const, request: 'block mail' }]) {
      const s = agentStartOf(ask, `db-${HEX}`, one('Block SSH'), t);
      expect(`${s.text}\n${s.context}`).not.toContain(HEX);
      expect(`${s.text}\n${s.context}`).toContain('db-5f0e…9c0d');
    }
  });
  it('plain rules change nothing and say nothing about hidden text', () => {
    const s = agentStartOf({ kind: 'explain' }, 'atlas', one('Block SSH from 2024 builds'), t);
    expect(s.context).toContain('"description":"Block SSH from 2024 builds"');
    expect(s.context).not.toContain(t('fw.snap.hidden'));
  });
  it('a Tell holding a key is refused (secret) and never fits, so nothing is sent; not even masked', () => {
    for (const request of [`use ${KEY} for it`, `allow ghp_${'a1B2c3D4e5'.repeat(4)}`, `${'x '.repeat(600)}${KEY}`, `alert ${BOT}`]) {
      const s = agentStartOf({ kind: 'tell', request }, 'atlas', one('Block SSH'), t);
      expect(s.secret).toBe(true);
      expect(s.fits).toBe(false);
    }
  });
  it('a Tell holding an id is sent with the id shortened; a long one-kind run is no key', () => {
    const s = agentStartOf({ kind: 'tell', request: `unblock ${HEX}` }, 'atlas', one('Block SSH'), t);
    expect(s.secret).toBe(false);
    expect(s.text).toBe('unblock 5f0e…9c0d');
    expect(s.fits).toBe(true);
    expect(agentStartOf({ kind: 'tell', request: 'x'.repeat(1000) }, 'atlas', one('Block SSH'), t).secret).toBe(false);
  });

  // What is checked must be what is sent. The kit's askPlain takes the word joiner out before
  // sending (which joined a split key or id again), a zero-width space, a combining mark or a variation selector shows
  // nothing, and a control becomes a JSON escape. Everything that shows nothing is read past; nothing else is rewritten.
  const WJ = '\u2060';
  const ZWSP = '\u200b';
  /** The message as the kit would send it (question, the context mark, the context), never only the parts. */
  const sent = (s: { text: string; context: string }) => agentStartText(s.text, s.context) ?? '';
  /** What shows nothing, one of each kind the kit's reader takes out (shownText): format characters, a combining mark,
   *  a variation selector (also the supplementary ones), a Mongolian selector, a blank filler, controls. */
  const SPLITS = [WJ, ZWSP, '\u00ad', '\ufeff', '\u200e', '\u0301', '\ufe0f', '\u{e0101}', '\u180b', '\u3164', '\u0001', '\u001b'];
  /** What the page put in the message: the kit's own context mark (which holds word joiners by design) taken out. */
  const ours = (m: string) => m.split(ASK_CONTEXT_MARK).join('\n');
  it('a computer name holding a key: hidden in the question, the guidance and the rules', () => {
    for (const ask of [{ kind: 'explain' as const }, { kind: 'tell' as const, request: 'block mail' }]) {
      const s = agentStartOf(ask, `box ${KEY}`, one('Block SSH'), t);
      expect(sent(s)).not.toContain(KEY);
      expect(sent(s)).not.toContain(KEY.slice(0, 12));
      expect(s.context).toContain('box [hidden]');
    }
  });
  it('a key or an id split by anything that shows nothing (a joiner, a mark, a variation selector, a control) is still hidden, in what is sent', () => {
    for (const j of SPLITS) {
      const key = `${KEY.slice(0, 8)}${j}${KEY.slice(8)}`;
      const hex = `${HEX.slice(0, 12)}${j}${HEX.slice(12)}`;
      const s = agentStartOf({ kind: 'explain' }, 'atlas', one(`office ${key} for ${hex}`), t);
      const m = sent(s);
      expect(m, JSON.stringify(j)).not.toContain(KEY);
      expect(m, JSON.stringify(j)).not.toContain(KEY.slice(0, 8));
      expect(m, JSON.stringify(j)).not.toContain(HEX);
      expect(m, JSON.stringify(j)).not.toContain(HEX.slice(4, 20));
      // The character inside the key or the id goes with what replaced it: nothing of it is left in the page's part.
      expect(ours(m), JSON.stringify(j)).not.toContain(j);
      expect(m).toContain(t('fw.snap.hidden'));
    }
  });
  it('a line break or tab in a rule is sent as one space, never as a JSON escape that joins the words around it', () => {
    for (const j of ['\r', '\n', '\t', '\r\n']) {
      const m = sent(agentStartOf({ kind: 'explain' }, `at${j}las`, one(`office${j}door`), t));
      expect(m, JSON.stringify(j)).toContain('office door');
      expect(m, JSON.stringify(j)).not.toContain('\\n');
      expect(m, JSON.stringify(j)).not.toContain('\\t');
      expect(m, JSON.stringify(j)).toContain('the computer at las');
      expect(m, JSON.stringify(j)).not.toContain(t('fw.snap.hidden'));
    }
  });
  it('an escape sequence inside a key or an id is taken out whole: the key is hidden, the id shortened', () => {
    const red = '\u001b[31m';
    const osc = '\u001b]0;t\u0007';
    for (const j of [red, osc]) {
      const m = sent(agentStartOf({ kind: 'explain' }, `box ${KEY.slice(0, 8)}${j}${KEY.slice(8)}`, one(`office ${KEY.slice(0, 8)}${j}${KEY.slice(8)} for ${HEX.slice(0, 12)}${j}${HEX.slice(12)}`), t));
      expect(m, JSON.stringify(j)).not.toContain(KEY.slice(8));
      expect(m, JSON.stringify(j)).not.toContain(HEX.slice(12));
      expect(m, JSON.stringify(j)).not.toContain('[31m');
      const tell = agentStartOf({ kind: 'tell', request: `allow ${HEX.slice(0, 12)}${j}${HEX.slice(12)} in` }, 'atlas', one('Block SSH'), t);
      expect(tell.text, JSON.stringify(j)).toBe(`allow ${HEX.slice(0, 4)}\u2026${HEX.slice(-4)} in`);
      expect(agentStartOf({ kind: 'tell', request: `use ${KEY.slice(0, 8)}${j}${KEY.slice(8)}` }, 'atlas', one('Block SSH'), t).secret).toBe(true);
    }
  });
  it('a key the Hub knows, glued to a word by what the clean-up takes out, is still hidden or refused', () => {
    const sk = `sk-${'abcdefghij'.repeat(2)}`;
    for (const j of ['\u0001', '\u001b[31m', '\u202e', '\u2060']) {
      const glued = `foo${j}${sk}`;
      const m = sent(agentStartOf({ kind: 'explain' }, `box ${glued}`, one(`office ${glued}`), t));
      expect(m, JSON.stringify(j)).not.toContain(sk.slice(3));
      expect(m, JSON.stringify(j)).toContain(t('fw.snap.hidden'));
      const f = listOf({ data: { ingress: [{ action: 'drop', protocol: 'tcp', description: 'x', destination_port: '22', source: glued, state: 'enabled' }], egress: [] } }, ID)!;
      expect(sent(agentStartOf({ kind: 'explain' }, 'atlas', f, t)), JSON.stringify(j)).not.toContain(sk.slice(3));
      const tell = agentStartOf({ kind: 'tell', request: `allow ${glued} here` }, 'atlas', one('Block SSH'), t);
      expect(tell.secret, JSON.stringify(j)).toBe(true);
      expect(tell.fits).toBe(false);
    }
  });
  it('what shows nothing but is not inside a key or an id is left as written: an emoji, a script, bidi marks', () => {
    const coder = '\u{1f469}\u200d\u{1f4bb}';
    const rtl = '\u05e9\u05dc\u05d5\u05dd\u200f';
    const s = agentStartOf({ kind: 'tell', request: `let ${coder} reach port 443` }, `dev ${coder}`, one(`${rtl} office \u0915\u094d\u200d\u0937`), t);
    expect(s.secret).toBe(false);
    expect(s.text).toBe(`let ${coder} reach port 443`);
    expect(s.context).toContain(`dev ${coder}`);
    expect(s.context).toContain(`${rtl} office \u0915\u094d\u200d\u0937`);
    expect(s.context).not.toContain(t('fw.snap.hidden'));
  });
  it('a key in any other field the read gave is hidden too: the read path does not check the fields', () => {
    const l = listOf({ data: { ingress: [{ action: 'drop', protocol: 'tcp', description: 'x', destination_port: `22,${KEY}`, source: `10.0.0.1,${HEX}`, state: 'enabled' }], egress: [{ action: 'drop', protocol: 'tcp', description: 'y', destination: `sk-${'a1B2c3D4'.repeat(3)}`, state: 'enabled' }] } }, ID)!;
    const m = sent(agentStartOf({ kind: 'explain' }, 'atlas', l, t));
    expect(m).not.toContain(KEY);
    expect(m).not.toContain(HEX);
    expect(m).not.toContain('a1B2c3D4a1B2');
    // A control inside a field is taken out before the JSON is built: it never becomes an escape that splits the run.
    const c = listOf({ data: { ingress: [{ action: 'drop', protocol: 'tcp', description: 'x', destination_port: '22', source: `${KEY.slice(0, 8)}\u0001${KEY.slice(8)}`, state: 'enabled' }], egress: [] } }, ID)!;
    expect(c.ingress).toHaveLength(1);
    const mc = sent(agentStartOf({ kind: 'explain' }, 'atlas', c, t));
    expect(mc).not.toContain(KEY.slice(0, 8));
    expect(mc).not.toContain('\\u0001');
    expect(mc).toContain(t('fw.snap.hidden'));
    // A lone surrogate too: JSON writes it as an escape ("\ud800") that would split the run.
    const u = listOf({ data: { ingress: [], egress: [{ action: 'drop', protocol: 'tcp', description: 'x', destination: `${KEY.slice(0, 8)}\ud800${KEY.slice(8)}`, state: 'enabled' }] } }, ID)!;
    expect(u.egress).toHaveLength(1);
    const mu = sent(agentStartOf({ kind: 'explain' }, 'atlas', u, t));
    expect(mu).not.toContain(KEY.slice(8));
    expect(mu).not.toContain('\\ud800');
  });
  it('agentSafe itself reads past characters that show nothing: a key or an id split by one is still hidden', () => {
    for (const j of SPLITS) {
      const out = agentSafe(`use ${KEY.slice(0, 8)}${j}${KEY.slice(8)} on ${HEX.slice(0, 12)}${j}${HEX.slice(12)}`);
      expect(out, JSON.stringify(j)).not.toContain(KEY.slice(0, 8));
      expect(out, JSON.stringify(j)).not.toContain(HEX.slice(4, 20));
      expect(out, JSON.stringify(j)).toContain('[hidden]');
      // A chat-bot token is one kind of character after its id: only the Hub's key patterns know it, so they too must
      // read the text with the joiner taken out.
      expect(agentSafe(`alerts ${BOT.slice(0, 20)}${j}${BOT.slice(20)}`), JSON.stringify(j)).not.toContain(BOT.slice(10, 30));
    }
  });
  it('a Tell holding a key split by anything that shows nothing is refused; any other Tell is sent as written, its ids shortened', () => {
    for (const j of SPLITS) {
      const s = agentStartOf({ kind: 'tell', request: `use ${KEY.slice(0, 8)}${j}${KEY.slice(8)} here` }, 'atlas', one('Block SSH'), t);
      expect(s.secret, JSON.stringify(j)).toBe(true);
      expect(s.fits).toBe(false);
    }
    const ok = agentStartOf({ kind: 'tell', request: `block${ZWSP} mail${WJ} on 25` }, 'atlas', one('Block SSH'), t);
    expect(ok.secret).toBe(false);
    // The kit's askPlain takes the word joiner out; the rest is as the person wrote it.
    expect(ok.text).toBe(`block${ZWSP} mail on 25`);
    expect(sent(ok)).toContain(ASK_CONTEXT_MARK);
    for (const j of [ZWSP, '\ufe0f']) {
      const id = agentStartOf({ kind: 'tell', request: `allow ${HEX.slice(0, 12)}${j}${HEX.slice(12)} in` }, 'atlas', one('Block SSH'), t);
      expect(id.secret, JSON.stringify(j)).toBe(false);
      expect(id.text, JSON.stringify(j)).toBe(`allow ${HEX.slice(0, 4)}\u2026${HEX.slice(-4)} in`);
    }
  });
});

describe('firewall: the plain summary (no AI)', () => {
  it('counts blocks, allows and turned-off rules per direction', () => {
    const l = listOf({ data: {
      ingress: [{ action: 'drop', protocol: 'tcp', description: 'a', destination_port: '22', state: 'enabled' }, { action: 'reject', protocol: 'udp', description: 'b', destination_port: '53', state: 'disabled' }, { action: 'allow', protocol: 'tcp', description: 'c', destination_port: '80', state: 'enabled' }],
      egress: [],
    } }, ID)!;
    expect(summaryOf(l, t)).toBe('Inbound: 1 block, 1 allow, 1 turned off. Outbound: no rules, all allowed.');
  });
  it('an unreadable rule makes a direction unknown, never "all allowed"', () => {
    const l = listOf({ data: { ingress: [], egress: [{ action: 'boom' }] } }, ID)!;
    expect(summaryOf(l, t)).toMatch(/Outbound: 1 rule the Hub could not read\./);
    expect(summaryOf(l, t)).not.toMatch(/Outbound: no rules/);
  });
});

describe('firewall: identity is literal, as the host compares it', () => {
  it('two descriptions that differ only in spaces are two rules; an add of one is not proved by the other', () => {
    const a = rule({ description: ' x ' });
    const b = rule({ description: 'x' });
    expect(exactKey(a)).not.toBe(exactKey(b));
    const l = listOf({ data: { ingress: [{ action: 'drop', protocol: 'tcp', description: ' x ', destination_port: '80', state: 'enabled' }], egress: [] } }, ID)!;
    expect(addProved({ computer: ID, key: exactKey(b) }, [[l]])).toBeUndefined();
    expect(addProved({ computer: ID, key: exactKey(a) }, [[l]])).toBe('applied');
  });
  it('a TCP block with no port (older rules) covers SSH and every kit port when turned on', () => {
    expect(cutsOff(formOf(rule({ destination_port: undefined })))).toEqual([...KIT_PORTS].sort((x, y) => x - y));
  });
});
