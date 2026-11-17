// Attacks on the secret gate (attacks X1-X12, and the revealed state), and the self-test that runs them:
//   NODE_ENV=test bun scripts/term/secrets.attacks.ts       every attack must be caught where expected; exit 1 if not
// (child processes, so not a term test: those refuse spawning). As a preload into a gate child (`bun --preload ./scripts/term/secrets.attacks.ts scripts/term/secrets.ts --child demo`); each
// attack named in SECRETS_ATTACK rewrites source IN MEMORY (source-hooks.ts, never on disk): the demo page's fixtures
// gain one fake secret literal per attack (under a secret-named key), and the terminal shell draws a probe that leaks
// that secret in that attack's way. Every secret starts differently, so a hit names its attack.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import path from 'node:path';
import { addSourceHook } from '../../src/term/scenario/source-hooks';

export interface Attack {
  /** The fixture key the secret sits under (a SECRET_KEY name). */
  key: string;
  value: string;
  jsx?: string;
  effect?: string;
}

/** `$` in jsx/effect is the attack's secret. */
export const ATTACKS: Record<string, Attack> = {
  control: { key: 'token', value: 'atkControlAlphaBravo01', jsx: `<Text>{$}</Text>` },
  // Drawn only on a narrow terminal (the gate must draw 80x24 too).
  narrow: { key: 'password', value: 'atkNarrowCharlieDelta02', jsx: `{__w < 100 ? <Text>{$}</Text> : null}` },
  // The first 18 characters.
  prefix: { key: 'passphrase', value: 'atkPrefixEchoFoxtrotGolf03', jsx: `<Text>{$.slice(0, 18)}</Text>` },
  // Split over two lines.
  split: { key: 'client_secret', value: 'atkSplitHotelIndiaJuliet04', jsx: `<Box flexDirection="column"><Text>{$.slice(0, 13)}</Text><Text>{$.slice(13)}</Text></Box>` },
  // Spaced letters.
  spaced: { key: 'api_key', value: 'atkSpacedKiloLimaMike05', jsx: `<Text>{$.split('').join(' ')}</Text>` },
  // A semantics name only (agents read it; the frame shows "key ready").
  treeName: { key: 'private_key', value: 'atkTreeNovemberOscar06', jsx: `<Text sem={{ role: 'note', name: $ }}>key ready</Text>` },
  // Console.
  console: { key: 'refresh_token', value: 'atkConsolePapaQuebec07', effect: `console.warn('save failed for ' + $);` },
  consoleError: { key: 'access_token', value: 'atkErrorRomeoSierra08', effect: `console.error('save failed for ' + $);` },
  // Clipboard echo on mount.
  clipboard: { key: 'session_token', value: 'atkClipTangoUniform09', effect: `(__r as unknown as { copyToClipboardOSC52(t: string): boolean }).copyToClipboardOSC52($);` },
  // The terminal title, through the engine and as raw OSC 0 bytes.
  title: { key: 'otp_secret', value: 'atkTitleVictorWhiskey10', effect: `(__r as unknown as { setTerminalTitle(t: string): void }).setTerminalTitle('hub ' + $);` },
  stdio: { key: 'mnemonic', value: 'atkStdioXrayYankee11', effect: `process.stdout.write('\\x1b]0;' + $ + '\\x07');` },
  // Revealed: Show inside a secret group draws the value OUTSIDE the group (only inside may it show).
  revealOutside: { key: 'credential', value: 'atkOutsideZuluAlpha12', jsx: `<Box flexDirection="column"><Box sem={{ role: 'group', name: 'Probe secret one', secret: true }}><Pressable sem={{ name: 'Show' }} onPress={() => __setShown(true)}><Text>Show</Text></Pressable></Box>{__shown ? <Text>{$}</Text> : null}</Box>` },
  // Revealed inside its own group on screen: the one place it may show (no leak).
  revealInside: { key: 'envelope', value: 'atkInsideGolfHotel16', jsx: `<Box sem={{ role: 'group', name: 'Probe secret three', secret: true }} flexDirection="column"><Pressable sem={{ name: 'Show' }} onPress={() => __setShown3(true)}><Text>Show</Text></Pressable><Text>{__shown3 ? $ : '••••'}</Text></Box>` },
  // Revealed, inside the group on screen but named in the tree.
  revealTree: { key: 'cookie', value: 'atkRevTreeBravoCharlie13', jsx: `<Box sem={{ role: 'group', name: 'Probe secret two', secret: true }} flexDirection="column"><Pressable sem={{ name: 'Show' }} onPress={() => __setShown2(true)}><Text>Show</Text></Pressable>{__shown2 ? <Box sem={{ role: 'note', name: $ }}><Text>·</Text></Box> : null}</Box>` },
  // Typed: what is typed into a secret input echoed in plain text (the canary must be caught).
  typedEcho: { key: 'seed', value: 'atkTypedDeltaEcho14', jsx: `<Box flexDirection="column"><__TextInput sem={{ name: 'Probe password', secret: true }} value={__typed} onChange={__setTyped} /><Text>{'you typed ' + __typed}</Text></Box>` },
  // A hand-off whose route carries the secret below the page path, in a search value and in the fragment. The
  // address (drawn, linked, copied, opened, QR-encoded) keeps only the declared page path: no leak anywhere. Fails on a
  // hand-off that copies the route's sub-path or search.
  handoff: { key: 'invite_token', value: 'atkHandoffIndiaJuliet17', jsx: `<__Handoff reason="Probe hand-off." what="probe" to={'/demo/' + $ + '?invite_token=' + $ + '#' + $} />` },
  // A crash whose message carries the secret.
  crash: { key: 'key_material', value: 'atkCrashFoxtrotGolf15', jsx: `{(() => { throw new Error('login failed: ' + $); })()}` },
};

const FLOW_ATTACKS = ['envEcho', 'envKept', 'envUnmasked', 'envUnmarked', 'envUnmaskedNarrow', 'envRenamed', 'envBlurNarrow'];
const on = (process.env.SECRETS_ATTACK ?? '').split(',').filter((a) => a && !FLOW_ATTACKS.includes(a));
const SHELL = path.join('src', 'term', 'shell', 'TermShell.tsx');
const lit = (a: Attack): string => JSON.stringify(a.value);

if (on.length) {
  for (const a of on) if (!ATTACKS[a]) throw new Error(`secrets.attacks.ts: unknown attack ${a}`);
  const sel = on.map((a) => ATTACKS[a]!);
  const jsx = sel.map((a) => (a.jsx ?? '').replaceAll('$', lit(a))).join('');
  // Each effect alone in a try: the test renderer may refuse one (no title there), and the others must still run.
  const effects = sel.filter((a) => a.effect).map((a) => `try { ${a.effect!.replaceAll('$', lit(a))} } catch { /* refused */ }`).join('\n');
  addSourceHook((f, s) => {
    if (f.endsWith(path.join('src', 'pages', 'demo', 'fixtures.ts'))) {
      return s + `\nconst __attackVectors = [${sel.map((a) => `{ ${a.key}: '${a.value}' }`).join(', ')}];\nvoid __attackVectors;\n`;
    }
    if (f.endsWith(SHELL)) {
      if (!s.includes('<Toaster />')) throw new Error('secrets.attacks.ts: TermShell has no <Toaster /> anchor');
      const comp = `\nimport { TextInput as __TextInput } from '../prim';\nimport { Handoff as __Handoff } from '@kit/states/Handoff';\nfunction __Probe(): ReactNode {\n  const __r = useRenderer();\n  const { width: __w } = useTerminalSize();\n  const [__shown, __setShown] = useState(false);\n  const [__shown2, __setShown2] = useState(false);\n  const [__shown3, __setShown3] = useState(false);\n  const [__typed, __setTyped] = useState('');\n  void __r; void __w; void __shown; void __shown2; void __shown3; void __typed;\n  useEffect(() => { ${effects} }, []);\n  return <Box flexDirection="column">${jsx}</Box>;\n}\n`;
      return s.replace('<Toaster />', '<Toaster /><__Probe />') + comp;
    }
    return s;
  });
}

// Attacks on the computers env flows (SECRET_FLOWS computers): the create drawer and the secret field are rewritten
// in memory.
//   envEcho: the create logs its body (the env value) once it is done: the flow's typed value is caught on the console.
//   envKept: the drawer stays open after a create (no close): the flow's `absent|dialog|…` step fails it.
//   envUnmasked: the secret field draws what is typed (masking off; the field is still marked secret, so the typed
//     value is still a needle): each env flow's `shot|env-typed` state shows the value in its frame. It proves every flow
//     reaches the value field and types into it.
//   envUnmarked: the secret field loses its secret mark (semantics only): each env flow's `secret|…` step fails it, and
//     with envUnmasked too the typed value is still found (the flow declares it secret, so the search never depends on
//     the mark).
//   envUnmaskedNarrow: the secret field draws what is typed only in a terminal under 100 columns: only the `shot|env-typed`
//     state's 80x24 frame shows the value (the drawer is closed by every later state), so it proves that state is
//     judged at the narrow size too.
//   envRenamed: the secret field answers to another name: each env flow's `secret|…` step finds no control, and the
//     error names the declared value by its length only (it is not a needle yet, so redaction could not hide it).
//   envBlurNarrow: the secret field drops the focus (nothing focused) once the terminal is under 100 columns: each env
//     flow's `shot|env-typed` step fails with "the resize to 80x24 lost the focus" (the focus is read before the
//     resize; read after it, nothing is focused and the loss passed unseen).
const CREATE = path.join('src', 'pages', 'computers', 'parts', 'CreateDrawer.tsx');
const DONE = '        onDone();\n        onClose();\n        void afterProof(made, t);';
const SECRET_INPUT = path.join('src', 'kit', 'forms', 'Secret.term.tsx');
const MASKED = '  const masked = !(shown && reveal);';
const MARK = "const sem: Sem = { secret: true, name: label ?? rest['aria-label'], ";
const NAMED = "name: label ?? rest['aria-label'], ";
const flowOn = (process.env.SECRETS_ATTACK ?? '').split(',').filter((a) => FLOW_ATTACKS.includes(a));
if (flowOn.length) {
  addSourceHook((f, s) => {
    if (f.endsWith(SECRET_INPUT) && flowOn.some((a) => a === 'envUnmasked' || a === 'envUnmarked' || a === 'envUnmaskedNarrow' || a === 'envRenamed' || a === 'envBlurNarrow')) {
      let out = s;
      if (flowOn.includes('envBlurNarrow')) {
        if (!out.includes(MASKED)) throw new Error('secrets.attacks.ts: Secret.term.tsx changed; the SecretInput mask anchor is gone');
        out = out.replace(MASKED, '  const __blurFocus = __blurFocusControl();\n  const { width: __blurWidth } = __blurTerminalSize();\n  useEffect(() => { if (__blurWidth < 100) __blurFocus.blur(); }, [__blurWidth, __blurFocus]);\n' + MASKED);
        out += "\nimport { useTerminalSize as __blurTerminalSize, useFocusControl as __blurFocusControl } from '../../term/prim';\n";
      }
      if (flowOn.includes('envUnmasked') || flowOn.includes('envUnmaskedNarrow')) {
        if (!out.includes(MASKED)) throw new Error('secrets.attacks.ts: Secret.term.tsx changed; the SecretInput mask anchor is gone');
        if (flowOn.includes('envUnmasked')) out = out.replace(MASKED, '  const masked = false;');
        else {
          out = out.replace(MASKED, '  const { width: __attackWidth } = __attackTerminalSize();\n  const masked = __attackWidth < 100 ? false : !(shown && reveal);');
          out += "\nimport { useTerminalSize as __attackTerminalSize } from '../../term/prim';\n";
        }
      }
      const mark = flowOn.includes('envUnmarked') ? MARK.replace('secret: true', 'secret: false') : MARK;
      if (flowOn.includes('envUnmarked')) {
        if (!out.includes(MARK)) throw new Error('secrets.attacks.ts: Secret.term.tsx changed; the SecretInput secret-mark anchor is gone');
        out = out.replace(MARK, mark);
      }
      if (flowOn.includes('envRenamed')) {
        if (!out.includes(mark)) throw new Error('secrets.attacks.ts: Secret.term.tsx changed; the SecretInput name anchor is gone');
        out = out.replace(mark, mark.replace(NAMED, "name: 'Renamed field', "));
      }
      return out;
    }
    if (!f.endsWith(CREATE) || !flowOn.some((a) => a === 'envEcho' || a === 'envKept')) return s;
    if (!s.includes(DONE)) throw new Error('secrets.attacks.ts: CreateDrawer.tsx changed; the create-done anchor is gone');
    let out = s;
    if (flowOn.includes('envEcho')) out = out.replace(DONE, `${DONE}\n        console.warn('created ' + JSON.stringify(r.body));`);
    if (flowOn.includes('envKept')) out = out.replace(DONE, '        onDone();\n        void afterProof(made, t);');
    return out;
  });
}

// ---- self-test -------------------------------------------------------------------------------------------------
interface Out { cases: string[]; reveals: number; canaries: number; leaks: Array<{ case: string; where: string; key: string; length: number }>; error?: string }
/** Each attack: the leak rows it must produce (`<state> <where>`, state without the case name), exactly or at least. */
const EXPECT: Record<string, { exact?: string[]; has?: string[]; not?: RegExp }> = {
  control: { has: ['@120x40 frame', '@120x40 tree', '@120x40 json', '@80x24 frame'] },
  narrow: { has: ['@80x24 frame'], not: /^@120x40/ },
  prefix: { has: ['@120x40 frame', '@80x24 frame'] },
  split: { has: ['@120x40 frame', '@120x40 tree'] },
  spaced: { has: ['@120x40 frame', '@120x40 tree'] },
  treeName: { has: ['@120x40 tree', '@120x40 json'], not: /frame$/ },
  console: { exact: [' console'] },
  consoleError: { exact: [' console'] },
  clipboard: { exact: [' clipboard'] },
  title: { exact: [' osc'] },
  stdio: { exact: [' stdio'] },
  typedEcho: { exact: ['/typed@80x24 frame', '/typed@80x24 json', '/typed@80x24 tree'] },
  revealOutside: { exact: ['/revealed@120x40 frame', '/revealed@120x40 json', '/revealed@120x40 tree', '/revealed@80x24 frame', '/revealed@80x24 json', '/revealed@80x24 tree'] },
  revealTree: { exact: ['/revealed@120x40 json', '/revealed@120x40 tree', '/revealed@80x24 json', '/revealed@80x24 tree'] },
  revealInside: { exact: [] },
  handoff: { exact: [] },
  crash: { has: [] },
};
const GROUPS = [
  ['control', 'narrow', 'prefix', 'split', 'spaced', 'treeName', 'console', 'consoleError', 'clipboard', 'title', 'stdio', 'typedEcho', 'handoff'],
  ['revealOutside', 'revealTree', 'revealInside'],
  ['crash'],
];

if (import.meta.main) {
  const { spawnSync } = await import('node:child_process');
  const { hitOf, SECRET_FLOWS, shotTagRefusal } = await import('./secrets');
  const HUB = path.resolve(import.meta.dir, '../..');
  const env = (attacks: string[], extra: Record<string, string> = {}) => ({ ...process.env, NODE_ENV: 'test', SECRETS_ATTACK: attacks.join(','), SECRETS_CASES: '^many$', ...extra });
  let bad = 0;
  const say = (ok: boolean, line: string) => { if (!ok) bad++; process.stdout.write(`${ok ? 'caught' : 'MISSED'}  ${line}\n`); };
  for (const g of GROUPS) {
    const r = spawnSync(process.execPath, ['--preload', import.meta.path, path.join(import.meta.dir, 'secrets.ts'), '--child', 'demo'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20, env: env(g) });
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@SECRETS@@'));
    const out = line ? JSON.parse(line.slice(11)) as Out : null;
    if (!out || out.error || out.cases.length !== 1) { say(false, `${g.join(',')}: the child drew nothing (${out?.error ?? `exit ${r.status ?? r.signal}`})`); continue; }
    for (const a of g) {
      const at = ATTACKS[a]!;
      const key = a === 'typedEcho' ? 'canary' : at.key;
      const got = [...new Set(out.leaks.filter((l) => l.key === key && (a === 'typedEcho' || l.length === at.value.length)).map((l) => `${l.case.replace(/^many/, '')} ${l.where}`))].sort();
      const e = EXPECT[a]!;
      const ok = (e.exact ? JSON.stringify(got) === JSON.stringify([...e.exact].sort()) : (e.has ?? []).every((h) => got.includes(h)) && (a !== 'crash' || got.length > 0))
        && !(e.not && got.some((x) => e.not!.test(x)));
      say(ok, `${a.padEnd(14)} ${got.join(', ') || '(no leak)'}`);
    }
    if (g.includes('typedEcho')) say(out.canaries === 1, `canaries typed: ${out.canaries} (expected 1)`);
    if (g.includes('revealOutside')) say(out.reveals === 3, `reveal controls pressed: ${out.reveals} (expected 3)`);
  }
  // The computers env flows: the typed env value is a needle after the drawer closes, a drawer left open fails, every
  // env flow reaches the value field (unmasked, the value shows in its `shot|env-typed` state at both sizes; unmasked only
  // under 100 columns, it shows at 80x24 and nowhere at 120x40), a value field that lost its secret mark fails each
  // flow while the value is still found, and a value field that answers to another name fails the flow without
  // printing the declared value.
  const ENV_FLOWS = ['env-create', 'env-create-leave', 'env-cancel'];
  const ENV_VALUE = (SECRET_FLOWS.computers ?? []).flatMap((f) => f.steps).find((x) => x.startsWith('secret|Variable 1 value|'))?.split('|')[2] ?? '';
  say(ENV_VALUE.length >= 6, `the env flows declare a secret value (${ENV_VALUE.length} chars)`);
  // The gate's own state names are refused as flow shot tags (a flow shot named `typed` would share its name with the
  // canary pass), and no flow uses a refused tag.
  const refuses = typeof shotTagRefusal === 'function';
  say(refuses && ['typed', 'revealed', '', 'a/b', 'a@b'].every((t) => shotTagRefusal(t) !== null) && shotTagRefusal('env-typed') === null,
    `shot tags typed, revealed, empty, a/b, a@b refused; env-typed accepted${refuses ? '' : ' (no shotTagRefusal)'}`);
  const badTags = Object.values(SECRET_FLOWS).flat().flatMap((f) => f.steps).filter((x) => x.startsWith('shot|') && (!refuses || shotTagRefusal(x.split('|')[1]) !== null));
  say(refuses && badTags.length === 0, `no flow shot uses a refused tag${badTags.length ? ` (${badTags.join(', ')})` : ''}`);
  for (const a of ['envEcho', 'envKept', 'envUnmasked', 'envUnmarked', 'envUnmaskedNarrow', 'envRenamed', 'envBlurNarrow']) {
    const cases = a === 'envEcho' || a === 'envKept' || a === 'envRenamed' ? '^many\\+env-create$' : '^many\\+env-';
    const attacks = a === 'envUnmarked' ? ['envUnmasked', 'envUnmarked'] : [a];
    const r = spawnSync(process.execPath, ['--preload', import.meta.path, path.join(import.meta.dir, 'secrets.ts'), '--child', 'computers'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20, env: env(attacks, { SECRETS_CASES: cases }) });
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@SECRETS@@'));
    const out = line ? JSON.parse(line.slice(11)) as Out : null;
    if (!out) { say(false, `${a}: the child drew nothing (exit ${r.status ?? r.signal})`); continue; }
    if (a === 'envEcho') {
      const got = [...new Set(out.leaks.filter((l) => l.key === 'typed').map((l) => `${l.case} ${l.where}`))];
      say(got.includes('many+env-create console'), `${a.padEnd(14)} ${got.join(', ') || '(no leak)'}`);
    } else if (a === 'envBlurNarrow') {
      const err = out.error ?? '';
      say(ENV_FLOWS.every((n) => err.includes(`many+${n}: step "shot|env-typed": the resize to 80x24 lost the focus`)), `${a.padEnd(14)} ${err || '(no error)'}`);
    } else if (a === 'envKept') say(/env-create: step "absent\|dialog\|Get a computer": it is still there/.test(out.error ?? ''), `${a.padEnd(14)} ${out.error ?? '(no error)'}`);
    else if (a === 'envRenamed') {
      const err = out.error ?? '';
      const named = new RegExp(`many\\+env-create: step "secret\\|Variable 1 value\\|«${ENV_VALUE.length} chars»" found no control`).test(err);
      // This line never prints the value either (on a miss the error may hold it).
      say(named && hitOf(ENV_VALUE, (r.stdout ?? '') + (r.stderr ?? '')) === null, `${a.padEnd(14)} ${err.split(ENV_VALUE).join('«the value»') || '(no error)'}`);
    } else {
      const got = new Set(out.leaks.filter((l) => l.key === 'typed' && l.where === 'frame').map((l) => l.case));
      const at = (size: string): boolean => ENV_FLOWS.every((n) => got.has(`many+${n}/env-typed@${size}`));
      const none = (size: string): boolean => ENV_FLOWS.every((n) => !got.has(`many+${n}/env-typed@${size}`));
      const shown = `${[...got].sort().join(', ') || '(no leak)'}${out.error ? ` (${out.error})` : ''}`;
      if (a === 'envUnmasked') say(!out.error && at('120x40') && at('80x24'), `${a.padEnd(14)} ${shown}`);
      // Unmasked, the field is drawn by another component (FieldInput: masked and plain fields differ), so the narrow
      // resize remounts it and the flow also fails on the lost focus; that is the only error allowed here.
      else if (a === 'envUnmaskedNarrow') {
        const lostOnly = (out.error ?? '').split('; ').every((e) => e === '' || /: step "shot\|env-typed": the resize to 80x24 lost the focus$/.test(e));
        say(lostOnly && at('80x24') && none('120x40'), `${a.padEnd(14)} ${shown}`);
      }
      // The lost mark fails every env flow at its secret step (the value is named by its length in the error).
      else say(at('120x40') && at('80x24') && ENV_FLOWS.every((n) => new RegExp(`many\\+${n}: step "secret\\|Variable 1 value\\|[^"]*": the field is not marked secret`).test(out.error ?? '')), `${a.padEnd(14)} ${shown}`);
    }
  }
  // The full gate on the crash: exit 1, and its own report never prints the secret (redaction).
  const r = spawnSync(process.execPath, [path.join(import.meta.dir, 'secrets.ts'), 'demo'], { cwd: HUB, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20, env: env(['crash'], { SECRETS_PRELOAD: import.meta.path }) });
  say(r.status === 1 && /FAIL +demo/.test(r.stdout), `gate exit ${r.status} on the crash (expected 1, FAIL demo)`);
  say(hitOf(ATTACKS.crash!.value, (r.stdout ?? '') + (r.stderr ?? '')) === null, 'the gate report does not print the secret');
  process.stdout.write(`secrets attacks: ${bad ? `${bad} MISSED` : 'all caught'}\n`);
  process.exit(bad ? 1 : 0);
}
