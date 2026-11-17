// @vitest-environment node
// Comment ratchet for Hub source and tests (kit, pages, core, shell, app, standalone, ask, term): a comment states a
// present-tense reason or an invariant (what the code is for, what a test or another file relies on), never where a
// change came from. A comment line that says where a change came from (a date or time, a person, a change id, a case
// id, a decision or plan reference, "was … now" wording, where code was moved from, or a server path) is a hit, and so
// are a test title that carries a case id and any line that names an internal host (the patterns:
// conformance/commentScan.ts). Today's lines are counted per file in
// conformance/comments.allow.json: a file may not gain one and no new file may join; cleaning a file lowers its row.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commentHits, HISTORY_MARKERS, LINE_MARKERS, rot13, scannedForComments, sourceHits, TITLE_MARKERS, type CommentHit } from './conformance/commentScan';
import { judge, lowerOnDisk, readTable, strict } from './conformance/ratchet';

const SRC = join(import.meta.dirname, '..');
const TABLE = join(import.meta.dirname, 'conformance', 'comments.allow.json');
const RULE = 'comments.history';
const HOW =
  'Write what the code is for or the invariant it keeps, in the present tense. Drop the date, the set, lane or sequence id, the reviewer or designer name, the ruling and the plan number ' +
  '(a design rule is said in words, never cited by a document section); say what holds, not what it was before. A test title says what the test checks, with no case id in front or in brackets; ' +
  'a sample address uses an example host. Markers a test or tool reads (noDetails:, reason:, sql-safe:, lint directives) stay.';

/** A file another process removed between the listing and the read reads as empty. */
function read(f: string): string {
  try {
    return readFileSync(join(SRC, f), 'utf8');
  } catch {
    return '';
  }
}

describe('comment ratchet (Hub source and tests)', () => {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/')).filter(scannedForComments);
  const byFile = new Map<string, CommentHit[]>();
  for (const f of files) {
    const h = sourceHits(f, read(f));
    if (h.length) byFile.set(f, h);
  }
  const counts = { [RULE]: Object.fromEntries([...byFile].map(([f, h]) => [f, h.length])) };
  const rows = readTable(TABLE);
  const where = (_rule: string, file: string) => '\n' + (byFile.get(file) ?? []).slice(0, 8).map((h) => `      hub/src/${h.file}:${h.line}  ${h.kind}: ${h.text}`).join('\n');
  const verdict = judge(counts, rows, where);

  it('no file gained a history comment, a case id in a test title or an internal host', () => {
    expect(verdict.grew, `new history in comments or titles (up to 8 of the file's lines are listed; its row counts the lines it had). ${HOW} Rows in hub/src/app/conformance/comments.allow.json never rise`).toEqual([]);
  });

  it('the table holds one rule', () => {
    expect(Object.keys(rows)).toEqual([RULE]);
  });

  it.runIf(strict() || process.env.HUB_RATCHET_LOWER === '1')('no row is stale (integration gate): a cleaned or removed file lowers its row', () => {
    if (lowerOnDisk(TABLE, counts, rows)) return;
    expect(verdict.stale, 'rows above what is left: run this test once with HUB_RATCHET_LOWER=1 (it only lowers)').toEqual([]);
  });
});

/** A test file is named for what it checks. A name segment that is a case id (a letter d, g or k and a number, as in
 *  `x.d15.spec.ts`) is a hit. */
const ID_NAMED = /(?:^|[._-])[dgkDGK]\d{1,2}[a-z]?[._-]/;

describe('test file names', () => {
  it('no test file is named by a case id', () => {
    const named = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split(sep).join('/'))
      .filter((f) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) && ID_NAMED.test(f.slice(f.lastIndexOf('/') + 1)))
      .sort();
    expect(named, 'name the file for what it checks (x.focus-ring.spec.ts), not for a case id').toEqual([]);
  });
});

/** Samples are stored ROT13-encoded, like the patterns, so this file holds none of the words in plain text; d() decodes. */
const d = rot13;

/** One sample per pattern family: [comment text, the kind it is reported as]. */
const HITS: ReadonlyArray<readonly [string, string]> = [
  [d('// yrnq R1 20:44M, arjre guna gur fznyy-puvcyrff ehyr'), 'a time or date'],
  [d('// bcrengbe ehyr 2026-10-23: bar qngn ivrj'), 'a time or date'],
  [d('// gur cvpxre vf gur ebbg (bcrengbe 11-10 S1)'), 'a time or date'],
  [d('// bssyvar vf xabja ng bapr (Green e1 ZRQ 4)'), 'a reviewer or designer name'],
  [d("// craqvat Nfgen'f nccebiny"), 'a reviewer or designer name'],
  [d('// nfxrq ol Y-obgf sbe gur qenjre'), 'a lane, set, sequence or cut id'],
  [d('// gur fgrc ebjf (') + d('qobg-nqq-crbcyr-1)'), 'a lane, set, sequence or cut id'],
  [d('// ynaqrq va frd 1421'), 'a lane, set, sequence or cut id'],
  [d('// yrnq ') + d('ehyvat: xrrc obgu'), 'a ruling, review round or plan reference'],
  [d('// frr QRFVTA-cntr-ynlbhg-e3 sbe gur gnoyr'), 'a ruling, review round or plan reference'],
  [d('// gur Genpx fgrc (XF2)'), 'a plan or ticket number'],
  [d('// fynagrq cyngrf (Q47)'), 'a plan or ticket number'],
  [d('// jnf 28 ck, abj 32'), 'was … now wording'],
  [d('// gur ebj pbhag 26 -> 28'), 'was … now wording'],
  [d('// pbcvrq sebz ') + ['', d('Freire'), d('ubbql-xvg'), d('k.tb')].join('/'), 'a server path'],
  [d('/* gur tnc gbxraf (X16) */'), 'a plan or ticket number'],
  [d(`// gur pbybhe onaq (B11): 4 ck ng gur gbc rqtr`), 'a case or work-item id'],
  [d(`// nqi-U2: gur ernfba jbeqf n fubeg jnyyrg`), 'a case or work-item id'],
  [d(`// Gur erny ncv (yvsgrq sebz cntrf/nv/pberNcv.gf): bar ebhgr cre pnyy`), 'where code came from or a past failure'],
  [d(`// ---- Ercebqhpgvbaf, rnpu erq orsber gur svk ----`), 'where code came from or a past failure'],
  [d(`// ncv.gf: gur bar erdhrfg urycre (cbegrq sebz uho-pber.wf Uho.ncv).`), 'where code came from or a past failure'],
];

/** Test-file lines the title and line passes report: [source line, kind]. */
const TITLE_HITS: ReadonlyArray<readonly [string, string]> = [
  [d(`vg('FG7 n pung nccyvrf sebz vgf arkg ghea', () => {});`), 'a case id leading a test title'],
  [d(`qrfpevor('W1q: bar obhaqnel', () => {});`), 'a case id leading a test title'],
  [d(`qrfpevor('eryrnfrNyy ntnvafg erdhrfgf ba gurve jnl (S7o)', () => {});`), 'a case or work-item id'],
];
const LINE_HITS: ReadonlyArray<readonly [string, string]> = [
  [d(`pbafg N = 'uggcf://n-grezvany-1.mm-mmm-9.pbzchgref.ubbql.pbz/k';`), 'an internal host name'],
  [d(`pbafg O = 'uggcf://n-svyrf-1.dd-ddd-2.pbzchgref.ubbql.pbz/?x=1';`), 'an internal host name'],
];

describe('comment patterns (fixtures)', () => {
  const kinds = (src: string, file = 'kit/x.ts') => commentHits(file, src).map((h) => h.kind);

  it.each(HITS)('%s is %s', (src, kind) => {
    expect(kinds(src, src.startsWith('/*') ? 'kit/x.module.css' : 'kit/x.ts')).toEqual([kind]);
  });

  it.each([
    d('// Bar pbageby ebj (--oga-u): gur sbbgre sbyybjf gur ohggba.'),
    d('// nsgre .cnary fb n gbar jvaf'),
    d('// abQrgnvyf: gur onaare qenjf vgf bja qrgnvyf'),
    d('// ernfba: gur xvg bjaf gur gbhpu sybbe'),
    d('// 12-16 vgrzf svg bar pbyhza; n enatr bs 2-3 yvarf'),
    d('// ernqf --uk-npp-2 naq --fc-1, gura ine(--g-obql-2)'),
    d('// Gur S12 xrl naq Pgey+X bcra vg; cerff S5 gb erybnq'),
    d('// n ebj gung ab ybatre cevprf gur grez vf fxvccrq'),
    d('// rfyvag-qvfnoyr-arkg-yvar ab-pbafbyr -- gur ynar Y-k nfxrq (Green e1), 11-02 20:44M'),
    d('pbafg hey = "uggcf://rknzcyr.grfg/2026-10-23"; // gur nqqerff n grfg ernqf'),
    d('rkcbeg pbafg I = () => <c>frr uggc://k.grfg') + ['', d('Freire'), ''].join('/') + d(' ng 20:44M</c>;'),
  ])('clean: %s', (src) => {
    expect(kinds(src, 'kit/x.tsx')).toEqual([]);
  });

  it('every stored pattern decodes to an expression that finds its own samples', () => {
    for (const [kind, re] of HISTORY_MARKERS) {
      const own = HITS.filter(([, k]) => k === kind);
      expect(own.length, kind).toBeGreaterThan(0);
      for (const [src] of own) expect(re.test(src.trim()), `${kind}: ${src}`).toBe(true);
    }
    expect(rot13(rot13('Ab-Zz 09'))).toBe('Ab-Zz 09');
  });

  it.each([...TITLE_HITS, ...LINE_HITS])('in a test file: %s is %s', (src, kind) => {
    expect(sourceHits('core/x.test.ts', src).map((h) => h.kind)).toEqual([kind]);
  });

  it.each([
    d(`vg('na haxabja bhgpbzr vf arire erfrag (P9)', () => {});`),
    d(`vg('S6 zbirf orgjrra gur cnarf; gur urnqvat (U1) xrrcf sbphf', () => {});`),
    d(`vg('n svefg gvgyr jvgu ab vq', () => {});`),
    d(`pbafg h = 'uggcf://ncv.rknzcyr.grfg/k'; // n fnzcyr nqqerff`),
    d(`rkcrpg(ernyz(E2)).gbOr(1); // gur frpbaq ernyz`),
    d(`vg('S2 ba gur sbphfrq gno eranzrf; S6 yrnirf', () => {});`),
  ])('clean in a test file: %s', (src) => {
    expect(sourceHits('core/x.test.ts', src)).toEqual([]);
  });

  it('a title is read in test files only, a host name on every line of every file, and each line counts once', () => {
    const title = d(`vg('FG7 n pung nccyvrf sebz vgf arkg ghea', () => {});`);
    expect(sourceHits('core/x.ts', title)).toEqual([]);
    expect(sourceHits('core/x.ts', d(`pbafg N = 'uggcf://n-grezvany-1.mm-mmm-9.pbzchgref.ubbql.pbz/k';`)).map((h) => h.kind)).toEqual(['an internal host name']);
    expect(sourceHits('core/x.test.ts', d(`// gur pbybhe onaq (B11): 4 ck ng gur gbc rqtr // uggcf://k.mm-mmm-9.pbzchgref.ubbql.pbz`) + '\n' + title).map((h) => [h.line, h.kind])).toEqual([[1, 'a case or work-item id'], [2, 'a case id leading a test title']]);
    for (const [kind, re] of [...TITLE_MARKERS, ...LINE_MARKERS]) expect([...TITLE_HITS, ...LINE_HITS].some(([src, k]) => k === kind && re.test(src)), kind).toBe(true);
  });

  it('counts each comment line once, reads test files and every Hub folder, and reads allow files and its own test not at all', () => {
    expect(commentHits('kit/x.ts', d('/* n (XF2)\n * o (Green e1) 20:44M\n * p\n */')).map((h) => h.line)).toEqual([1, 2]);
    for (const f of ['pages/a/conformance.allow.ts', 'app/conformance.comments.test.ts', 'app/conformance/commentScan.ts', 'core/x.gen.ts', 'kit/x.strings.en.json', 'scripts/x.ts']) expect(scannedForComments(f), f).toBe(false);
    for (const f of ['kit/x.ts', 'pages/a/b/x.module.css', 'kit/gallery/x.tsx', 'kit/x.test.tsx', 'pages/a/x.spec.ts', 'shell/x.ts', 'core/x.ts', 'app/x.ts', 'standalone/x.ts', 'ask/x.test.ts', 'term/x.ts']) expect(scannedForComments(f), f).toBe(true);
  });
});
