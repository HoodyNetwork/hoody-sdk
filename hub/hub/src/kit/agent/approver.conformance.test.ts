// @vitest-environment node
// Static guard of the approver lease: the capability has one home, its removal and
// abandonment have one door each, and no other module can reach the lease routes or the header.
import { describe, expect, it } from 'vitest';

const src = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}', '!../../**/*.spec.ts', '!../../**/fixtures.ts', '!../../**/fixtures/**', '!../../**/fake-kit.ts', '!../../**/*.fake*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const strip = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** Vite keys a file beside this test as './x.ts' and one above as '../../dir/x.ts'. */
const norm = (f: string): string => (f.startsWith('./') ? 'kit/agent/' + f.slice(2) : f.replace(/^(\.\.\/)+/, ''));
const files = (re: RegExp, within = ''): string[] =>
  Object.entries(src).filter(([f, t]) => norm(f).startsWith(within) && re.test(strip(t))).map(([f]) => norm(f)).sort();
const text = (f: string): string => strip(Object.entries(src).find(([k]) => norm(k) === f)?.[1] ?? '');
const count = (re: RegExp, t: string): number => (t.match(re) ?? []).length;

describe('custody', () => {
  it('the capability field `#value` and the lease claim exist in approver-custody.ts only', () => {
    expect(files(/#value\b/)).toEqual(['kit/agent/approver-custody.ts']);
    expect(files(/claimTickets\)?\(\s*'lease'/)).toEqual(['kit/agent/approver-custody.ts']);
  });
  it('a capability is removed at two sites only, both in the settle hook: a 409 invalid on a request that carried it, and a 2xx release', () => {
    const c = text('kit/agent/approver-custody.ts');
    const calls = c.match(/(?<!function )\bremove\((?!c: Cap)[^)]*\)/g) ?? [];
    expect(calls).toEqual(["remove(carried, 'invalid')", "remove(c, 'released')"]);
    for (const f of Object.keys(src)) if (norm(f) !== 'kit/agent/approver-custody.ts') expect(strip(src[f]!), norm(f)).not.toMatch(/\bcus\.remove\(|custody\.remove\(/);
  });
  it('abandon( is called by the manager\'s accountChanged and its tests-only reset, and accountChanged( only by the page wiring\'s bump listener', () => {
    expect(count(/\bcus\.abandon\(/g, text('kit/agent/approver.ts'))).toBe(2);
    expect(files(/\.abandon\(/, 'kit/agent/')).toEqual(['kit/agent/approver.ts']);
    expect(files(/\.accountChanged\(\)/)).toEqual(['kit/agent/approver-live.ts']);
    expect(text('kit/agent/approver-live.ts')).toMatch(/onBump\(\(reason\) => \{ if \(reason === 'account' \|\| reason === 'signout' \|\| reason === 'logout'\) m\.accountChanged\(\); \}\)/);
  });
});

describe('who can reach the lease', () => {
  it('approverApi( is called only by the page wiring (approver-live.ts) outside core', () => {
    expect(files(/\bapproverApi\(/).filter((f) => !f.startsWith('core/'))).toEqual(['kit/agent/approver-live.ts']);
  });
  it('the three lease routes are declared in core/agent/approver.ts and named nowhere else', () => {
    expect(files(/approverRoutes\b/).filter((f) => !f.startsWith('core/'))).toEqual(['kit/agent/approver-live.ts']);
    expect(files(/\/approver-lease/)).toEqual(['core/agent/approver.ts']);
  });
  it('X-Hoody-Approver-Lease is written by core\'s ticket step only', () => {
    // The terminal's transport names it to police it (an allowed name, a header it skips or checks), never to set it.
    const police = ['term/app/cli-client.ts', 'term/app/live-policy.ts', 'term/app/live-wire.ts'];
    expect(files(/X-Hoody-Approver-Lease/i)).toEqual(['core/kit.ts', ...police]);
    const name = String.raw`(?:LEASE|['"\`]x-hoody-approver-lease['"\`])`;
    for (const f of police) {
      const t = text(f);
      expect(t, f).not.toMatch(new RegExp(String.raw`\[\s*${name}\s*\]\s*=(?!=)`, 'i'));
      expect(t, f).not.toMatch(new RegExp(String.raw`\.(?:set|append)\(\s*${name}`, 'i'));
      expect(t, f).not.toMatch(new RegExp(String.raw`(?:\[\s*${name}\s*\]|['"\`]x-hoody-approver-lease['"\`])\s*:`, 'i'));
    }
  });
  it('no refused( in the lease code, no lease-source setter, no holder-required answer', () => {
    for (const f of ['kit/agent/approver.ts', 'kit/agent/approver-custody.ts', 'kit/agent/approver-settle.ts', 'kit/agent/approver-live.ts', 'ask/engine.ts', 'ask/data.ts']) expect(text(f), f).not.toMatch(/\brefused\(/);
    expect(Object.entries(src).filter(([, t]) => new RegExp('set' + 'ApproverLeaseSource|holder_' + 'required').test(t)).map(([f]) => norm(f))).toEqual([]);
  });
});

describe('callers build their ticket lists with tix(', () => {
  it('no `tickets: [` literal outside core: ask/ and kit/ pass what tix( built', () => {
    expect(files(/tickets:\s*\[/, 'ask/').concat(files(/tickets:\s*\[/, 'kit/'))).toEqual([]);
  });
  it('every POST /sessions route of ask/data.ts declares its tickets (create: journal, lease when not default; attach: lease required)', () => {
    const d = text('ask/data.ts');
    const rows = d.split('\n').filter((l) => /method: 'POST', path: '\/sessions', scope: 'agent'/.test(l));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatch(/tickets:/);
    expect(rows[0]).toMatch(/journal: 'required'/);
    expect(rows.map((r) => /lease: \(b\) => approvalModeOf\(b\) !== 'default'/.test(r) || /lease: 'required'/.test(r))).toEqual([true, true]);
  });
});
