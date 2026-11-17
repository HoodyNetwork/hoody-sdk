// "No internet": one switch on the Network tab that stops the computer opening new connections
// out. It is a set of marked outbound Block rules in the computer's firewall, so the state is read from the rules
// themselves, never kept by the page: all of them there (and on), once each = on; none = off; anything else = partly
// set, with a way to finish either way; a list the page could not fully read = not sure.
//
// The Hoody API takes only tcp, udp or icmp4 rules (protocol is required) and no IPv6 address, so the switch is three
// rules with no destination (no destination matches every address, IPv4 and IPv6): every TCP port, every UDP port,
// and every IPv4 ICMP message (ping included). The host's network rules let through, before these: traffic of
// connections already open, and the computer's DNS and DHCP with the host. Left open too: IPv6 ICMP (ping) and rarely
// used protocols. The words on the page say all of this.
//
// The marker is the rules' description: a fixed text, never translated (a reader in another language must find the
// same rules), and the only thing that ties a rule to the switch.
import type { FwList, FwRule } from './Firewall.logic';
import { exactKey, hostPickOf } from './Firewall.logic';

export const NO_INTERNET_MARK = 'No internet (Hub switch)';

/** The rules the switch adds, in the order it sends them. */
export const NO_INTERNET_RULES: readonly FwRule[] = [
  { direction: 'egress', action: 'drop', protocol: 'tcp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' },
  { direction: 'egress', action: 'drop', protocol: 'udp', description: NO_INTERNET_MARK, destination_port: '1-65535', state: 'enabled' },
  { direction: 'egress', action: 'drop', protocol: 'icmp4', description: NO_INTERNET_MARK, state: 'enabled' },
];

/** A rule of the switch: its marker, in either list (a marked inbound rule is not the switch's, but it is no user rule
 *  either, so it keeps the state partial and is removed by "Remove its rules"). */
export const isNoInternetRule = (r: FwRule): boolean => r.description === NO_INTERNET_MARK;

export type NoInternetState = 'on' | 'off' | 'partial' | 'unknown';

/** What another section of the Network tab (the exit's "Disable internet" choice) may ask of Internet
 *  access: its state from the last read ('reading' before the first), whether it can change now (Internet access says
 *  why not, under its own choice), and `block`, which opens Internet access's own Block question: the same words, the
 *  same rules, the same one-at-a-time sends as choosing Blocked there. */
export interface NoInternetHandle {
  state: NoInternetState | 'reading';
  canChange: boolean;
  block: () => void;
}

const marked = (l: FwList): FwRule[] => [...l.ingress, ...l.egress].filter(isNoInternetRule);
const WANT = new Set(NO_INTERNET_RULES.map(exactKey));
/** Marked rules that are exactly the same as an earlier one (the host's add never makes one; another writer could). */
const twins = (l: FwList): boolean => {
  const keys = marked(l).map(exactKey);
  return new Set(keys).size !== keys.length;
};

/** The switch's state from one read. unknown: nothing read, or a rule the page could not read (it might be one of the
 *  switch's). Two identical marked rules read partial: one of them cannot be removed on its own (see nextStep). */
export function noInternetState(l: FwList | undefined): NoInternetState {
  if (!l || l.unreadableOut > 0 || l.unreadableIn > 0) return 'unknown';
  const m = marked(l);
  if (m.length === 0) return 'off';
  const have = new Set(m.map(exactKey));
  const complete = [...WANT].every((k) => have.has(k)) && m.every((r) => WANT.has(exactKey(r))) && !twins(l);
  return complete ? 'on' : 'partial';
}

/** How many of the switch's own rules one read holds (for "N of its 3 rules are in place"). */
export const inPlace = (l: FwList): number => NO_INTERNET_RULES.filter((r) => l.egress.some((x) => exactKey(x) === exactKey(r))).length;

export type NoInternetStep = { kind: 'done' } | { kind: 'blocked'; why: 'twins' | 'other' } | { kind: 'unknown' } | { kind: 'remove'; rule: FwRule } | { kind: 'add'; rule: FwRule };

/** The ONE change to send next, judged on a fresh read (the page reads again before every change, C9). Turning on
 *  removes first every marked rule that is not exactly one of the switch's (off, changed, inbound), then adds what is
 *  missing; turning off removes every marked rule. The host deletes the FIRST rule matching every field sent, and the
 *  marker is always sent, so only another marked rule can stand before a marked one: a rule to remove goes when the
 *  host would pick it; when the host would pick a marked rule before it, that one goes first (one of the three is then
 *  added back, as missing, by a later step). blocked: twins = two identical marked rules (deleting one leaves the
 *  other, so no read could tell the delete went through); other = nothing the host would pick (not expected). */
export function nextStep(l: FwList, mode: 'on' | 'off'): NoInternetStep {
  if (noInternetState(l) === 'unknown') return { kind: 'unknown' };
  const pick = mode === 'on' ? (r: FwRule) => isNoInternetRule(r) && !WANT.has(exactKey(r)) : isNoInternetRule;
  const out = (['ingress', 'egress'] as const).flatMap((dir) => l[dir].map((r, i) => ({ r, i, dir })).filter(({ r }) => pick(r)));
  if (out.length > 0) {
    if (twins(l)) return { kind: 'blocked', why: 'twins' };
    for (const { r, i, dir } of out) {
      const hit = hostPickOf(l[dir], i, 'remove');
      if (hit === i) return { kind: 'remove', rule: r };
      const before = l[dir][hit];
      if (before && isNoInternetRule(before) && hostPickOf(l[dir], hit, 'remove') === hit) return { kind: 'remove', rule: before };
    }
    return { kind: 'blocked', why: 'other' };
  }
  if (mode === 'off') return { kind: 'done' };
  if (twins(l)) return { kind: 'blocked', why: 'twins' };
  const missing = NO_INTERNET_RULES.find((r) => !l.egress.some((x) => exactKey(x) === exactKey(r)));
  return missing ? { kind: 'add', rule: missing } : { kind: 'done' };
}
