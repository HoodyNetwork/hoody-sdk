// Network > Firewall: the fixture host for hub:dev, shots and the page's fixture states. It keeps each
// computer's rules in memory and answers like the Hoody API's firewall routes: adds append (a duplicate, state
// included, answers 200 duplicate: true), a delete removes the FIRST rule matching every sent field (an unsent field
// matches anything; the state counts), a switch sets the state of the first rule matching every field but the state,
// a reset empties both lists. The computers page's fixtures spread firewallFixtureRules() into their reads.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { firewallRoutes } from '../firewall.data';

type Wire = Record<string, string>;
type Dir = 'ingress' | 'egress';
const FIELDS = ['action', 'state', 'description', 'source', 'destination', 'protocol', 'source_port', 'destination_port', 'icmp_type', 'icmp_code'];

/** Every computer starts with these (a realistic small set: an SSH block from one address, web allowed, mail out off). */
// Rule descriptions are the API's own data (what a person typed), not Hub copy.
const rule = (description: string, fields: Wire): Wire => ({ description, ...fields });
const seed = (): Record<Dir, Wire[]> => ({
  ingress: [
    rule('Old office', { action: 'drop', protocol: 'tcp', source: '198.51.100.0/24', destination_port: '3306', state: 'enabled' }),
    rule('Web', { action: 'allow', protocol: 'tcp', destination_port: '80,443', source: '0.0.0.0/0', state: 'enabled' }),
    rule('No game server', { action: 'reject', protocol: 'udp', destination_port: '27015-27030', state: 'disabled' }),
  ],
  egress: [rule('No outbound mail', { action: 'drop', protocol: 'tcp', destination_port: '25', destination: '0.0.0.0/0', state: 'enabled' })],
});

const computerOf = (r: FixtureRequest): string => /\/computers\/([^/]+)\/firewall/.exec(r.path)?.[1] ?? '';
const matches = (rule: Wire, crit: Wire, withState: boolean) => FIELDS.every((k) => (k === 'state' && !withState) || crit[k] === undefined || rule[k] === crit[k]);
const same = (a: Wire, b: Wire) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// The "No internet" switch's group: its marker and rules, as NoInternet.logic sends them.
const ni = (protocol: string, port?: string): Wire => rule('No internet (Hub switch)', { action: 'drop', protocol, ...(port ? { destination_port: port } : {}), state: 'enabled' });

/** The firewall routes for one fixture state: `empty` starts every computer with no rules; `down` answers 503 busy;
 *  `noInternet` adds the No internet group, whole ('on') or one rule of it ('partial'). */
export function firewallFixtureRules(o: { empty?: boolean; down?: boolean; noInternet?: 'on' | 'partial' } = {}): FixtureRule[] {
  const group = o.noInternet === 'on' ? [ni('tcp', '1-65535'), ni('udp', '1-65535'), ni('icmp4')] : o.noInternet === 'partial' ? [ni('tcp', '1-65535')] : [];
  const hosts = new Map<string, Record<Dir, Wire[]>>();
  const host = (r: FixtureRequest) => {
    const id = computerOf(r);
    let h = hosts.get(id);
    if (!h) {
      h = o.empty ? { ingress: [], egress: [] } : seed();
      h.egress.push(...group);
      hosts.set(id, h);
    }
    return h;
  };
  const busy = () => answers.refused(503, 'FIREWALL_HOST_UNAVAILABLE');
  const add = (dir: Dir) => (r: FixtureRequest) => {
    if (o.down) return busy();
    const h = host(r);
    const body = { state: 'enabled', ...(r.body as Wire) };
    const dup = h[dir].some((x) => same(x, body));
    if (!dup) h[dir].push(body);
    return answers.ok({ statusCode: dup ? 200 : 201, data: { duplicate: dup || undefined, ingress: h.ingress, egress: h.egress } });
  };
  const remove = (dir: Dir) => (r: FixtureRequest) => {
    if (o.down) return busy();
    const h = host(r);
    const i = h[dir].findIndex((x) => matches(x, r.body as Wire, true));
    if (i < 0) return answers.refused(404, 'RULE_NOT_FOUND');
    h[dir].splice(i, 1);
    return answers.ok({ statusCode: 200, data: { direction: dir, removed_count: 1 } });
  };
  const toggle = (dir: Dir) => (r: FixtureRequest) => {
    if (o.down) return busy();
    const h = host(r);
    const b = r.body as Wire;
    const i = h[dir].findIndex((x) => matches(x, b, false));
    if (i < 0) return answers.refused(404, 'RULE_NOT_FOUND');
    h[dir][i] = { ...h[dir][i], state: b.state as string };
    return answers.ok({ statusCode: 200, data: {} });
  };
  return [
    reply(firewallRoutes.rules, (r) => {
      if (o.down) return busy();
      const h = host(r);
      return answers.ok({ statusCode: 200, data: { ingress: h.ingress, egress: h.egress, rule_count: h.ingress.length + h.egress.length, max_rules: 500, byte_count: 1024, max_bytes: 262144 } });
    }),
    reply(firewallRoutes.addIn, add('ingress')),
    reply(firewallRoutes.addOut, add('egress')),
    reply(firewallRoutes.removeIn, remove('ingress')),
    reply(firewallRoutes.removeOut, remove('egress')),
    reply(firewallRoutes.toggleIn, toggle('ingress')),
    reply(firewallRoutes.toggleOut, toggle('egress')),
    reply(firewallRoutes.reset, (r) => {
      if (o.down) return busy();
      const h = host(r);
      h.ingress = [];
      h.egress = [];
      return answers.ok({ statusCode: 200, data: { rules: { ingress: [], egress: [] } } });
    }),
  ];
}
