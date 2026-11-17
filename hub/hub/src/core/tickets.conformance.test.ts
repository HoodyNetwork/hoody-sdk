// @vitest-environment node
// Static guard of the ticket seam (the rules for its owners and the approver-lease conformance rules):
//   - the old lease seam is gone (setApproverLeaseSource, LeaseQuery, leaseFor, leasePass, RouteSpec.lease);
//   - X-Hoody-Approver-Lease is set by core's step 5 (kit.ts) and nowhere else;
//   - claimTickets is called only by the journal door (ask/journal/door.ts) and the approver custody (kit/agent/approver-custody.ts);
//   - a ticket is read only by core (ticket.ts, kit.ts, api.ts): no other module opens `tickets` of a CallInput.
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const src = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../**/*.spec.ts', '!../**/fixtures.ts', '!../**/fixtures.*.ts', '!../**/fake-kit.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const all = import.meta.glob(['../**/*.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** Vite keys a file beside this test as './x.ts' and one above as '../dir/x.ts'. */
const norm = (f: string): string => (f.startsWith('./') ? 'core/' + f.slice(2) : f.replace(/^\.\.\//, ''));
const strip = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const files = (re: RegExp, where: Record<string, string> = src, comments = false): string[] =>
  Object.entries(where).filter(([, t]) => re.test(comments ? t : strip(t))).map(([f]) => norm(f)).sort();

// `tickets` reads, judged by the TypeScript checker (not by text): a read outside the seam owners fails when the member
// it opens is one a seam owner declares (CallInput.tickets, RouteSpec/Route.tickets, kit.ts's), or when its receiver is
// `any` (it cannot be told apart). A read is `x.tickets`, `x?.tickets`, `x[k]` with `k` a literal or literal-typed key
// (a key typed plain `string` fails when the receiver has the seam member), and a `{ tickets }` / `{ tickets: t }`
// binding. So the help-desk `tickets` of the Support page (its own types) pass with no list to keep, and a seam read
// fails wherever it is written and whatever stands beside it.
// Not seen (stated limits): a key the checker cannot resolve to a literal and whose receiver type lacks the member
// (`(x as Record<string, unknown>)[k]`), Reflect.get / Object.entries / spread / `in`, and a cast that re-types the
// receiver to a type of its own (`(c as unknown as { tickets: T }).tickets`).
const SEAM_OWNERS = ['core/ticket.ts', 'core/kit.ts', 'core/api.ts', 'core/routes.ts'];
const HUB = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const rel = (f: string): string => f.slice(HUB.length + '/src/'.length);
const abs = (viteKey: string): string => HUB + '/src/' + norm(viteKey);
let compilerOptions: ts.CompilerOptions | null = null;
const realFiles = new Map<string, ts.SourceFile>();
/** One Program over `roots` (and what they import), with `overlay` texts in place of the files on disk. */
function program(roots: string[], overlay: Record<string, string> = {}, old?: ts.Program): ts.Program {
  if (!compilerOptions) {
    const cfg = ts.readConfigFile(HUB + '/tsconfig.json', (f) => ts.sys.readFile(f));
    compilerOptions = { ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, HUB).options, noEmit: true, types: [] };
  }
  const host = ts.createCompilerHost(compilerOptions, true);
  const readFile = host.readFile.bind(host);
  host.fileExists = (f) => f in overlay || ts.sys.fileExists(f);
  host.readFile = (f) => (f in overlay ? overlay[f] : readFile(f));
  host.getSourceFile = (f, lang) => {
    if (f in overlay) return ts.createSourceFile(f, overlay[f]!, lang, true);
    let sf = realFiles.get(f);
    if (!sf) {
      const text = readFile(f);
      if (text === undefined) return undefined;
      sf = ts.createSourceFile(f, text, lang, true);
      realFiles.set(f, sf);
    }
    return sf;
  };
  return ts.createProgram([...new Set([...roots, ...Object.keys(overlay)])], compilerOptions, host, old);
}
/** Every `tickets` read in `files` (absolute paths, none a seam owner) that opens a seam member: 'file:line: read'. */
function seamReads(p: ts.Program, files: string[]): string[] {
  const checker = p.getTypeChecker();
  const owner = (d: ts.Declaration) => SEAM_OWNERS.includes(rel(d.getSourceFile().fileName));
  /** The receiver's own types: a union is judged member by member, optional chains without their undefined. */
  const parts = (t: ts.Type): ts.Type[] => (t.isUnion() ? t.types : [t]).map((x) => checker.getApparentType(x));
  /** Whether reading `names` (null: a key not known) of an expression of type `t` can open a seam member. */
  const opens = (t: ts.Type, names: string[] | null): boolean =>
    parts(checker.getNonNullableType(t)).some((x) => (x.flags & ts.TypeFlags.Any) !== 0 || (names ?? ['tickets']).some((n) => !!x.getProperty(n)?.declarations?.some(owner)));
  /** A key's literal names, or null when the checker cannot tell them. */
  const keyNames = (e: ts.Expression): string[] | null => {
    const t = checker.getTypeAtLocation(e);
    const ts_ = t.isUnion() ? t.types : [t];
    return ts_.every((x) => x.isStringLiteral()) ? ts_.map((x) => (x as ts.StringLiteralType).value) : null;
  };
  const out: string[] = [];
  for (const f of files) {
    const sf = p.getSourceFile(f);
    if (!sf) { out.push(rel(f) + ': not in the program'); continue; }
    const hit = (n: ts.Node) => out.push(rel(f) + ':' + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1) + ': ' + n.getText(sf).replace(/\s+/g, ' ').slice(0, 80));
    const visit = (n: ts.Node): void => {
      if (ts.isPropertyAccessExpression(n) && n.name.text === 'tickets') {
        if (opens(checker.getTypeAtLocation(n.expression), ['tickets'])) hit(n);
      } else if (ts.isElementAccessExpression(n)) {
        const names = keyNames(n.argumentExpression);
        if ((names === null || names.includes('tickets')) && opens(checker.getTypeAtLocation(n.expression), names === null ? null : ['tickets'])) {
          // an `any` receiver read by a key that is not 'tickets' is not a tickets read
          if (names !== null || parts(checker.getNonNullableType(checker.getTypeAtLocation(n.expression))).some((x) => !!x.getProperty('tickets')?.declarations?.some(owner))) hit(n);
        }
      } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent) && !n.dotDotDotToken) {
        const key = n.propertyName ?? n.name;
        const name = ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : ts.isComputedPropertyName(key) ? keyNames(key.expression) : null;
        const names = typeof name === 'string' ? [name] : name;
        if ((names === null || names.includes('tickets')) && opens(checker.getTypeAtLocation(n.parent), ['tickets'])) hit(n);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out.sort();
}
/** The files the guard reads: every source outside the seam owners that spells `tickets` (any read must, but a
 *  computed key: see the limits above). */
const candidates = (): string[] => Object.entries(src).filter(([f, t]) => /\btickets\b/.test(t) && !SEAM_OWNERS.includes(norm(f))).map(([f]) => abs(f)).sort();
let realProgram: ts.Program | null = null;
let realMs = 0;
const real = (): ts.Program => {
  if (!realProgram) {
    const t0 = performance.now();
    realProgram = program(candidates());
    realMs = performance.now() - t0;
  }
  return realProgram;
};

describe('the old lease seam is gone', () => {
  it('no source or test names setApproverLeaseSource, LeaseQuery, leaseFor, leasePass or APPROVER_LEASE_ROUTES', () => {
    const own = (f: string) => f.endsWith('tickets.conformance.test.ts');
    const hits = Object.entries(all).filter(([f, t]) => !own(f) && /\b(setApproverLeaseSource|LeaseQuery|leaseFor|leasePass|APPROVER_LEASE_ROUTES)\b/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('RouteSpec has no `lease` member: a route declares tickets', () => {
    expect(strip(src['./routes.ts']!)).not.toMatch(/\blease\?\s*:\s*true/);
    expect(strip(src['./routes.ts']!)).not.toMatch(/readonly lease:\s*boolean/);
  });
});

describe('X-Hoody-Approver-Lease', () => {
  it('is written only by core\'s ticket step (kit.ts)', () => {
    // The terminal's transport names it to police it (an allowed name, a header it skips or checks), never to set it.
    const police = ['term/app/cli-client.ts', 'term/app/live-policy.ts', 'term/app/live-wire.ts'];
    expect(files(/X-Hoody-Approver-Lease/i)).toEqual(['core/kit.ts', ...police]);
    const name = String.raw`(?:LEASE|['"\`]x-hoody-approver-lease['"\`])`;
    for (const f of police) {
      const t = strip(src['../' + f]!);
      expect(t, f).not.toMatch(new RegExp(String.raw`\[\s*${name}\s*\]\s*=(?!=)`, 'i'));
      expect(t, f).not.toMatch(new RegExp(String.raw`\.(?:set|append)\(\s*${name}`, 'i'));
      expect(t, f).not.toMatch(new RegExp(String.raw`(?:\[\s*${name}\s*\]|['"\`]x-hoody-approver-lease['"\`])\s*:`, 'i'));
    }
  });
  it('kit.ts sets it from the spent lease ticket\'s spend (in the send) and from nothing else', () => {
    const k = strip(src['./kit.ts']!);
    const sets = k.match(/extra\[\s*'X-Hoody-Approver-Lease'\s*\]\s*=\s*([^;]+);/g) ?? [];
    expect(sets).toEqual([]);
    const hs = k.match(/\[\s*'X-Hoody-Approver-Lease'\s*\]\s*=\s*([^;]+);/g) ?? [];
    expect(hs).toEqual(["['X-Hoody-Approver-Lease'] = sp.lease;"]);
  });
});

describe('who mints and who reads tickets', () => {
  it('claimTickets( is called only by the journal door and the approver custody', () => {
    const callers = files(/\bclaimTickets\s*\(/).filter((f) => f !== 'core/ticket.ts');
    for (const f of callers) expect(['ask/journal/door.ts', 'kit/agent/approver-custody.ts'], f).toContain(f);
  });
  it('only core\'s admission and call helper open the tickets of a call', () => {
    const readers = files(/\b(admitTickets|answerTickets|settleTickets|declaredTickets)\b/).filter((f) => !['core/ticket.ts', 'core/kit.ts', 'core/api.ts', 'core/routes.ts'].includes(f));
    expect(readers).toEqual([]);
  });
  it('no module outside core reads a seam `tickets` member (a caller only passes `tickets:` to api())', () => {
    const p = real();
    // the Support page's help-desk reads are in the program and judged, not skipped
    // (data.pure.ts holds the reads since the terminal port split data.ts)
    for (const f of ['pages/support/logic.ts', 'pages/support/data.pure.ts']) expect(candidates()).toContain(HUB + '/src/' + f);
    expect(seamReads(p, candidates())).toEqual([]);
    // the cost of the one Program (ms)
    expect(realMs).toBeLessThan(60_000);
  }, 120_000);
  it('the checker sees through the swaps: a seam read fails wherever it stands, the help-desk reads pass', () => {
    const logicF = HUB + '/src/pages/support/logic.ts';
    const logic = src['../pages/support/logic.ts']!;
    const dir = HUB + '/src/pages/zz-seam-selftest/';
    const head = "import type { CallInput, Route } from '@core';\n";
    const cases: Record<string, string> = {
      dot: 'export const r = (c: CallInput) => c.tickets;',
      optional: 'export const r = (c?: CallInput) => c?.tickets;',
      element: "export const r = (c: CallInput) => c['tickets'];",
      literalKey: "const key = 'tickets'; export const r = (c: CallInput) => c[key];",
      keyofKey: 'export const r = (c: CallInput, k: keyof CallInput) => c[k];',
      stringKey: 'export const r = (c: CallInput, k: string) => (c as unknown as Record<string, unknown> & CallInput)[k];',
      destructure: 'export const r = (c: CallInput) => { const { tickets } = c; return tickets; };',
      renamed: 'export const r = (c: CallInput) => { const { tickets: t } = c; return t; };',
      param: 'export const r = ({ tickets }: CallInput) => tickets;',
      partial: 'export const r = (c: Partial<CallInput>) => c.tickets;',
      union: 'export const r = (c: CallInput | { other: 1 }) => (c as CallInput).tickets;',
      alias: 'export const r = (c: CallInput) => { const x = c; return x.tickets; };',
      chained: 'export const r = (o: { d: CallInput }) => o.d.tickets;',
      call: 'const f = (): CallInput => ({}); export const r = f().tickets;',
      route: 'export const r = (x: Route) => x.tickets;',
      anyRecv: 'export const r = (c: any) => c.tickets;',
    };
    const overlay: Record<string, string> = Object.fromEntries(Object.entries(cases).map(([k, v]) => [dir + k + '.ts', head + v]));
    // not seam reads: a help-desk shape of a page's own, and a non-tickets key of an `any`
    overlay[dir + 'helpdesk.ts'] = 'export const r = (p: { tickets: number[] }) => { const { tickets } = p; return p.tickets.length + tickets.length + p["tickets"].length; };';
    overlay[dir + 'anyOther.ts'] = "export const r = (c: any) => c['other'];";
    // One swap (an exempt read rewritten as element access, plus a new seam read), another (an uncounted computed read plus
    // an anonymous callback inside the same function), and one more read in that same function
    const swaps: Record<string, string> = {
      r1: logic.replace('d.tickets', "d['tickets']") + '\nexport const s = (d: CallInput) => d.tickets;',
      r2: logic.replace('Array.isArray(d.tickets)', "Array.isArray(d[String('tickets')]) && ((x: CallInput) => x.tickets)({})"),
      same: logic.replace('  const d = dataOf(raw);', '  const d = dataOf(raw);\n  const seam = (raw as CallInput).tickets;\n  void seam;'),
    };
    const p = program([], overlay, real());
    const all = seamReads(p, Object.keys(overlay));
    for (const k of Object.keys(cases)) expect(all.filter((h) => h.startsWith('pages/zz-seam-selftest/' + k + '.ts:')), k).toHaveLength(1);
    expect(all.filter((h) => /helpdesk|anyOther/.test(h))).toEqual([]);
    for (const [k, t] of Object.entries(swaps)) {
      expect(t, k).not.toBe(logic);
      const q = program([], { [logicF]: "import type { CallInput } from '@core';\n" + t }, real());
      expect(seamReads(q, [logicF]), k).toHaveLength(1);
    }
    // the real file, judged alone, has none
    expect(seamReads(real(), [logicF])).toEqual([]);
  }, 120_000);
  it('@core exports the seam the fork flow and the approver need: claimTickets, isIdemKey, attemptStored and their types', () => {
    // @core is the live barrel (index.live.ts, the terminal ship build's '@core') re-exported whole, plus fixture names.
    expect(strip(src['./index.ts']!)).toMatch(/^export \* from '\.\/index\.live';$/m);
    const idx = strip(src['./index.live.ts']!);
    for (const name of ['claimTickets', 'resetTickets', 'isIdemKey', 'attemptStored']) expect(idx, name).toMatch(new RegExp('\\b' + name + '\\b'));
    for (const name of ['StoredHold', 'Ticket', 'TicketIssuer', 'TicketBind', 'TicketCall', 'TicketSettled', 'Need', 'Tri']) expect(idx, name).toMatch(new RegExp('\\btype ' + name + '\\b|\\b' + name + '\\b'));
  });
  it('ticket.ts imports nothing but the Route type', () => {
    const imports = [...src['./ticket.ts']!.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['./routes']);
  });
  it('core imports nothing from ask/ or kit/agent', () => {
    const bad = Object.entries(src).filter(([f]) => f.startsWith('./')).filter(([, t]) => /from '\.\.\/(ask|kit\/agent)\b/.test(t)).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});
