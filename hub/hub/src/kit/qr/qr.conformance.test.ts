// A QR code that carries a secret (a token, a key, an address
// that grants access) wears the key badge and its caption, which only QrSecret draws. Read from the TypeScript syntax tree, never from regexes over the
// text: every <QrCode> states `secret` as a plain true or false, a true one sits inside a <QrSecret> (so the badge and the
// caption render whenever the code does), and every <QrSecret> holds a secret code. A <QrButton> or <QrPanel> states
// secret and keyed only as plain values (a spread may not set them) and is keyed unless its file is a reviewed
// exemption. A new caller that forgets fails.
import { posix } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const raw = import.meta.glob(['../../**/*.tsx', '!../../**/*.test.tsx', '!../../**/*.spec.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
/** Keyed by the path under hub/src (the glob keys are relative to this folder). */
const sources = Object.fromEntries(Object.entries(raw).map(([f, src]) => [posix.normalize(`kit/qr/${f}`), src]));

type Jsx = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

/** Every JSX opening or self-closing element in `file`. */
function elements(file: ts.SourceFile): Jsx[] {
  const out: Jsx[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) out.push(n);
    ts.forEachChild(n, walk);
  };
  walk(file);
  return out;
}

const nameOf = (el: Jsx) => el.tagName.getText();

/** The names a spread attribute may set: each property of an object literal, through parentheses and both arms of a
 *  conditional (`{...(on ? { resetKey } : {})}`); null when it cannot be read (a variable, a call, a nested spread),
 *  which may set anything. */
function spreadKeys(e: ts.Expression): Set<string> | null {
  if (ts.isParenthesizedExpression(e)) return spreadKeys(e.expression);
  if (ts.isConditionalExpression(e)) {
    const a = spreadKeys(e.whenTrue);
    const b = spreadKeys(e.whenFalse);
    return a && b ? new Set([...a, ...b]) : null;
  }
  if (!ts.isObjectLiteralExpression(e)) return null;
  const out = new Set<string>();
  for (const p of e.properties) {
    if (ts.isSpreadAssignment(p) || !p.name || ts.isComputedPropertyName(p.name)) return null;
    out.add(ts.isStringLiteral(p.name) ? p.name.text : p.name.getText());
  }
  return out;
}

/** A boolean prop as the element ends up with it, read in order (a later attribute or spread wins): true (bare or
 *  {true}), false ({false}), 'absent', or 'bad' (any other expression, or a spread that may set it). */
function boolProp(el: Jsx, name: string): boolean | 'absent' | 'bad' {
  let v: boolean | 'absent' | 'bad' = 'absent';
  for (const p of el.attributes.properties) {
    if (ts.isJsxSpreadAttribute(p)) {
      const keys = spreadKeys(p.expression);
      if (!keys || keys.has(name)) v = 'bad';
    } else if (p.name.getText() === name) {
      const k = !p.initializer ? ts.SyntaxKind.TrueKeyword : ts.isJsxExpression(p.initializer) ? p.initializer.expression?.kind : undefined;
      v = k === ts.SyntaxKind.TrueKeyword ? true : k === ts.SyntaxKind.FalseKeyword ? false : 'bad';
    }
  }
  return v;
}

/** A QrCode's `secret`: true, false, or 'bad' (missing, or not a plain true or false). */
function secretOf(el: Jsx): boolean | 'bad' {
  const v = boolProp(el, 'secret');
  return v === 'absent' ? 'bad' : v;
}

/** The nearest enclosing JSX element named `name`, within the same function. */
function enclosedBy(el: Jsx, name: string): boolean {
  for (let n: ts.Node | undefined = (ts.isJsxOpeningElement(el) ? el.parent : el).parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) return false;
    if (ts.isJsxElement(n) && nameOf(n.openingElement) === name) return true;
  }
  return false;
}

/** The secret code elements inside a QrSecret: a QrCode with secret true, the kit's QrImage (a code the API sent as an
 *  image: the 2FA key's otpauth URI, always a secret code), or a component of the same file that
 *  reads the caption id (useQrSecretNote, a code drawn as an image). */
function holdsSecretCode(qs: ts.JsxOpeningElement, file: ts.SourceFile): boolean {
  const readers = new Set<string>();
  ts.forEachChild(file, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && /\buseQrSecretNote\(\)/.test(n.getText())) readers.add(n.name.text);
  });
  return elements(file).some((el) => {
    if (el.pos < qs.parent.pos || el.end > qs.parent.end || el === qs) return false;
    return (nameOf(el) === 'QrCode' && secretOf(el) === true) || nameOf(el) === 'QrImage' || readers.has(nameOf(el));
  });
}

/** True when `n` builds a Bot key link: a keyedLink(...) call, or a string or template part holding '#key=' (comments are
 *  not nodes, so a comment never counts). */
function buildsKeyLink(n: ts.Node): boolean {
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'keyedLink') return true;
  if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && n.text.includes('#key=')) return true;
  return ts.forEachChild(n, buildsKeyLink) ?? false;
}

/** True when `n` reads one of `names` (any identifier spelled so; a shadowing name only makes the rule stricter). */
function readsName(n: ts.Node, names: Set<string>): boolean {
  if (ts.isIdentifier(n) && names.has(n.text)) return true;
  return ts.forEachChild(n, (c) => readsName(c, names)) ?? false;
}

/** The names of the variables in `file` whose value is built from a Bot key link, directly
 *  (`const m = qrMatrix(keyedLink(...))`) or through other such variables (`const link = keyedLink(...); const m =
 *  qrMatrix(link)`), by declaration or by a later assignment. Repeated until no name is added, so a chain of any length
 *  is followed whatever its order in the file. */
function keyLinkNames(file: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const flows: [string, ts.Node][] = [];
  const walk = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) flows.push([n.name.text, n.initializer]);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left)) flows.push([n.left.text, n.right]);
    ts.forEachChild(n, walk);
  };
  walk(file);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, value] of flows)
      if (!out.has(name) && (buildsKeyLink(value) || readsName(value, out))) {
        out.add(name);
        grew = true;
      }
  }
  return out;
}

/** A QrCode's `matrix` draws a key link: built in place, or a variable built from one (and/or-ed with a guard). */
function drawsKeyLink(el: Jsx, names: Set<string>): boolean {
  for (const p of el.attributes.properties) {
    if (ts.isJsxAttribute(p) && p.name.getText() === 'matrix' && p.initializer && ts.isJsxExpression(p.initializer) && p.initializer.expression) {
      const e = p.initializer.expression;
      if (buildsKeyLink(e)) return true;
      let hit = false;
      const walk = (n: ts.Node) => {
        if (ts.isIdentifier(n) && names.has(n.text)) hit = true;
        ts.forEachChild(n, walk);
      };
      walk(e);
      return hit;
    }
  }
  return false;
}

/** Every rule broken in one source file, as messages. */
export function qrKeyProblems(fileName: string, src: string): string[] {
  const file = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const keyNames = keyLinkNames(file);
  for (const el of elements(file)) {
    const name = nameOf(el);
    const at = `${fileName}:${file.getLineAndCharacterOfPosition(el.getStart()).line + 1}`;
    if (name === 'QrCode') {
      const secret = secretOf(el);
      if (secret !== true && drawsKeyLink(el, keyNames)) out.push(`${at}: a QrCode that draws a Bot key link (#key=) is secret, inside a QrSecret`);
      if (secret === 'bad') out.push(`${at}: a QrCode states secret as a plain true or false (no spread, no expression)`);
      else if (secret && !enclosedBy(el, 'QrSecret')) out.push(`${at}: a secret QrCode sits inside a QrSecret`);
      else if (!secret && enclosedBy(el, 'QrSecret')) out.push(`${at}: a QrCode inside a QrSecret is secret`);
    }
    // A QrImage is a code the API made (the 2FA setup answer): it holds the key, so it is always secret and always sits
    // inside a QrSecret (badge on top, caption under it, the image described by the caption). No exemption.
    if (name === 'QrImage' && !enclosedBy(el, 'QrSecret')) out.push(`${at}: a QrImage (a code the API sent, the 2FA key) sits inside a QrSecret`);
    if (name === 'QrSecret' && ts.isJsxOpeningElement(el) && !holdsSecretCode(el, file)) out.push(`${at}: a QrSecret holds a secret code`);
    // QrButton and QrPanel draw the badge when keyed (default: secret, itself true by default). The kit's own QrButton
    // forwards its caller's values to its QrPanel (Qr.test.tsx proves the forwarding), so Qr.tsx is not a caller here;
    // nor is its terminal twin Qr.term.tsx (the same module in a terminal; Qr.term.test.tsx proves its forwarding).
    if ((name === 'QrButton' || name === 'QrPanel') && fileName !== 'kit/qr/Qr.tsx' && fileName !== 'kit/qr/Qr.term.tsx') {
      const secret = boolProp(el, 'secret');
      const keyed = boolProp(el, 'keyed');
      if (secret === 'bad' || keyed === 'bad') out.push(`${at}: a ${name} states secret and keyed as a plain true or false (no expression, no spread that may set them)`);
      else if (!(keyed === 'absent' ? secret !== false : keyed))
        out.push(`${at}: a ${name} that is not keyed shows an address with no key badge: only a reviewed exemption (SHOWN_UNKEYED) may`);
    }
  }
  return out;
}

/** Files whose QrButton or QrPanel is not keyed on purpose (its address grants nothing). */
const SHOWN_UNKEYED = new Set([
  // The kit gallery's public and Bot sample rows.
  'kit/gallery/kit2.tsx',
  // A Bot's public address (its chat page, in the address's How to use it drawer): anyone may open it by design; its key
  // is shown by KeyShare, which wears the badge.
  'pages/bots/parts/LinkDoor.tsx',
  // The terminal hand-off's QR (QrAddressDialog, secret={false}): a Hub page's web address for a phone to take over; it
  // carries no credential (the web Hub signs in on its own), so it has no key to badge. Terminal-only module.
  'kit/qr/termQrDialog.tsx',
]);

describe('secret QR codes', () => {
  const found = Object.entries(sources).filter(([, src]) => /<Qr(Code|Secret|Button|Panel|Image)\b/.test(src));

  it('the scan finds the known callers (a broken glob cannot pass)', () => {
    const names = found.map(([f]) => f);
    expect(names).toEqual(
      expect.arrayContaining(['kit/qr/Qr.tsx', 'pages/keys/parts/ShareShown.tsx', 'pages/bots/parts/KeyShare.tsx', 'pages/account/parts/Secrets.tsx', 'pages/board/broadcast/Broadcast.tsx']),
    );
  });

  it('every QrCode states secret, every secret one sits in a QrSecret, every QrSecret holds one; every QrButton and QrPanel is keyed', () => {
    const problems = found.flatMap(([f, src]) => qrKeyProblems(f, src)).filter((p) => !(p.includes('not keyed') && SHOWN_UNKEYED.has(p.split(':')[0]!)));
    expect(problems).toEqual([]);
  });

  it('the scan finds the code that draws a Bot key link, and it is secret (a broken link reader cannot pass)', () => {
    const drawers = found.filter(([file, src]) => {
      const f = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const names = keyLinkNames(f);
      return elements(f).some((el) => nameOf(el) === 'QrCode' && secretOf(el) === true && drawsKeyLink(el, names));
    });
    expect(drawers.map(([f]) => f)).toEqual(['pages/bots/parts/KeyShare.tsx']);
  });

  it('a file that codes text (qrTextMatrix: text that holds a secret) draws a secret code', () => {
    const coders = Object.entries(sources).filter(([file, src]) => /\bqrTextMatrix\(/.test(src) && file !== 'kit/qr/Qr.tsx');
    expect(coders.length).toBeGreaterThanOrEqual(1);
    for (const [file, src] of coders) {
      const f = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      // A QrImage counts: the rule above keeps every QrImage inside a QrSecret (the gallery codes its sample 2FA text
      // into the image a set-up answer carries).
      expect(elements(f).some((el) => (nameOf(el) === 'QrCode' && secretOf(el) === true) || nameOf(el) === 'QrImage'), `${file} codes text but draws no secret QrCode or QrImage`).toBe(true);
    }
  });

  // The checker itself: each way round the rules.
  it.each([
    ['a label that mentions secret, no secret prop', '<QrSecret><QrCode matrix={m} label="A secret QR code" /></QrSecret>', 'plain true or false'],
    ['secret set back by a spread', '<QrSecret><QrCode matrix={m} label="x" secret {...{ secret: false }} /></QrSecret>', 'plain true or false'],
    ['secret from an expression', '<QrSecret><QrCode matrix={m} label="x" secret={on} /></QrSecret>', 'plain true or false'],
    ['a secret code with no QrSecret', '<div><QrCode matrix={m} label="x" secret /></div>', 'inside a QrSecret'],
    ['a secret code beside, not inside, its QrSecret', '<><QrSecret><span /></QrSecret><QrCode matrix={m} label="x" secret /></>', 'inside a QrSecret'],
    ['a QrSecret around a code that is not secret', '<QrSecret><QrCode matrix={m} label="x" secret={false} /></QrSecret>', 'is secret'],
    ['a QrSecret with no code', '<QrSecret><img src={src} alt="x" /></QrSecret>', 'holds a secret code'],
    ['a QrImage (the 2FA key the API sent) with no QrSecret', '<div><QrImage src={src} alt="x" /></div>', 'sits inside a QrSecret'],
    ['a QrImage beside, not inside, its QrSecret', '<><QrSecret><span /></QrSecret><QrImage src={src} alt="x" /></>', 'sits inside a QrSecret'],
    ['a QrButton shown at once that does not say keyed', '<QrButton url={u} name="x" secret={false} />', 'not keyed'],
    // Keyed={false}, a spread that may set secret or keyed, and a QrPanel used directly.
    ['a QrButton with keyed={false}', '<QrButton url={u} name="x" secret={false} keyed={false} />', 'not keyed'],
    ['a secret QrButton with keyed={false}', '<QrButton url={u} name="x" keyed={false} />', 'not keyed'],
    ['keyed from an expression', '<QrButton url={u} name="x" secret={false} keyed={on} />', 'plain true or false'],
    ['a spread that cannot be read, keyed left out', '<QrButton url={u} name="x" secret={false} {...rest} />', 'plain true or false'],
    ['a spread after keyed that sets it back', '<QrButton url={u} name="x" secret={false} keyed {...(c ? { keyed: false } : {})} />', 'plain true or false'],
    ['a spread that may set secret on a QrCode', '<QrSecret><QrCode matrix={m} label="x" secret {...(c ? { secret: false } : {})} /></QrSecret>', 'plain true or false'],
    ['a QrPanel used directly, not keyed', '<QrPanel url={u} name="x" secret={false} revealed onRevealedChange={f} onClose={f} />', 'not keyed'],
  ])('the checker refuses %s', (_, jsx, problem) => {
    const problems = qrKeyProblems('fixture.tsx', `export function F() { return (${jsx}); }`);
    expect(problems.some((p) => p.includes(problem)), problems.join('\n')).toBe(true);
  });

  // The key link's own code must be the secret one, not any secret code in the same file.
  it.each([
    ['an unbadged key-link code beside an unrelated secret code', 'const k = qrMatrix(keyedLink(u, s)); const o = qrTextMatrix(t);\nexport function F() { return (<><QrCode matrix={k} label="x" secret={false} /><QrSecret><QrCode matrix={o} label="y" secret /></QrSecret></>); }'],
    ['a key link written as a template, drawn unbadged', 'const k = qrMatrix(`${u}/#key=${s}`);\nexport function F() { return (<div><QrCode matrix={k} label="x" secret={false} /></div>); }'],
    ['a key link built in place, drawn unbadged', 'export function F() { return (<div><QrCode matrix={qrMatrix(keyedLink(u, s))!} label="x" secret={false} /></div>); }'],
    ['a key-link matrix behind a guard, drawn unbadged', 'const k = useMemo(() => (on ? qrMatrix(keyedLink(u, s)) : null), [on]);\nexport function F() { return (<div>{k && <QrCode matrix={k} label="x" secret={false} />}</div>); }'],
    // The link held in a variable before it reaches qrMatrix.
    ['a key link held in a variable, then coded, drawn unbadged', 'const link = keyedLink(u, s); const m = useMemo(() => qrMatrix(link), [link]);\nexport function F() { return (<div><QrCode matrix={m} label="x" secret={false} /></div>); }'],
    ['a key link passed through two variables, drawn unbadged', 'const link = `${u}/#key=${s}`; const text = link ?? u; const m = qrMatrix(text);\nexport function F() { return (<div><QrCode matrix={m} label="x" secret={false} /></div>); }'],
    ['a key link assigned later, drawn unbadged', 'let link = u; link = keyedLink(u, s); const m = qrMatrix(link);\nexport function F() { return (<div><QrCode matrix={m} label="x" secret={false} /></div>); }'],
  ])('the checker refuses %s', (_, src) => {
    const problems = qrKeyProblems('fixture.tsx', src);
    expect(problems.some((p) => p.includes('Bot key link')), problems.join('\n')).toBe(true);
  });

  it('a comment that mentions #key= is not a key link; the plain address beside a keyed code passes', () => {
    const src = '// the keyed code: url + "/#key=" + key\nconst k = qrMatrix(keyedLink(u, s)); const p = qrMatrix(u);\nexport function F() { return (<><div><QrCode matrix={p} label="p" secret={false} /></div><QrSecret><QrCode matrix={k} label="k" secret /></QrSecret></>); }';
    expect(qrKeyProblems('fixture.tsx', src)).toEqual([]);
  });

  it('the checker passes the shapes the pages use', () => {
    const ok = [
      '<QrSecret>{shown ? <QrCode matrix={m} label="x" secret /> : <QrCode matrix={s} label="y" secret={true} />}</QrSecret>',
      '<div><QrCode matrix={m} label="x" secret={false} /></div>',
      '<QrButton url={u} name="x" secret={false} keyed />',
      '<QrButton url={u} name="x" />',
      // Address.tsx: a spread that names only other props leaves the default (secret, so keyed) in place.
      '<QrButton url={u} name="x" size="sm" {...(resetKey !== undefined ? { resetKey } : {})} />',
      '<QrButton url={u} name="x" {...rest} secret={false} keyed />',
      '<QrPanel url={u} name="x" revealed={r} onRevealedChange={f} onClose={f} />',
      // Secrets.tsx: the 2FA key's image, the kit's QrImage inside its QrSecret.
      '<QrSecret note="n"><QrImage src={src} alt="x" className={c} /></QrSecret>',
    ];
    for (const jsx of ok) expect(qrKeyProblems('fixture.tsx', `export function F() { return (${jsx}); }`), jsx).toEqual([]);
    const image = 'function KeyImage() { const note = useQrSecretNote(); return <img aria-describedby={note} />; }\nexport function F() { return (<QrSecret note="n"><KeyImage /></QrSecret>); }';
    expect(qrKeyProblems('fixture.tsx', image)).toEqual([]);
  });
});
