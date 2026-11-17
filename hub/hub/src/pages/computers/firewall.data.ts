// Computer firewall: the Hoody API's firewall routes and their core table, apart from data.ts.
// Changes are sent once and never retried (C9): a lost answer is held until a fresh read of the computer's rules
// proves it (parts/Firewall.logic.ts *Proved) or its sender dismisses that hold after a warning.
// One lock for every firewall change of a computer; the lock key adds the rule, so changes of different rules can
// run side by side while a second change of the same rule waits. A reset names no rule and the page lets it go only
// while nothing is held on that computer (and nothing else while a reset is held).
import { coreSource, defineRoute, type SourceTable } from '@core';
import { addProved, matchBodyOf, listOf, exactKey, removeProved, resetProved, ruleKey, shapeKey, toggleProved, type FwList, type FwRule, type RuleState } from './parts/Firewall.logic';

const RULE_BODY = ['action', 'protocol', 'description', 'destination_port', 'source_port', 'state', 'icmp_type', 'icmp_code'] as const;

export const firewallRoutes = {
  rules: defineRoute({ method: 'GET', path: '/computers/:id/firewall/rules', scope: 'realm' }),
  reset: defineRoute({ method: 'POST', path: '/computers/:id/firewall/reset', scope: 'realm' }),
  addIn: defineRoute({ method: 'POST', path: '/computers/:id/firewall/ingress', scope: 'realm', body: [...RULE_BODY, 'source'] }),
  addOut: defineRoute({ method: 'POST', path: '/computers/:id/firewall/egress', scope: 'realm', body: [...RULE_BODY, 'destination'] }),
  removeIn: defineRoute({ method: 'DELETE', path: '/computers/:id/firewall/ingress', scope: 'realm', body: [...RULE_BODY, 'source'] }),
  removeOut: defineRoute({ method: 'DELETE', path: '/computers/:id/firewall/egress', scope: 'realm', body: [...RULE_BODY, 'destination'] }),
  toggleIn: defineRoute({ method: 'PATCH', path: '/computers/:id/firewall/ingress', scope: 'realm', body: [...RULE_BODY, 'source'] }),
  toggleOut: defineRoute({ method: 'PATCH', path: '/computers/:id/firewall/egress', scope: 'realm', body: [...RULE_BODY, 'destination'] }),
};

export const FW_LOCK = 'computer.firewall';

export interface FwVars { computer: string }
export interface RuleVars extends FwVars { rule: FwRule }
export interface ToggleVars extends RuleVars { state: RuleState }

const add = (dir: 'ingress' | 'egress') => ({
  route: dir === 'ingress' ? firewallRoutes.addIn : firewallRoutes.addOut,
  input: (v: RuleVars) => {
    const { direction: _d, ...body } = v.rule;
    return { params: { id: v.computer }, body };
  },
  reads: ['fwRules'],
  lock: FW_LOCK,
  // A computer is the same computer in every realm view: a lost send shows, and keeps every change of it off, in each.
  acrossRealms: true,
  lockKey: (v: RuleVars) => ({ computer: v.computer, key: ruleKey(v.rule) }),
  identity: (v: RuleVars) => ({ computer: v.computer, act: 'add', key: exactKey(v.rule), rule: v.rule }),
  // The answer's warnings (a rule covering Hoody kit ports) reach the page; nothing else of it is kept.
  select: (raw: unknown) => {
    const w = (raw as { warnings?: unknown })?.warnings;
    return { warnings: Array.isArray(w) ? w : [] };
  },
  proves: addProved,
});
const remove = (dir: 'ingress' | 'egress') => ({
  route: dir === 'ingress' ? firewallRoutes.removeIn : firewallRoutes.removeOut,
  input: (v: RuleVars) => ({ params: { id: v.computer }, body: matchBodyOf(v.rule) }),
  reads: ['fwRules'],
  lock: FW_LOCK,
  // A computer is the same computer in every realm view: a lost send shows, and keeps every change of it off, in each.
  acrossRealms: true,
  lockKey: (v: RuleVars) => ({ computer: v.computer, key: ruleKey(v.rule) }),
  identity: (v: RuleVars) => ({ computer: v.computer, act: 'remove', key: exactKey(v.rule), rule: v.rule }),
  select: () => undefined,
  proves: removeProved,
});
const toggle = (dir: 'ingress' | 'egress') => ({
  route: dir === 'ingress' ? firewallRoutes.toggleIn : firewallRoutes.toggleOut,
  // The rule's fields name it; `state` is the new one (the host does not pick the rule by state on a switch).
  input: (v: ToggleVars) => ({ params: { id: v.computer }, body: { ...matchBodyOf(v.rule), state: v.state } }),
  reads: ['fwRules'],
  lock: FW_LOCK,
  // A computer is the same computer in every realm view: a lost send shows, and keeps every change of it off, in each.
  acrossRealms: true,
  lockKey: (v: ToggleVars) => ({ computer: v.computer, key: ruleKey(v.rule) }),
  identity: (v: ToggleVars) => ({ computer: v.computer, act: 'toggle', shape: shapeKey(v.rule), from: v.rule.state, state: v.state, rule: v.rule }),
  select: () => undefined,
  proves: toggleProved,
});

export const firewallTable: SourceTable = {
  reads: {
    fwRules: {
      route: firewallRoutes.rules,
      input: (p: FwVars) => ({ params: { id: p.computer } }),
      select: (raw, p: FwVars): FwList => {
        const l = listOf(raw, p.computer);
        if (!l) throw new Error('FIREWALL_UNREADABLE');
        return l;
      },
      staleTime: 0,
    },
  },
  changes: {
    fwAddIn: add('ingress'),
    fwAddOut: add('egress'),
    fwRemoveIn: remove('ingress'),
    fwRemoveOut: remove('egress'),
    fwToggleIn: toggle('ingress'),
    fwToggleOut: toggle('egress'),
    fwReset: {
      route: firewallRoutes.reset,
      input: (v: FwVars) => ({ params: { id: v.computer } }),
      reads: ['fwRules'],
      lock: FW_LOCK,
      // As the rule changes: one computer's hold in every realm view.
      acrossRealms: true,
      lockKey: (v: FwVars) => ({ computer: v.computer, key: 'reset' }),
      identity: (v: FwVars) => ({ computer: v.computer, act: 'reset' }),
      select: () => undefined,
      proves: resetProved,
    },
  },
};

const source = coreSource('computers', firewallTable);
export const firewallSource = source;
export const useFirewall = (computer: string, enabled: boolean) => source.useQuery<FwList, FwVars>('fwRules', { computer }, { enabled: enabled && !!computer });
export const useAddRule = (dir: 'ingress' | 'egress') => source.useMutation<{ warnings: unknown[] } | undefined, RuleVars>(dir === 'ingress' ? 'fwAddIn' : 'fwAddOut');
export const useRemoveRule = (dir: 'ingress' | 'egress') => source.useMutation<unknown, RuleVars>(dir === 'ingress' ? 'fwRemoveIn' : 'fwRemoveOut');
export const useToggleRule = (dir: 'ingress' | 'egress') => source.useMutation<unknown, ToggleVars>(dir === 'ingress' ? 'fwToggleIn' : 'fwToggleOut');
export const useResetFirewall = () => source.useMutation<unknown, FwVars>('fwReset');
