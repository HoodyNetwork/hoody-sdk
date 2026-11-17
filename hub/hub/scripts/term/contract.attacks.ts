// Attacks on the contract gate, and the self-test that runs them:
//   NODE_ENV=test bun scripts/term/contract.attacks.ts      every attack must fail the gate as expected; exit 1 if not
// (child processes, so not a term test). As a preload into contract.ts, each attack named in CONTRACT_ATTACK rewrites
// a sibling or scenario file IN MEMORY (fs.readFileSync is wrapped; never on disk; the TypeScript host reads Buffers) the way a hurried author would silence a failure.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface Edit { file: string; from: string; to: string }
const FB = 'src/kit/controls/FileButton.term.tsx';
const FBS = 'src/kit/controls/FileButton.scenario.ts';
const LINK = 'src/kit/controls/Link.term.tsx';
const SSS = 'src/pages/account/parts/SecuritySummary.scenario.ts';
const LDP = 'src/kit/layouts/ListDetailPage.term.tsx';

/** Each attack: its edits, and a text the gate's NEW failures must contain. */
export const ATTACKS: Record<string, { edits: Edit[]; expect: string }> = {
  // Destructure and discard.
  voidRead: {
    edits: [{ file: FB, from: 'const off = isDisabled || busy === true;\n  const reason = isDisabled ? disabledReason : webOnly;', to: 'void isDisabled;\n  const off = busy === true;\n  const reason = off ? disabledReason : webOnly;' }],
    expect: 'unread prop FileButton.isDisabled',
  },
  // Spread into nothing.
  restVoid: {
    edits: [{ file: FB, from: 'disabledReason, busy }) => {', to: 'disabledReason, ...rest }) => {\n  void rest;\n  const busy = undefined as boolean | undefined;' }],
    expect: 'unread prop FileButton.busy',
  },
  // A one-letter reason.
  junkReason: {
    edits: [{ file: FBS, from: "accept: 'no file chooser in the terminal'", to: "accept: 'x'" }],
    expect: 'reason too short for FileButton.accept',
  },
  // Covers on a case that asserts nothing.
  coversNoAssert: {
    edits: [{ file: FBS, from: '  cases: [\n', to: "  cases: [\n    { name: 'claims the props', props: { label: 'Upload key' }, covers: ['isDisabled', 'busy'], steps: [], expect: {} },\n" }],
    expect: 'covers without an assertion FileButton: "claims the props"',
  },
  // The double cast.
  asUnknown: {
    edits: [{ file: FB, from: 'const off = isDisabled || busy === true;', to: 'const off = (isDisabled as unknown as boolean) || busy === true;' }],
    expect: 'any escape `isDisabled as unknown as boolean`',
  },
  // An any-typed helper outside the component.
  anyHelper: {
    edits: [{ file: FB, from: "export type { FileButtonProps } from './FileButton';", to: "export type { FileButtonProps } from './FileButton';\nconst Faint = (p: any) => p;\nvoid Faint;" }],
    expect: 'any escape parameter p typed any',
  },
  // A reason that is not one.
  contractAnyX: {
    edits: [{ file: FB, from: 'const off = isDisabled || busy === true;', to: 'const off = (isDisabled as any) || busy === true; // contract-any: x' }],
    expect: 'any escape `isDisabled as any`',
  },
  // Page proof that proves nothing: a shot that only draws the state (no press) is refused.
  pageProofStatic: {
    edits: [{ file: SSS, from: "  pageProof: { onOpen: 'account/twofa-turn-on' },", to: "  pageProof: { onOpen: 'account/twofa-off' }," }],
    expect: 'pageProof SecuritySummary.onOpen names no driving shot (account/twofa-off: shot twofa-off presses nothing',
  },
  // Not an attack: a page proof that does prove (a shot that presses and waits); run alone, it must add no failure.
  pageProofDriving: {
    edits: [{ file: SSS, from: "  pageProof: { onOpen: 'account/twofa-turn-on' },", to: "  pageProof: { onOpen: 'account/twofa-off-pending' }," }],
    expect: '',
  },
  // An engine field read by name outside ENGINE_FIELD_ALLOW: another field with Reflect.get, and the allowed field in another form.
  engineReflect: {
    edits: [{ file: FB, from: "export type { FileButtonProps } from './FileButton';", to: "export type { FileButtonProps } from './FileButton';\nconst probe = (x: object): unknown => Reflect.get(x, '_link');\nvoid probe;" }],
    expect: 'engine field `_link` read by name (Reflect.get)',
  },
  engineBracket: {
    edits: [{ file: LDP, from: "Reflect.get(c, '_positionType') === 'absolute'", to: "c['_positionType'] === 'absolute'" }],
    expect: 'engine field `_positionType` read by name (bracket)',
  },
  // A "look only" prop that changes behaviour (TextButton presses twice when tone is danger).
  dangerDouble: {
    edits: [{ file: LINK, from: 'onPress={() => { onPress?.(PRESS); submit(); }}', to: "onPress={() => { onPress?.(PRESS); if (tone === 'danger') onPress?.(PRESS); submit(); }}" }],
    expect: 'ignored prop TextButton.tone reaches a handler',
  },
};

const on = (process.env.CONTRACT_ATTACK ?? '').split(',').filter(Boolean);
if (on.length) {
  const HUB = path.resolve(import.meta.dir, '../..');
  const edits = on.flatMap((a) => { if (!ATTACKS[a]) throw new Error(`contract.attacks.ts: unknown attack ${a}`); return ATTACKS[a]!.edits; });
  const hit = new Set<Edit>();
  const real = new Map(edits.map((e) => [fs.realpathSync.native(path.join(HUB, e.file)), e.file]));
  const orig = fs.readFileSync;
  (fs as { readFileSync: unknown }).readFileSync = function patched(this: unknown, file: unknown, opts?: unknown) {
    const out = (orig as (...a: unknown[]) => unknown).call(this, file, opts);
    if (typeof file !== 'string' || !/\.(tsx?|mts)$/.test(file)) return out;
    let rp: string;
    try { rp = fs.realpathSync.native(file); } catch { return out; }
    const rel = real.get(rp);
    if (!rel) return out;
    let text = typeof out === 'string' ? out : Buffer.from(out as Uint8Array).toString('utf8');
    for (const e of edits) if (e.file === rel) {
      if (!text.includes(e.from)) throw new Error(`contract.attacks.ts: ${e.file} changed; the anchor is gone: ${e.from.slice(0, 60)}`);
      text = text.replace(e.from, e.to);
      hit.add(e);
    }
    return typeof out === 'string' ? text : Buffer.from(text, 'utf8');
  };
  process.on('exit', () => { if (hit.size < edits.length) process.stderr.write(`contract.attacks.ts: ${edits.length - hit.size} edits never applied (the gate did not read the file)\n`); });
}

// ---- self-test -------------------------------------------------------------------------------------------------
if (import.meta.main) {
  const { spawnSync } = await import('node:child_process');
  const HUB = path.resolve(import.meta.dir, '../..');
  const base = process.env.SCRATCH_DIR ?? path.join(HUB, '.term-cache');
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'contract-attacks-'));
  let bad = 0;
  const say = (ok: boolean, line: string) => { if (!ok) bad++; process.stdout.write(`${ok ? 'caught' : 'MISSED'}  ${line}\n`); };
  const run = (attacks: string[], extra: string[] = [], env: Record<string, string> = {}) => spawnSync(process.execPath, ['--preload', import.meta.path, path.join(import.meta.dir, 'contract.ts'), '--json', ...extra], {
    cwd: HUB, encoding: 'utf8', timeout: 900_000, maxBuffer: 256 << 20, env: { ...process.env, NODE_ENV: 'test', CONTRACT_ATTACK: attacks.join(','), ...env },
  });
  const failuresOf = (stdout: string): string[] => {
    const j = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { behaviour: { fresh: string[] } };
    return j.behaviour.fresh;
  };
  // An attack whose anchor text is gone (its file moved on) is reported as such and left out, never a crash of its group.
  const anchored = new Set(Object.keys(ATTACKS).filter((a) => {
    const gone = ATTACKS[a]!.edits.find((e) => !fs.readFileSync(path.join(HUB, e.file), 'utf8').includes(e.from));
    if (gone) say(false, `${a.padEnd(15)} anchor missing in ${gone.file}: ${gone.from.slice(0, 60)}`);
    return !gone;
  }));
  // All attacks in one program (each touches its own text; their expected failures are distinct).
  const all = Object.keys(ATTACKS).filter((a) => anchored.has(a) && !['restVoid', 'asUnknown', 'contractAnyX', 'pageProofDriving'].includes(a));
  for (const group of [all, ...['restVoid', 'asUnknown', 'contractAnyX'].filter((a) => anchored.has(a)).map((a) => [a])]) {
    const r = run(group);
    let fresh: string[] = [];
    try { fresh = failuresOf(r.stdout); } catch { say(false, `${group.join(',')}: no JSON (exit ${r.status}): ${(r.stderr ?? '').slice(-400)}`); continue; }
    for (const a of group) say(r.status === 1 && fresh.some((k) => k.includes(ATTACKS[a]!.expect)), `${a.padEnd(15)} ${ATTACKS[a]!.expect}`);
  }
  // Page proof that does prove: a shot that presses and waits lets zero cases pass (the debt entry for "has no cases"
  // then reads fixed-but-listed, which is how the run shows the rule accepted it).
  if (anchored.has('pageProofDriving')) {
    const r = run(['pageProofDriving']);
    let j: { behaviour: { fresh: string[]; fixed?: string[] } } | null = null;
    try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { /* reported below */ }
    const fresh = j?.behaviour.fresh ?? ['(no JSON)'];
    say(!fresh.some((k) => k.includes('SecuritySummary')), `pageProof with a driving shot accepted (new SecuritySummary failures: ${fresh.filter((k) => k.includes('SecuritySummary')).join('; ') || 'none'})`);
  }
  // --write-debt refuses to add an entry without --allow-growth, and names each one with it (on a copy of the debt).
  const debtCopy = path.join(tmp, 'contract.debt.json');
  fs.copyFileSync(path.join(import.meta.dir, 'contract.debt.json'), debtCopy);
  const before = fs.readFileSync(debtCopy, 'utf8');
  const r1 = spawnSync(process.execPath, ['--preload', import.meta.path, path.join(import.meta.dir, 'contract.ts'), '--write-debt'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, env: { ...process.env, NODE_ENV: 'test', CONTRACT_ATTACK: 'junkReason', CONTRACT_DEBT_FILE: debtCopy } });
  say(r1.status === 2 && fs.readFileSync(debtCopy, 'utf8') === before && /would ADD \d+ entries/.test(r1.stderr), `write-debt without --allow-growth refused (exit ${r1.status}), file unchanged`);
  const r2 = spawnSync(process.execPath, ['--preload', import.meta.path, path.join(import.meta.dir, 'contract.ts'), '--write-debt', '--allow-growth'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, env: { ...process.env, NODE_ENV: 'test', CONTRACT_ATTACK: 'junkReason', CONTRACT_DEBT_FILE: debtCopy } });
  say(/DEBT ADDED \(--allow-growth\): .*reason too short for FileButton\.accept/.test(r2.stdout), 'write-debt --allow-growth names the entry it adds');
  // Fixed entries: a listed entry that no longer fails is reported, and --update-debt never adds one.
  const r3 = spawnSync(process.execPath, [path.join(import.meta.dir, 'contract.ts'), '--update-debt'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, env: { ...process.env, NODE_ENV: 'test', CONTRACT_DEBT_FILE: debtCopy } });
  say(!fs.readFileSync(debtCopy, 'utf8').includes('FileButton.accept'), `update-debt dropped the fixed entry (exit ${r3.status})`);
  // At run time: a case that covers a prop while asserting something else is refused by the prop's mutant.
  const scen = path.join(tmp, 'FileButton.covers.scenario.ts');
  fs.writeFileSync(scen, fs.readFileSync(path.join(HUB, FBS), 'utf8').replace('  cases: [\n', "  cases: [\n    { name: 'claims busy, asserts the label', props: { label: 'Upload key' }, covers: ['busy'], steps: [], expect: { nodes: [{ target: { role: 'button', name: 'Upload key' } }] } },\n"));
  const r4 = spawnSync(process.execPath, [path.join(import.meta.dir, 'scenarios.ts'), '--mutants', '--override', `${FBS}=${scen}`, 'FileButton.scenario.ts'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, env: { ...process.env, NODE_ENV: 'test' } });
  say(r4.status === 1 && /covers busy UNPROVEN in "claims busy, asserts the label"/.test(r4.stdout), `covers claim checked by the mutant (scenarios.ts --mutants exit ${r4.status})`);
  // The mutants cover every exercised prop, not only the safety list: FileButton.label is not a safety prop.
  say(/mutant label: killed/.test(r4.stdout), 'a non-safety exercised prop (FileButton.label) is mutated');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.stdout.write(`contract attacks: ${bad ? `${bad} MISSED` : 'all caught'}\n`);
  process.exit(bad ? 1 : 0);
}
