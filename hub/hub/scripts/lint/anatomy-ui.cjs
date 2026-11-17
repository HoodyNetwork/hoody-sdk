// The Hub UI-standard rules, the `ui.*` family of the page-anatomy detector.
// anatomy.cjs requires this module and calls scanUi(ctx) at the end of its scan, before it counts, so ui hits share the layout
// rules' keys (rule, file, scope), its `main`/`overlay:<id>` scopes, its rows (pages/<page>/conformance.allow.ts, allow.shared.ts)
// and the layout gate. The rules here read CONSUMER files only: every non-test source and CSS file under pages/, shell/,
// ask/ and app/, minus app/DevToolbar*. kit/** (the gallery included) is never a consumer, and anatomy.cjs's own file lists
// (scannedSource, scannedCss, consumerRoots, cssPassed) are never read: these rules build their own.
//
// A rule is { id, css?, explain, run(ctx, U) }. `ctx` is what anatomy.cjs's scan hands over (its parser, element facts,
// binding resolution and hit sinks); `U` is this module's shared helpers. A rule says what it proves: like anatomy.cjs, what it
// cannot trace is not reported.
'use strict';

const path = require('node:path');

/** A consumer file for the ui rules: pages, shell, ask and app, minus the dev toolbar and anatomy.cjs's test files. */
const isUiConsumer = (rel, isTestFile) => /^(pages|shell|ask|app)\//.test(rel) && !/^app\/DevToolbar/.test(rel) && !isTestFile(rel);

const stemOf = (rel) => rel.replace(/(\.module)?\.(css|tsx|ts|jsx|js|mjs|cjs)$/, '');

// anatomy.cjs's partitions: spacing in `style` is layout.inlineSpacing; in pages/ CSS, heading type tokens are layout.cssType and
// --pad-card/--gap-*/--sg-* overrides are layout.cssReach. The regexes are anatomy.cjs's own (its CSS pass and inlineStyle).
const SPACING_PROP = /^(?:margin|padding|gap|rowGap|columnGap)/;
const K0_CSS_TYPE = /var\(\s*--(?:t-(?:section|heading|title|display)|fs-(?:lg|xl|2xl|3xl))\s*[,)]/;
const K0_CSS_REACH_PROP = /^--(?:pad-card|gap-|sg-)/;

/**
 * The look family of a CSS property, or null for layout, spacing, text flow and pointer steering. `cursor`
 * is a look only as `pointer`, and the visually-hidden clip is not one: lookOf judges the value for both.
 */
function lookOf(prop, value) {
  if (/^(color|background|fill|stroke|accent-color|caret-color|color-scheme|forced-color-adjust|scrollbar-color|-webkit-text-fill-color|-webkit-text-stroke|column-rule-color)/.test(prop)) return 'colour';
  if (/^border-(collapse|spacing)$/.test(prop)) return null; // table layout
  if (/^border.*radius$/.test(prop)) return 'radius';
  if (/^border/.test(prop)) return 'border';
  if (/^outline/.test(prop)) return 'outline';
  if (/shadow$/.test(prop)) return 'shadow';
  if (/^(font|font-family|font-size|font-weight|font-style|font-stretch|font-variant|font-variant-caps|font-synthesis|line-height|letter-spacing|word-spacing|text-transform|text-decoration(-[a-z-]+)?|text-underline-[a-z-]+|text-rendering|-webkit-font-smoothing|-moz-osx-font-smoothing)$/.test(prop)) return 'type';
  if (/^(transition|animation)/.test(prop)) return 'motion';
  if (prop === 'clip-path' || prop === '-webkit-clip-path') return /^inset\(\s*50%\s*\)$/i.test(value) ? null : 'effect';
  if (prop === 'clip') return /^rect\(\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*\)$/i.test(value) ? null : 'effect';
  if (/^(opacity|filter|backdrop-filter|-webkit-backdrop-filter|mix-blend-mode|mask|mask-[a-z-]+|-webkit-mask|-webkit-mask-[a-z-]+)$/.test(prop)) return 'effect';
  if (prop === 'cursor') return /\bpointer\b/i.test(value) ? 'interaction' : null;
  if (prop === 'content') return 'content';
  return null;
}

/** A reset: every word of the value neutralises (none, transparent, currentColor, the global keywords; zero for a border). Outline never resets. */
const RESET_WORDS = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'revert-layer']);
function isReset(family, value) {
  if (family === 'outline') return false;
  const words = value.replace(/!important/i, '').trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => RESET_WORDS.has(w) || ((family === 'border' || family === 'radius') && /^0(?:\.0+)?(?:[a-z%]+)?$/.test(w)));
}

/**
 * A value that reads a colour, type or kit-private token (colour = --hx-* and --focus-ring*; type = --t-*, --fs-*,
 * --fw-*, --lh-*, --font-*, --tracking-*, --case-*; component = --btn-*, --ctl-*, --touch-*, the row heights, --pad-card*,
 * --card-*, --pop-*, --dock-*, --pane-*, --inspector-*). Spacing (--sp-*, --gap-*) and --z-* stay a consumer's.
 */
const LOOK_TOKEN = /var\(\s*(--(?:hx-|focus-ring|t-|fs-|fw-|lh-|font-|tracking-|case-|btn-|ctl-|touch-|pad-card|card-|pop-|dock-|pane-|inspector-)[\w-]*|--(?:row-h|table-row-h|group-row-h)(?![\w-]))/;
/** A raw colour written as a value (stylelint bans them in properties; a custom property's value is where one hides). */
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i;

/** The `{ start, end }` offsets of every @keyframes body in comment-stripped CSS: its frames are not look sites. */
function keyframeRanges(text) {
  const out = [];
  const re = /@(?:-webkit-)?keyframes\b[^{]*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < text.length && depth; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    out.push({ start: m.index, end: i });
    re.lastIndex = i;
  }
  return out;
}

/** The kebab-case CSS name of a JS style key (`backgroundColor` -> `background-color`, `WebkitMask` -> `-webkit-mask`). */
const kebab = (k) => (k.startsWith('--') ? k : k.replace(/^(Webkit|Moz|ms)(?=[A-Z])/, (v) => `-${v.toLowerCase()}`).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

const CONTROL_TAGS = new Set(['button', 'input', 'select', 'table', 'details', 'summary', 'form', 'dialog']);
const WIDGET_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'radiogroup', 'switch', 'slider', 'spinbutton', 'tab', 'tablist', 'tabpanel', 'listbox', 'option', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'combobox', 'dialog', 'alertdialog', 'toolbar', 'grid', 'gridcell', 'tree', 'treeitem']);
/** anatomy.cjs's INTERACTIVE tags: a handler on one of them is the element's own; `a` counts only with an href. */
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'iframe', 'object', 'embed', 'foreignObject']);
const HANDLERS = ['onClick', 'onKeyDown', 'onPointerDown'];

// ── vocabulary of the text and address rules ──
/** A URL-like name (ui.rawUrl): the exact words, or a camel-case suffix. */
const URL_NAME = /^(?:url|href|address|link|endpoint|origin)$|[a-z0-9](?:Url|Href|Address|Link|Endpoint)$/;
const HTTP_LIT = /https?:\/\//;
/** The parts that show an address properly: a URL-like name inside them is not plain text. */
const RAW_URL_HOSTS = new Set(['ExtLink', 'Link', 'LinkButton', 'AddressField', 'CodeBlock']);
const COMPUTER_EXEMPT = new Set(['ContainerTable', 'ComputerPicker', 'FilterChips']);
const COMPUTER_ROWS = new Set(['li', 'tr', 'MenuItem', 'ListBoxItem']);
const COMP_TYPE = /Computer|Container/;
const COMP_ARRAY = /(?:computers|containers|machines|servers)$/i;
const TWICE_BUTTONS = new Set(['Button', 'LinkButton', 'TextButton', 'IconButton']);
/** A folder label (ui.folderField; never the bare word "path"). */
const FOLDER_WORDS = /\b(?:folders?|director(?:y|ies)|cwd)\b(?!\s+(?:name|size)\b)/i; // a folder's name or size is not a place
const T_HOOK = /^(?:useStrings|makeT)$/;
const T_NAME = /^t[a-z]?$/;
const PLURALS = ['', '_zero', '_one', '_two', '_few', '_many', '_other'];
/** anatomy.cjs's import aliases (ALIASES), for a table imported through one. */
const JSON_ALIASES = [[/^@kit\//, 'kit/'], [/^@core\//, 'core/'], [/^@app\//, 'app/'], [/^@shell\//, 'shell/']];

/** The UI helpers over ctx (added to U by scanUi). Each answers only what syntax proves; anything else is "unknown". */
function std8Helpers(ctx) {
  const { ts, files, P, unparen, localDecl, initializerOf, propKey } = ctx;
  const nameOf = (f) => (f.binding ? f.binding.def : f.intrinsic[0] || null);
  const inside = (file, n, names) => {
    for (const a of ctx.ancestorEls(file, n)) if (names.has(nameOf(a))) return true;
    return false;
  };
  const hasJsx = (n) => {
    let found = false;
    const v = (x) => {
      if (found) return;
      if (ctx.isJsxEl(x) || ts.isJsxFragment(x)) found = true;
      else ts.forEachChild(x, v);
    };
    v(n);
    return found;
  };
  const objProp = (o, key) => {
    let out = null;
    for (const p of o.properties) {
      if (ts.isSpreadAssignment(p) || propKey(p.name) !== key) continue;
      out = ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : null;
    }
    return out;
  };
  const objHas = (o, key) => o.properties.some((p) => !ts.isSpreadAssignment(p) && propKey(p.name) === key);
  const propValue = (p) => (ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : null);

  /** The members of a type node, following a type reference to an interface or alias declared in the same file (Readonly/Partial unwrapped). */
  const membersOf = (tn, depth = 0) => {
    if (!tn || depth > 3) return null;
    if (ts.isTypeLiteralNode(tn)) return tn.members;
    if (ts.isTypeReferenceNode(tn)) {
      const nm = tn.typeName.getText();
      if (/^(?:Readonly|Partial|Required)$/.test(nm) && tn.typeArguments) return membersOf(tn.typeArguments[0], depth + 1);
      for (const st of tn.getSourceFile().statements) {
        if (ts.isInterfaceDeclaration(st) && st.name.text === nm) return st.members;
        if (ts.isTypeAliasDeclaration(st) && st.name.text === nm) return membersOf(st.type, depth + 1);
      }
    }
    if (ts.isIntersectionTypeNode(tn)) return tn.types.flatMap((x) => [...(membersOf(x, depth + 1) || [])]);
    return null;
  };
  /** The written type of a name: its own annotation, or its member of a destructured parameter's type. null when none is written. */
  const typeText = (id) => {
    const d = localDecl(id);
    if (!d || !(ts.isVariableDeclaration(d) || ts.isParameter(d))) return null;
    if (ts.isIdentifier(d.name)) return d.type ? d.type.getText() : null;
    if (!ts.isObjectBindingPattern(d.name) || !d.type) return null;
    const el = d.name.elements.find((e) => ts.isIdentifier(e.name) && e.name.text === id.text);
    const key = el && (el.propertyName ? propKey(el.propertyName) : id.text);
    const m = key !== undefined && (membersOf(d.type) || []).find((x) => x.name && propKey(x.name) === key);
    return m && m.type ? m.type.getText() : null;
  };
  const urlName = (e) => {
    const n = e && (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null);
    return n && URL_NAME.test(n) ? n : null;
  };
  /** An object literal that is a Facts item: in an array or function typed Fact, as Fact, or under a Facts element's items. */
  const inFactContext = (o) => {
    for (let p = o.parent, hops = 0; p && hops < 8; p = p.parent, hops++) {
      if (ts.isArrayLiteralExpression(p) || ts.isSpreadElement(p) || ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || (ts.isBinaryExpression(p) && /^(?:&&|\|\||\?\?)$/.test(p.operatorToken.getText()))) continue;
      if ((ts.isAsExpression(p) || ts.isSatisfiesExpression(p)) && /\bFacts?\b/.test(p.type.getText())) return true;
      if (ts.isVariableDeclaration(p)) return !!p.type && /\bFacts?\b/.test(p.type.getText());
      if (ts.isReturnStatement(p)) {
        let f = p.parent;
        while (f && !ts.isFunctionLike(f)) f = f.parent;
        return !!f && !!f.type && /\bFacts?\b/.test(f.type.getText());
      }
      if (ts.isArrowFunction(p)) return !!p.type && /\bFacts?\b/.test(p.type.getText());
      if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) {
        const a = p.parent;
        const el = ts.isJsxOpeningElement(a.parent.parent) ? a.parent.parent.parent : a.parent.parent;
        return ctx.attrName(a) === 'items' && nameOf(ctx.facts(el.getSourceFile().fileName, el)) === 'Facts';
      }
      return false;
    }
    return false;
  };
  /** An ExtLink whose children drop the scheme: a .replace() of a scheme pattern, a strip-scheme helper, or JSX text equal to the href minus its scheme. */
  const stripsScheme = (el) => {
    const kids = ctx.childrenOf(el);
    let found = false;
    const v = (x) => {
      if (found) return;
      if (ts.isCallExpression(x)) {
        const c = x.expression;
        const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
        if (nm === 'replace' && x.arguments[0] && /https?|:\/\//.test(x.arguments[0].getText())) found = true;
        if (/strip(?:Scheme|Protocol)|without(?:Scheme|Protocol)|noScheme|bareHost/i.test(nm)) found = true;
      }
      ts.forEachChild(x, v);
    };
    for (const k of kids) v(k);
    const href = ctx.attrLiteral(ctx.openingOf(el).attributes.properties.find((a) => ts.isJsxAttribute(a) && ctx.attrName(a) === 'href'));
    if (!found && typeof href === 'string' && HTTP_LIT.test(href)) {
      const text = kids.filter(ts.isJsxText).map((k) => k.text.trim()).join('');
      if (text && text === href.replace(/^https?:\/\//, '')) found = true;
    }
    return found;
  };
  const fnOf = (e) => {
    e = unparen(e);
    if (!e) return null;
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
    if (ts.isIdentifier(e)) {
      const d = localDecl(e);
      if (d && ts.isFunctionDeclaration(d)) return d;
      const init = d && ts.isVariableDeclaration(d) && d.initializer && unparen(d.initializer);
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return init;
    }
    return null;
  };
  /** The array a .map() reads, through filter/slice/sort-style calls. */
  const arrayRoot = (e) => {
    e = unparen(e);
    while (e && ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && /^(?:filter|slice|sort|toSorted|concat|reverse|toReversed)$/.test(e.expression.name.text)) e = unparen(e.expression.expression);
    return e;
  };
  const findEl = (file, root, pred, skip) => {
    let found = null;
    const v = (x) => {
      if (found || (skip && skip(x))) return;
      if (ctx.isJsxEl(x) && pred(ctx.facts(file, x))) found = x;
      else ts.forEachChild(x, v);
    };
    if (root) v(root);
    return found;
  };
  /** The values a function returns (not entering nested functions), conditional and logical branches spread into leaves. */
  const returnsOf = (fn) => {
    const out = [];
    const leaf = (e) => {
      e = unparen(e);
      if (!e) return;
      if (ts.isConditionalExpression(e)) {
        leaf(e.whenTrue);
        leaf(e.whenFalse);
      } else if (ts.isBinaryExpression(e) && /^(?:&&|\|\||\?\?)$/.test(e.operatorToken.getText())) {
        leaf(e.right);
        if (e.operatorToken.getText() !== '&&') leaf(e.left);
      } else out.push(e);
    };
    if (!fn.body) return out;
    if (!ts.isBlock(fn.body)) leaf(fn.body);
    else {
      const v = (n) => {
        if (ts.isFunctionLike(n)) return;
        if (ts.isReturnStatement(n) && n.expression) leaf(n.expression);
        ts.forEachChild(n, v);
      };
      ts.forEachChild(fn.body, v);
    }
    return out;
  };
  /** Whether a node sits in attribute `attr` of the nearest element whose attribute holds it, and that element passes `pred`. */
  const inAttrOf = (file, n, attr, pred) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isJsxAttribute(p)) {
        if (ctx.attrName(p) !== attr) return false;
        const el = ts.isJsxOpeningElement(p.parent.parent) ? p.parent.parent.parent : p.parent.parent;
        return pred(ctx.facts(file, el));
      }
      if (ctx.isJsxEl(p)) return false;
    }
    return false;
  };
  /** Columns that are computers: an id or accessor key `computer`/`container`, or a column helper typed with a Computer/Container row. */
  const computerColumns = (e, depth = 0) => {
    e = unparen(e);
    if (!e || depth > 3) return false;
    if (ts.isIdentifier(e)) {
      const d = localDecl(e);
      const init = d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) ? d.initializer : initializerOf(e);
      return !!init && computerColumns(init, depth + 1);
    }
    let found = false;
    const helperTyped = (id) => {
      const d = localDecl(id);
      const init = d && ts.isVariableDeclaration(d) && d.initializer && unparen(d.initializer);
      return !!init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'createColumnHelper' && !!init.typeArguments && COMP_TYPE.test(init.typeArguments[0].getText());
    };
    const v = (x) => {
      if (found) return;
      if (ts.isPropertyAssignment(x) && propKey(x.name) === 'id' && ts.isStringLiteralLike(unparen(x.initializer)) && /^(?:computer|container)$/.test(unparen(x.initializer).text)) found = true;
      else if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'accessor') {
        const a0 = x.arguments[0] && unparen(x.arguments[0]);
        const root = unparen(x.expression.expression);
        if ((a0 && ts.isStringLiteralLike(a0) && /^(?:computer|container)$/.test(a0.text)) || (root && ts.isIdentifier(root) && helperTyped(root))) found = true;
      }
      if (!found) ts.forEachChild(x, v);
    };
    v(e);
    return found;
  };

  // ── t('key') English values: the table of the translator, like anatomy.cjs's explain pass (useStrings/makeT, a local hook returning one) ──
  const tables = new Map();
  const readTable = (rel) => {
    if (tables.has(rel)) return tables.get(rel);
    let t = null;
    // from `files`, else the caller's reader (the layout gate hands the detector code files only and reads tables through readSrc);
    // the reader serves only what readTree puts in `files` (a strings.en.json outside node_modules and dot folders), so a gate run
    // and a whole-tree run see the same tables
    let text = Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : null;
    if (text === null && ctx.readSrc && /strings\.en\.json$/.test(rel) && !rel.split('/').some((seg) => seg.startsWith('.') || seg === 'node_modules')) {
      try {
        text = ctx.readSrc(rel);
      } catch {
        text = null;
      }
    }
    if (typeof text === 'string') {
      try {
        const obj = JSON.parse(text);
        t = Object.create(null);
        if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') t[k] = v;
      } catch {
        t = null;
      }
    }
    tables.set(rel, t);
    return t;
  };
  const jsonPath = (from, spec) => {
    if (!spec.endsWith('.json')) return null;
    if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    for (const [re, to] of JSON_ALIASES) if (re.test(spec)) return spec.replace(re, to);
    return null;
  };
  const tableOf = (file, e, depth = 0) => {
    e = unparen(e);
    if (!e || depth > 3) return null;
    if (ts.isIdentifier(e)) {
      const d = localDecl(e);
      if (d) return ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer ? tableOf(file, d.initializer, depth + 1) : null;
      const imp = P.infoOf(file).imports.get(e.text);
      const p = imp && jsonPath(file, imp.spec);
      return p ? readTable(p) : null;
    }
    if (ts.isObjectLiteralExpression(e)) {
      const out = Object.create(null);
      for (const pr of e.properties) {
        if (ts.isSpreadAssignment(pr)) {
          const t = tableOf(file, pr.expression, depth + 1);
          if (!t) return null;
          Object.assign(out, t);
        } else if (ts.isPropertyAssignment(pr) && propKey(pr.name) !== undefined && ts.isStringLiteralLike(unparen(pr.initializer))) out[propKey(pr.name)] = unparen(pr.initializer).text;
        else return null;
      }
      return out;
    }
    return null;
  };
  const isHook = (file, id) => {
    if (T_HOOK.test(id.text)) return true;
    const imp = P.infoOf(file).imports.get(id.text);
    return !!imp && T_HOOK.test(imp.name);
  };
  /** The nearest strings.en.json from a file's folder up to its area root (pages/<page>, shell, ask, app). */
  const nearestTable = (file) => {
    const root = /^(pages\/[^/]+|shell|ask|app)\//.exec(file);
    if (!root) return null;
    for (let dir = path.posix.dirname(file); dir.length >= root[1].length; dir = path.posix.dirname(dir)) {
      const t = readTable(`${dir}/strings.en.json`);
      if (t) return t;
      if (dir === root[1]) break;
    }
    return null;
  };
  /** The table a `t` parameter's written type names: `ReturnType<typeof useStrings<typeof strings>>`, directly or through a local alias. */
  const typedTable = (file, id) => {
    let tt = typeText(id);
    if (tt && /^[A-Za-z_$][\w$]*$/.test(tt)) {
      const al = P.sourceOf(file).statements.find((st) => ts.isTypeAliasDeclaration(st) && st.name.text === tt);
      tt = al ? al.type.getText() : null;
    }
    const m = tt && /(?:useStrings|makeT)\s*<\s*typeof\s+([A-Za-z_$][\w$]*)\s*>/.exec(tt);
    if (!m) return null;
    const imp = P.infoOf(file).imports.get(m[1]);
    const p = imp && jsonPath(file, imp.spec);
    return p ? readTable(p) : null;
  };
  /** The table a translator callee reads: a local useStrings/makeT, a local hook whose body makes one, else (a `t` prop or parameter whose render sites are not followed) the nearest table. */
  const translatorTable = (file, cal, depth = 0) => {
    cal = unparen(cal);
    if (!cal || depth > 4) return null;
    if (ts.isPropertyAccessExpression(cal)) return T_NAME.test(cal.name.text) ? nearestTable(file) : null;
    if (!ts.isIdentifier(cal)) return null;
    const d = localDecl(cal);
    if (d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer) {
      const init = unparen(d.initializer);
      if (ts.isIdentifier(init)) return translatorTable(file, init, depth + 1);
      if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) return null;
      if (isHook(file, init.expression)) return init.arguments[0] ? tableOf(file, init.arguments[0]) : null;
      const b = P.traceLocal(file, init.expression.text);
      if (!b || !b.file || b.kit) return null;
      let fn = null;
      for (const st of P.sourceOf(b.file).statements) {
        if (ts.isFunctionDeclaration(st) && st.name && st.name.text === b.def) fn = st;
        if (ts.isVariableStatement(st)) for (const vd of st.declarationList.declarations) if (ts.isIdentifier(vd.name) && vd.name.text === b.def && vd.initializer && (ts.isArrowFunction(unparen(vd.initializer)) || ts.isFunctionExpression(unparen(vd.initializer)))) fn = unparen(vd.initializer);
      }
      const calls = [];
      const v = (x) => {
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && isHook(b.file, x.expression) && x.arguments[0]) calls.push(x);
        ts.forEachChild(x, v);
      };
      if (fn && fn.body) v(fn.body);
      return calls.length === 1 ? tableOf(b.file, calls[0].arguments[0]) : null;
    }
    if ((!d || ts.isParameter(d)) && T_NAME.test(cal.text)) return typedTable(file, cal) || nearestTable(file);
    return null;
  };
  const forms = (table, key) => PLURALS.filter((s) => key + s in table).map((s) => table[key + s]);
  /** A t-call's literal key, or null. */
  const tKey = (e) => {
    e = unparen(e);
    if (!e || !ts.isCallExpression(e) || !e.arguments[0] || !ts.isStringLiteralLike(unparen(e.arguments[0]))) return null;
    const c = unparen(e.expression);
    const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
    return T_NAME.test(nm) ? unparen(e.arguments[0]).text : null;
  };
  /** The English forms of t('key') (every plural form), or null when the translator, its table or the key cannot be traced. */
  const enText = (file, e) => {
    e = unparen(e);
    const key = tKey(e);
    if (key === null) return null;
    const table = translatorTable(file, e.expression);
    const out = table ? forms(table, key) : [];
    return out.length ? out : null;
  };

  // ── handlers ──
  const norm = (n) => n.getText().replace(/\s+/g, '').replace(/\?\./g, '.');
  const callOfBody = (fn) => {
    let b = fn.body;
    if (b && ts.isBlock(b)) {
      if (b.statements.length !== 1) return null;
      const s = b.statements[0];
      b = ts.isExpressionStatement(s) ? s.expression : ts.isReturnStatement(s) ? s.expression : null;
    }
    b = unparen(b);
    if (b && ts.isVoidExpression(b)) b = unparen(b.expression);
    return b && ts.isCallExpression(b) ? b : null;
  };
  /** One key per handler: a named reference, or the one call an inline function makes (its callee and arguments). */
  const handlerKey = (e) => {
    e = unparen(e);
    if (!e) return null;
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return `ref:${norm(e)}`;
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      const c = callOfBody(e);
      return c ? (c.arguments.length ? `call:${norm(c)}` : `ref:${norm(c.expression)}`) : null;
    }
    return null;
  };
  const bodyCallee = (e) => {
    e = unparen(e);
    const c = e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) ? callOfBody(e) : null;
    return c ? norm(c.expression) : null;
  };
  /** The callee a handler prop names: `open`, `open ?? false`, `(r) => open(r)`. */
  const calleeOf = (e) => {
    e = unparen(e);
    if (!e) return null;
    if (ts.isBinaryExpression(e) && /^(?:\?\?|\|\||&&)$/.test(e.operatorToken.getText())) return calleeOf(e.operatorToken.getText() === '&&' ? e.right : e.left);
    if (ts.isConditionalExpression(e)) return calleeOf(e.whenTrue);
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return norm(e);
    return bodyCallee(e);
  };
  /** Two sites that never show together: the two branches of one conditional or if, or two return statements of one function. */
  const exclusive = (a, b) => {
    const chain = (n) => {
      const out = [];
      for (let c = n, p = n.parent; p; c = p, p = p.parent) out.push({ p, c });
      return out;
    };
    const ca = chain(a);
    const cb = new Map(chain(b).map((x) => [x.p, x.c]));
    for (const { p, c } of ca) {
      if (!cb.has(p)) continue;
      const d = cb.get(p);
      if (c === d) continue;
      if (ts.isConditionalExpression(p) && c !== p.condition && d !== p.condition) return true;
      if (ts.isIfStatement(p) && c !== p.expression && d !== p.expression) return true;
      break; // the nearest common ancestor decides
    }
    const ret = (n) => {
      for (let p = n.parent; p; p = p.parent) {
        if (ts.isReturnStatement(p)) {
          let f = p.parent;
          while (f && !ts.isFunctionLike(f)) f = f.parent;
          return { r: p, f };
        }
      }
      return null;
    };
    const ra = ret(a);
    const rb = ret(b);
    return !!ra && !!rb && ra.f === rb.f && ra.r !== rb.r;
  };

  // ── numbers ──
  /** A function's written return type is number (declared in the file or traced through its import). */
  const returnsNumber = (file, cal) => {
    if (!ts.isIdentifier(cal)) return false;
    const typed = (fn) => !!fn && !!fn.type && /^number$/.test(fn.type.getText().trim());
    const d = localDecl(cal);
    if (d) return ts.isFunctionDeclaration(d) ? typed(d) : ts.isVariableDeclaration(d) && !!d.initializer && typed(unparen(d.initializer));
    const b = P.traceLocal(file, cal.text);
    if (!b || !b.file) return false;
    for (const st of P.sourceOf(b.file).statements) {
      if (ts.isFunctionDeclaration(st) && st.name && st.name.text === b.def) return typed(st);
      if (ts.isVariableStatement(st)) for (const vd of st.declarationList.declarations) if (ts.isIdentifier(vd.name) && vd.name.text === b.def && vd.initializer) return typed(unparen(vd.initializer));
    }
    return false;
  };
  /** An expression compared with a number in a condition that guards it (`n > 0 ? n : undefined`, `n > 0 && { badge: n }`). */
  const guardedNumber = (e) => {
    const me = norm(e);
    const compares = (c) => {
      let yes = false;
      const v = (x) => {
        if (yes) return;
        if (ts.isBinaryExpression(x) && /^(?:>|>=|<|<=|===|!==)$/.test(x.operatorToken.getText()) && ((ts.isNumericLiteral(unparen(x.right)) && norm(x.left) === me) || (ts.isNumericLiteral(unparen(x.left)) && norm(x.right) === me))) yes = true;
        else ts.forEachChild(x, v);
      };
      v(c);
      return yes;
    };
    for (let c = e, p = e.parent, hops = 0; p && hops < 10; c = p, p = p.parent, hops++) {
      if (ts.isFunctionLike(p) || ts.isStatement(p)) break;
      if (ts.isConditionalExpression(p) && c !== p.condition && compares(p.condition)) return true;
      if (ts.isBinaryExpression(p) && p.operatorToken.getText() === '&&' && c === p.right && compares(p.left)) return true;
    }
    return false;
  };
  const nullish = (e) => {
    e = unparen(e);
    return !!e && ((ts.isIdentifier(e) && e.text === 'undefined') || e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.FalseKeyword);
  };
  /** A number, or a string like "12" / "99+". What cannot be shown to be one is not. */
  const numberLike = (file, e, depth = 0) => {
    e = unparen(e);
    if (!e || depth > 5) return false;
    if (ts.isNumericLiteral(e)) return true;
    if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(unparen(e.operand))) return true;
    if (ts.isStringLiteralLike(e)) return /^\d+\+?$/.test(e.text);
    if (ts.isConditionalExpression(e)) {
      const a = numberLike(file, e.whenTrue, depth + 1);
      const b = numberLike(file, e.whenFalse, depth + 1);
      return (a && (b || nullish(e.whenFalse))) || (b && nullish(e.whenTrue));
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.getText();
      if (/^(?:-|\*|\/|%|\*\*)$/.test(op)) return true;
      if (op === '+') return numberLike(file, e.left, depth + 1) && numberLike(file, e.right, depth + 1);
      if (op === '&&') return numberLike(file, e.right, depth + 1);
      return false;
    }
    if (ts.isPropertyAccessExpression(e) && /^(?:length|size)$/.test(e.name.text)) return true;
    if (ts.isCallExpression(e)) {
      const c = unparen(e.expression);
      if (ts.isIdentifier(c) && /^(?:Number|parseInt|parseFloat|countText)$/.test(c.text)) return true;
      if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'Math') return true;
      if (returnsNumber(file, c)) return true;
    }
    if (ts.isIdentifier(e)) {
      const t = typeText(e);
      if (t) return /\bnumber\b/.test(t) && !/\bstring\b/.test(t);
      const d = localDecl(e);
      if (d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer && numberLike(file, d.initializer, depth + 1)) return true;
    }
    if (ts.isElementAccessExpression(e) && ts.isIdentifier(unparen(e.expression))) {
      const t = typeText(unparen(e.expression));
      if (t && /\bnumber\b/.test(t) && !/\bstring\b/.test(t)) return true;
    }
    return guardedNumber(e);
  };

  // ── Tabs items ──
  /** The item objects an items expression yields: array elements, spreads, conditionals, consts, .map() results and local item builders. */
  const itemObjects = (e, depth = 0, out = []) => {
    e = unparen(e);
    if (!e || depth > 5) return out;
    if (ts.isArrayLiteralExpression(e)) for (const x of e.elements) (ts.isSpreadElement(x) ? itemObjects(x.expression, depth + 1, out) : itemObj(x, depth + 1, out));
    else if (ts.isConditionalExpression(e)) {
      itemObjects(e.whenTrue, depth + 1, out);
      itemObjects(e.whenFalse, depth + 1, out);
    } else if (ts.isBinaryExpression(e) && /^(?:&&|\|\||\?\?)$/.test(e.operatorToken.getText())) {
      itemObjects(e.right, depth + 1, out);
      if (e.operatorToken.getText() !== '&&') itemObjects(e.left, depth + 1, out);
    } else if (ts.isIdentifier(e)) {
      const init = initializerOf(e);
      if (init) itemObjects(init, depth + 1, out);
    } else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const m = e.expression.name.text;
      if (m === 'map' && e.arguments[0]) {
        const fn = fnOf(e.arguments[0]);
        if (fn) for (const r of returnsOf(fn)) itemObj(r, depth + 1, out);
      } else if (/^(?:filter|slice|concat|sort|toSorted)$/.test(m)) itemObjects(e.expression.expression, depth + 1, out);
    }
    return out;
  };
  const itemObj = (e, depth, out) => {
    e = unparen(e);
    if (!e || depth > 6) return;
    if (ts.isObjectLiteralExpression(e)) out.push(e);
    else if (ts.isConditionalExpression(e)) {
      itemObj(e.whenTrue, depth + 1, out);
      itemObj(e.whenFalse, depth + 1, out);
    } else if (ts.isIdentifier(e)) {
      const init = initializerOf(e);
      if (init) itemObj(init, depth + 1, out);
    } else if (ts.isCallExpression(e)) {
      const fn = fnOf(e.expression);
      if (fn) for (const r of returnsOf(fn)) itemObj(r, depth + 1, out);
    }
  };
  /** The properties named `key` of an object, its spreads of object literals included (`...(c ? { badge } : {})`). */
  const deepProps = (o, key, out = []) => {
    const spread = (e) => {
      e = unparen(e);
      if (!e) return;
      if (ts.isObjectLiteralExpression(e)) deepProps(e, key, out);
      else if (ts.isConditionalExpression(e)) {
        spread(e.whenTrue);
        spread(e.whenFalse);
      } else if (ts.isBinaryExpression(e) && /^(?:&&|\|\||\?\?)$/.test(e.operatorToken.getText())) spread(e.right);
    };
    for (const p of o.properties) {
      if (ts.isSpreadAssignment(p)) spread(p.expression);
      else if (propKey(p.name) === key) out.push(p);
    }
    return out;
  };
  /** A node held (through arrays and objects) under a property named `key`. */
  const underKey = (n, key) => {
    for (let p = n.parent, hops = 0; p && hops < 6; p = p.parent, hops++) {
      if (ts.isPropertyAssignment(p)) {
        if (propKey(p.name) === key) return true;
        continue;
      }
      if (!(ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p))) return false;
    }
    return false;
  };

  /**
   * An action object held as a menu or row item: its value reaches a JSX attribute or property named like an item list
   * (actions, rowMenu, tileMenu, rowEntries, items, ...). The value goes up through arrays, objects and spreads, parens/as/
   * satisfies/!, a conditional's branches, either operand of || and ?? (the right one of &&), a call's argument or callee to the
   * call's result, `filter`/`slice`/`concat`/`toSorted`/`toReversed`/`flat` of a list, `map`/`flatMap` of a list when the
   * callback, inline or a local const/function, hands back its item with the fields the asking rule reads unchanged (`x`,
   * `{ ...x, disabled }`, `c ? x : null`, for flatMap `[x]` or `c ? [x] : []`; `x => x.label`, a write `x.short = ...`, or
   * `{ ...x, short }` for inlineLabel ends it), `list.push(obj)`/`unshift` to that list, an arrow body or return to its function, and a read of the
   * property it sits under (`rowActions().choices`). A const or local function on the way counts when a reference to it goes on
   * the same way, at most three hops (`const choices = [{ ... }]; items={choices}`, `actions={actions}`); an exported one also
   * counts when it is so named and the value sits under no unread property (cross-file readers are not followed: that name is the policy there). Anything else ends it:
   * another member read (`quickActions.label`, `quick.items`), a holder reached while a property the value sits under is
   * still unread (`items={groups}` with the list at `groups[0].choices`), a statement (`console.log(choices)`), a condition. A toast's
   * `action` or an unrelated { label, onAction } is not one (the value counts, not a name it passes).
   */
  const ITEM_HOLDER = /(?:actions|menu|items|entries)$/i;
  const exported = (d) => {
    const st = ts.isVariableDeclaration(d) ? d.parent && d.parent.parent : d;
    return !!(st && st.modifiers && st.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
  };
  const refsOf = (d) => {
    const out = [];
    const v = (k) => {
      if (ts.isIdentifier(k) && k !== d.name && k.text === d.name.text && localDecl(k) === d) out.push(k);
      else ts.forEachChild(k, v);
    };
    v(d.getSourceFile());
    return out;
  };
  const LIST_KEEPS = new Set(['filter', 'slice', 'concat', 'toSorted', 'toReversed', 'flat', 'map', 'flatMap']);
  // What a map/flatMap callback's returned expression hands back of its item `name`: 'item', 'none' (null/undefined/false, or
  // flatMap's `[]`: nothing that is an item) or false. `reads` are the fields the asking rule reads: a spread of the item keeps
  // it only when nothing after the spread may rewrite one of them (`{ ...x, short: 'Run' }` keeps it for actionTwice, which
  // reads label/onAction/href, not for inlineLabel, which reads short); a later spread or computed key may rewrite any.
  const ITEM_READS = ['label', 'short', 'inline', 'onAction', 'href'];
  const nothing = (e) => e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(e) && e.text === 'undefined') || ts.isVoidExpression(e);
  const keptOf = (e, name, flat, reads) => {
    e = unparen(e);
    if (!e) return 'none';
    if (ts.isIdentifier(e) && e.text === name) return 'item';
    if (nothing(e)) return 'none';
    if (ts.isObjectLiteralExpression(e)) {
      const at = e.properties.findIndex((q) => ts.isSpreadAssignment(q) && ts.isIdentifier(unparen(q.expression)) && unparen(q.expression).text === name);
      if (at < 0) return false;
      return e.properties.slice(at + 1).every((q) => !ts.isSpreadAssignment(q) && !(q.name && ts.isComputedPropertyName(q.name)) && !reads.includes(propKey(q.name) || '')) && 'item';
    }
    if (flat && ts.isArrayLiteralExpression(e)) {
      if (!e.elements.length) return 'none';
      return e.elements.every((x) => keptOf(x, name, false, reads) === 'item') && 'item';
    }
    if (ts.isConditionalExpression(e)) {
      const a = keptOf(e.whenTrue, name, flat, reads), b = keptOf(e.whenFalse, name, flat, reads);
      if (!a || !b) return false;
      return a === 'item' || b === 'item' ? 'item' : 'none';
    }
    return false;
  };
  // A write in the callback that may change a read field of the item or replace it: `x.short = 'Run'`, `x[k] = v`,
  // `delete x.label`, `Object.assign(x, ...)`, `x = { ...x, short }` (nested functions included: they may run before the item
  // is used). A write on some paths only still ends the walk: which items it reaches is not known, so the lint stays quiet.
  const writesItem = (body, name, reads) => {
    const its = (e) => {
      e = unparen(e);
      if (ts.isIdentifier(e)) return e.text === name;
      if (ts.isPropertyAccessExpression(e)) return ts.isIdentifier(unparen(e.expression)) && unparen(e.expression).text === name && reads.includes(e.name.text);
      if (ts.isElementAccessExpression(e)) return ts.isIdentifier(unparen(e.expression)) && unparen(e.expression).text === name;
      return false;
    };
    let w = false;
    const v = (k) => {
      if (w) return;
      if (ts.isBinaryExpression(k) && k.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && k.operatorToken.kind <= ts.SyntaxKind.LastAssignment && its(k.left)) w = true;
      else if (ts.isDeleteExpression(k) && its(k.expression)) w = true;
      else if (ts.isCallExpression(k) && ts.isPropertyAccessExpression(k.expression) && k.expression.name.text === 'assign' && ts.isIdentifier(k.expression.expression) && k.expression.expression.text === 'Object'
        && k.arguments[0] && ts.isIdentifier(unparen(k.arguments[0])) && unparen(k.arguments[0]).text === name) w = true;
      else ts.forEachChild(k, v);
    };
    v(body);
    return w;
  };
  // A map/flatMap callback that hands back its item: an arrow or function expression whose first parameter is a plain name,
  // that writes no read field of it, and at least one return of which keeps it while the others hand back nothing
  // (`x => x.visible ? x : null`, `if (hide) return null; return x;`); given inline or as a local const or function declaration
  // (`choices.map(enrich)`).
  const keepsItem = (cb, flat, reads, named = true) => {
    cb = unparen(cb);
    if (cb && named && ts.isIdentifier(cb)) {
      const d = localDecl(cb);
      if (d && ts.isFunctionDeclaration(d) && d.body) return keepsItem(d, flat, reads, false);
      const init = constInit(d);
      return !!init && keepsItem(init, flat, reads, false);
    }
    if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb) || (ts.isFunctionDeclaration(cb) && cb.body))) return false;
    const p0 = cb.parameters[0];
    if (!p0 || !ts.isIdentifier(p0.name) || p0.dotDotDotToken) return false;
    const name = p0.name.text;
    if (writesItem(cb.body, name, reads)) return false;
    if (!ts.isBlock(cb.body)) return keptOf(cb.body, name, flat, reads) === 'item';
    const rets = [];
    const v = (k) => {
      if (ts.isFunctionLike(k)) return;
      if (ts.isReturnStatement(k)) rets.push(k.expression);
      ts.forEachChild(k, v);
    };
    ts.forEachChild(cb.body, v);
    const ks = rets.map((r) => keptOf(r, name, flat, reads));
    return ks.every(Boolean) && ks.includes('item');
  };
  // keys: the property names the value sits under on the way up (innermost last); a read of the same name takes it out.
  const held = (n, hops, keys, reads) => {
    let c = n;
    for (let p = n.parent; p && !ts.isSourceFile(p); c = p, p = p.parent) {
      if (ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p)
        || ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isNonNullExpression(p) || ts.isJsxExpression(p)) continue;
      if (ts.isConditionalExpression(p)) { if (c === p.condition) return false; continue; }
      if (ts.isBinaryExpression(p)) {
        const op = p.operatorToken.kind;
        if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || (op === ts.SyntaxKind.AmpersandAmpersandToken && c === p.right)) continue;
        return false;
      }
      if (ts.isPropertyAssignment(p)) {
        if (c !== p.initializer) return false;
        const k = propKey(p.name) || '';
        if (ITEM_HOLDER.test(k) && !keys.length) return true;
        keys = [...keys, k];
        continue;
      }
      if (ts.isJsxAttribute(p)) return !keys.length && ITEM_HOLDER.test(ctx.attrName(p) || '');
      // a list method that hands back (some of) its items: `choices.filter(f)`, `rows.slice(1)`, `choices.map((x) => ({ ...x }))`
      if (ts.isPropertyAccessExpression(p) && c === p.expression && LIST_KEEPS.has(p.name.text) && p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) {
        const m = p.name.text;
        if ((m === 'map' || m === 'flatMap') && !keepsItem(p.parent.arguments[0], m === 'flatMap', reads)) return false;
        c = p; p = p.parent;
        continue;
      }
      // a read of the property the value sits under: `rowActions().choices`
      if (ts.isPropertyAccessExpression(p) && c === p.expression && keys.length && keys[keys.length - 1] === p.name.text) {
        keys = keys.slice(0, -1);
        continue;
      }
      if (ts.isCallExpression(p)) {
        if (c === p.expression) continue; // a function's result is its value (`getItems()`)
        // pushed onto a local list: the value goes where the list goes
        const e = p.expression;
        if (ts.isPropertyAccessExpression(e) && /^(?:push|unshift)$/.test(e.name.text) && ts.isIdentifier(e.expression)) {
          const d = localDecl(e.expression);
          return !!(d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name)) && viaDecl(d, hops, keys, reads);
        }
        continue;
      }
      if (ts.isArrowFunction(p)) { if (c !== p.body) return false; continue; }
      if (ts.isReturnStatement(p)) {
        let f = p.parent;
        while (f && !ts.isFunctionLike(f)) f = f.parent;
        if (!f) return false;
        if (ts.isFunctionDeclaration(f)) return f.name ? viaDecl(f, hops, keys, reads) : false;
        if (!(ts.isArrowFunction(f) || ts.isFunctionExpression(f))) return false;
        p = f; // the function is the value now
        continue;
      }
      if (ts.isVariableDeclaration(p)) return c === p.initializer && ts.isIdentifier(p.name) ? viaDecl(p, hops, keys, reads) : false;
      return false;
    }
    return false;
  };
  // A const or local function the value reaches: a reference that goes on to an item holder (the list itself, the function handed
  // on as `actions={actions}`, or its call's result). The hop count bounds the search, cycles included.
  // An exported one so named also counts when the value sits under no unread property: its readers in other files are not
  // followed (the cross-file policy).
  const viaDecl = (d, hops, keys, reads) => (hops > 0 && refsOf(d).some((k) => held(k, hops - 1, keys, reads))) || (!keys.length && exported(d) && ITEM_HOLDER.test(d.name.text));
  // reads: the item fields the asking rule reads (default: every one any item rule reads).
  const heldAsItem = (n, reads = ITEM_READS) => held(n, 3, [], reads);
  /**
   * The value an object surely ends up with for `key`, or null when it may be absent, falsy or unknown. Later writes win, in
   * property order: an own property, or a spread of an object literal or of a local const bound to one. A spread that may
   * write the key without our knowing (conditional, a logical, a call, a parameter) makes it unknown; `a || b` and `a ?? b`
   * may spread either operand, `a && b` only b (a falsy a spreads nothing). A value is sure unless it is undefined/null, a
   * conditional, or `a && b`; `a || b` and `a ?? b` are as sure as b. An identifier is followed to its local const
   * initializer; a local function or class, or an import, is sure; a parameter, a let/var or an unbound name is not.
   * Consts are followed along the active path only, so a cycle ends as unknown and a repeated spread stays exact.
   */
  const importsName = (file, name) => file.statements.some((st) => {
    const c = ts.isImportDeclaration(st) && st.importClause;
    if (!c || c.isTypeOnly) return false;
    if (c.name && c.name.text === name) return true;
    const b = c.namedBindings;
    if (!b) return false;
    if (ts.isNamespaceImport(b)) return b.name.text === name;
    return b.elements.some((e) => !e.isTypeOnly && e.name.text === name);
  });
  const constInit = (d) => (d && ts.isVariableDeclaration(d) && d.initializer && ts.isIdentifier(d.name) && ts.isVariableDeclarationList(d.parent) && d.parent.flags & ts.NodeFlags.Const ? d.initializer : null);
  const sureValue = (v, path = new Set()) => {
    v = unparen(v);
    if (!v || /^(?:undefined|null)$/.test(v.getText()) || ts.isConditionalExpression(v)) return false;
    if (ts.isBinaryExpression(v)) {
      const k = v.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken) return false;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return sureValue(v.right, path);
    }
    if (ts.isIdentifier(v)) {
      const d = localDecl(v);
      if (!d) return importsName(v.getSourceFile(), v.text);
      if (ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d)) return true;
      const init = constInit(d);
      if (!init || path.has(d)) return false;
      path.add(d);
      const sure = sureValue(init, path);
      path.delete(d);
      return sure;
    }
    return true;
  };
  const ABSENT = 'absent';
  const UNKNOWN = 'unknown';
  /** The last write of `key` in o: ABSENT, UNKNOWN, or the value expression. */
  const lastWrite = (o, key, path) => {
    let w = ABSENT;
    for (const p of o.properties) {
      if (ts.isSpreadAssignment(p)) {
        const r = spreadWrite(p.expression, key, path);
        if (r !== ABSENT) w = r;
      } else if (p.name && propKey(p.name) === key) w = propValue(p) || (ts.isMethodDeclaration(p) ? p : UNKNOWN);
    }
    return w;
  };
  const spreadWrite = (e, key, path) => {
    e = unparen(e);
    if (!e) return UNKNOWN;
    if (ts.isObjectLiteralExpression(e)) return lastWrite(e, key, path);
    if (ts.isIdentifier(e)) {
      const d = localDecl(e);
      const init = constInit(d);
      if (!init || path.has(d)) return UNKNOWN;
      path.add(d);
      const w = spreadWrite(init, key, path);
      path.delete(d);
      return w;
    }
    const either = (a, b) => (spreadWrite(a, key, path) === ABSENT && spreadWrite(b, key, path) === ABSENT ? ABSENT : UNKNOWN);
    if (ts.isConditionalExpression(e)) return either(e.whenTrue, e.whenFalse);
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken) return spreadWrite(e.right, key, path) === ABSENT ? ABSENT : UNKNOWN;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return either(e.left, e.right);
    }
    return UNKNOWN;
  };
  /** True when object o surely carries a usable `key` (see lastWrite and sureValue). */
  const surelyHas = (o, key) => {
    const w = lastWrite(o, key, new Set());
    return w !== ABSENT && w !== UNKNOWN && sureValue(w);
  };
  /** A column helper: an identifier declared as createColumnHelper<T>(). */
  const columnHelper = (e) => {
    e = unparen(e);
    const d = e && ts.isIdentifier(e) ? localDecl(e) : null;
    const init = d && ts.isVariableDeclaration(d) && d.initializer ? unparen(d.initializer) : null;
    return !!init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'createColumnHelper';
  };

  return { heldAsItem, surelyHas, columnHelper, nameOf, inside, hasJsx, objProp, objHas, propValue, typeText, urlName, inFactContext, stripsScheme, fnOf, arrayRoot, findEl, returnsOf, inAttrOf, computerColumns, nearestTable, forms, tKey, enText, handlerKey, bodyCallee, calleeOf, exclusive, numberLike, itemObjects, deepProps, underKey };
}

/** The rules, in report order. Each one counts its own sites. */
const RULE_DEFS = [
  {
    id: 'ui.kitClass',
    explain: 'a className or non-spacing style handed to a kit part: directly, through a local carrier, or by cloneElement',
    run(ctx, U) {
      const { ts, unparen, attrName, attrExpr, propsBindings, localDecl, initializerOf, propKey } = ctx;
      const msgOf = (tag, prop) => `<${tag} ${prop}> restyles a kit part. Use its props (tone, size, width, variant, layout) or extend the kit part.`;

      /** An own-parameter reference of `comp` to its prop `prop` (identity: the name resolves to the component's own first parameter). */
      const ownRef = (comp, prop, e) => {
        if (!comp) return false;
        const prm = comp.fn.parameters && comp.fn.parameters[0];
        if (!prm) return false;
        const pb = propsBindings(comp.fn);
        const own = (id) => localDecl(id) === prm;
        e = unparen(e);
        if (!e) return false;
        if (ts.isIdentifier(e)) return pb.names.get(e.text) === prop && own(e);
        const root = (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && unparen(e.expression);
        if (root && ts.isIdentifier(root) && pb.whole.has(root.text) && own(root)) {
          const key = ts.isPropertyAccessExpression(e) ? e.name.text : e.argumentExpression && ts.isStringLiteralLike(unparen(e.argumentExpression)) ? unparen(e.argumentExpression).text : undefined;
          return key === prop;
        }
        return false;
      };
      const mentionsOwn = (comp, prop, e) => {
        let found = false;
        const v = (n) => {
          if (found) return;
          if (ownRef(comp, prop, n)) found = true;
          else ts.forEachChild(n, v);
        };
        if (e) v(e);
        return found;
      };
      /** A whole-props or rest spread of `comp`'s own parameter that still carries `prop`. */
      const ownSpread = (comp, prop, e) => {
        if (!comp) return false;
        const prm = comp.fn.parameters && comp.fn.parameters[0];
        const pb = propsBindings(comp.fn);
        e = unparen(e);
        return !!prm && ts.isIdentifier(e) && localDecl(e) === prm && (pb.whole.has(e.text) || (pb.rest.has(e.text) && !pb.excl.has(prop) && !pb.dynExcl));
      };
      /**
       * What an element passes as `prop`, attributes and spreads in source order (the last one wins): { expr, node } a written value
       * (an attribute, or a key of an inline or local-const object spread), { forward } a spread of the enclosing component's own
       * props, or null. An untraced spread leaves the earlier answer standing (the type boundary closes it).
       */
      const passed = (f, comp, prop) => {
        let cur = null;
        for (const a of f.op.attributes.properties) {
          if (ts.isJsxAttribute(a)) {
            if (attrName(a) === prop) cur = { expr: attrExpr(a), node: a, attr: a };
            continue;
          }
          const e = unparen(a.expression);
          if (ownSpread(comp, prop, e)) {
            cur = { forward: true };
            continue;
          }
          const obj = ts.isObjectLiteralExpression(e) ? e : ts.isIdentifier(e) ? unparen(initializerOf(e)) : null;
          if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
          for (const p of obj.properties) {
            if (ts.isSpreadAssignment(p)) continue;
            if (propKey(p.name) !== prop) continue;
            cur = { expr: ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : undefined, node: a };
          }
        }
        return cur;
      };
      /** A style value with a property that is not spacing (spacing is layout.inlineSpacing). An untraced value is not reported. */
      const nonSpacingStyle = (e) => {
        let o = unparen(e);
        if (o && ts.isIdentifier(o)) o = unparen(initializerOf(o));
        if (!o || !ts.isObjectLiteralExpression(o)) return false;
        for (const p of o.properties) {
          if (ts.isSpreadAssignment(p)) {
            const s = ts.isIdentifier(unparen(p.expression)) ? unparen(initializerOf(unparen(p.expression))) : unparen(p.expression);
            if (s && ts.isObjectLiteralExpression(s) && s.properties.some((q) => !ts.isSpreadAssignment(q) && propKey(q.name) !== undefined && !SPACING_PROP.test(propKey(q.name)))) return true;
            continue;
          }
          const k = propKey(p.name);
          if (k !== undefined && !SPACING_PROP.test(k)) return true;
        }
        return false;
      };

      // carriers: a local component that forwards its own className/style to a kit part, or to another carrier. Run to a true
      // fixpoint, so a chain of any length is found whatever order its wrappers are declared in: sets only grow, and there are at
      // most two props per component, so the loop ends.
      const carriers = new Map(); // `file#Name` -> Set of the props it forwards
      const forwardTarget = (f) => (U.isKitPart(f) ? new Set(['className', 'style']) : f.defKey && !f.binding.kit ? carriers.get(f.defKey) : null);
      for (;;) {
        let changed = false;
        for (const file of U.sources) {
          U.walkJsx(file, (n) => {
            const f = ctx.facts(file, n);
            const props = forwardTarget(f);
            if (!props) return;
            const comp = ctx.enclosingComponent(file, n);
            if (!comp) return;
            for (const prop of props) {
              const p = passed(f, comp, prop);
              if (!p || !(p.forward || mentionsOwn(comp, prop, p.expr))) continue;
              const have = carriers.get(comp.key) || new Set();
              if (!have.has(prop)) {
                have.add(prop);
                carriers.set(comp.key, have);
                changed = true;
              }
            }
          });
        }
        if (!changed) break;
      }

      for (const file of U.sources) {
        U.walkJsx(file, (n) => {
          const f = ctx.facts(file, n);
          const props = forwardTarget(f);
          if (!props) return;
          const comp = ctx.enclosingComponent(file, n);
          for (const prop of props) {
            const p = passed(f, comp, prop);
            if (!p || p.forward) continue;
            // a pure forward of the enclosing carrier's own prop is its forwarding line, not a site: its callers are
            if (ownRef(comp, prop, p.expr)) continue;
            if (prop === 'style' && !nonSpacingStyle(p.expr)) continue;
            const tag = f.binding.def;
            ctx.hit(file, p.node, 'ui.kitClass', U.isKitPart(f) ? msgOf(tag, prop) : `<${tag} ${prop}>: ${tag} forwards ${prop} to a kit part, so this restyles it. Use the kit part's props or extend the kit part.`);
          }
        });
        // cloneElement(x, { className | style }): one site per prop it writes
        const v = (n) => {
          if (ts.isCallExpression(n)) {
            const c = n.expression;
            const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
            let o = name === 'cloneElement' && n.arguments[1] ? unparen(n.arguments[1]) : null;
            if (o && ts.isIdentifier(o)) o = unparen(initializerOf(o));
            if (o && ts.isObjectLiteralExpression(o)) {
              for (const p of o.properties) {
                const k = ts.isSpreadAssignment(p) ? undefined : propKey(p.name);
                if (k === 'className' || (k === 'style' && ts.isPropertyAssignment(p) && nonSpacingStyle(p.initializer))) ctx.hit(file, p, 'ui.kitClass', `cloneElement(…, { ${k} }) restyles a part from outside. Use the kit part's props or extend the kit part.`);
              }
            }
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
      }
    },
  },
  {
    id: 'ui.pageLook',
    css: true,
    explain: 'a look declaration, kit-property override, look-token read or theme attribute in consumer code (look owners excluded)',
    run(ctx, U) {
      const { ts, unparen, attrName, attrExpr, initializerOf, propKey } = ctx;
      const fix = 'the kit owns it. Use the kit part (Surface/TileGrid/StatusPill/Tag/…), a kit prop, or put the graphic in <Visual>.';
      const kitProps = U.kitCustomProps();

      // ── CSS ──
      for (const file of U.css) {
        if (U.isLookOwner(file)) continue;
        const inPages = file.startsWith('pages/');
        const { rules, text } = ctx.cssRules(ctx.files[file]);
        const frames = keyframeRanges(text);
        const visualOnly = U.visualOnly(file);
        // custom properties this file reads inside a look declaration: a raw value one of them holds is a raw look value
        const lookRead = new Set();
        for (const r of rules) for (const d of r.decls) if (!d.prop.startsWith('--') && lookOf(d.prop, d.value)) for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) lookRead.add(m[1]);
        for (const r of rules) {
          if (frames.some((k) => r.at >= k.start && r.at < k.end)) continue;
          if (visualOnly(r.sel)) continue;
          for (const d of r.decls) {
            const value = d.value.replace(/!important/i, '').replace(/\s+/g, ' ').trim();
            if (inPages && K0_CSS_TYPE.test(d.value)) continue; // layout.cssType
            if (d.prop.startsWith('--')) {
              if (inPages && K0_CSS_REACH_PROP.test(d.prop)) continue; // layout.cssReach
              let why = null;
              if (kitProps.has(d.prop)) why = `overrides the kit property ${d.prop}`;
              else if (LOOK_TOKEN.test(value)) why = `${d.prop} holds a look token (${value})`;
              else if (RAW_COLOUR.test(value)) why = `${d.prop} holds a raw colour (${value})`;
              else if (lookRead.has(d.prop) && !/var\(/.test(value) && !isReset('', value)) why = `${d.prop} holds a raw look value (${value}) read by a look declaration`;
              if (why) ctx.cssHit(file, 'ui.pageLook', d.at, `page CSS ${why}; ${fix}`);
              continue;
            }
            const fam = lookOf(d.prop, value);
            if (fam && !isReset(fam, value)) ctx.cssHit(file, 'ui.pageLook', d.at, `page CSS draws a look (${d.prop}: ${value}); ${fix}`);
            else if (LOOK_TOKEN.test(value)) ctx.cssHit(file, 'ui.pageLook', d.at, `page CSS reads a kit look token (${d.prop}: ${value}); ${fix}`);
          }
        }
      }

      // ── TSX: look properties in an intrinsic element's inline style; theme attributes on any element ──
      const theme = U.themeAttrs();
      const stylePairs = (e) => {
        let o = unparen(e);
        if (o && ts.isIdentifier(o)) o = unparen(initializerOf(o));
        if (!o || !ts.isObjectLiteralExpression(o)) return [];
        const out = [];
        for (const p of o.properties) {
          if (ts.isSpreadAssignment(p)) {
            const s = ts.isIdentifier(unparen(p.expression)) ? unparen(initializerOf(unparen(p.expression))) : unparen(p.expression);
            if (s && ts.isObjectLiteralExpression(s)) for (const q of s.properties) if (!ts.isSpreadAssignment(q)) out.push({ key: propKey(q.name), value: ts.isPropertyAssignment(q) ? q.initializer : undefined, node: p });
            continue;
          }
          out.push({ key: propKey(p.name), value: ts.isPropertyAssignment(p) ? p.initializer : undefined, node: p });
        }
        return out;
      };
      for (const file of U.sources) {
        if (U.isLookOwner(file)) continue;
        U.walkJsx(file, (n) => {
          const f = ctx.facts(file, n);
          for (const [name, a] of f.attrs) if (name && theme.has(name)) ctx.hit(file, a, 'ui.pageLook', `${name} sets a theme attribute; only the theme (kit/tokens.css) owns ${name}`);
          for (const sp of f.spreads) {
            const e = unparen(sp.expression);
            const obj = e && ts.isObjectLiteralExpression(e) ? e : e && ts.isIdentifier(e) ? unparen(initializerOf(e)) : null;
            if (obj && ts.isObjectLiteralExpression(obj)) for (const p of obj.properties) if (!ts.isSpreadAssignment(p) && theme.has(propKey(p.name))) ctx.hit(file, sp, 'ui.pageLook', `${propKey(p.name)} sets a theme attribute; only the theme (kit/tokens.css) owns it`);
          }
          if (!f.intrinsic.length) return;
          const st = f.attrs.get('style');
          if (!st || attrName(st) !== 'style') return;
          for (const { key, value, node } of stylePairs(attrExpr(st))) {
            if (key === undefined) continue;
            const prop = kebab(key);
            const lit = value && ts.isStringLiteralLike(unparen(value)) ? unparen(value).text : null;
            if (prop.startsWith('--')) {
              if (kitProps.has(prop)) ctx.hit(file, node, 'ui.pageLook', `inline style overrides the kit property ${prop}; ${fix}`);
              continue;
            }
            const fam = lookOf(prop, lit || '');
            if (fam && !(lit !== null && isReset(fam, lit))) ctx.hit(file, node, 'ui.pageLook', `inline style draws a look (${key}); ${fix}`);
          }
        });
      }
    },
  },
  {
    id: 'ui.rawControl',
    explain: 'a hand-built control or widget: an intrinsic button, a[href], input, select, table, details, summary, form or dialog, a widget role, tabIndex, or a click/key handler on a non-control',
    run(ctx, U) {
      const { ts, unparen, attrExpr, attrLiteral, stringsOf } = ctx;
      for (const file of U.sources) {
        U.walkJsx(file, (n) => {
          const f = ctx.facts(file, n);
          if (!f.intrinsic.length) return;
          for (const a of ctx.ancestorEls(file, n)) if (U.isVisual(a)) return; // layout.visual judges Visual's children
          const tags = f.intrinsic;
          const why = [];
          for (const t of tags) if (CONTROL_TAGS.has(t) || (t === 'a' && f.attrs.has('href'))) why.push(`<${t}>`);
          const role = f.attrs.get('role');
          if (role) {
            const lit = attrLiteral(role);
            const roles = typeof lit === 'string' ? lit.split(/\s+/) : stringsOf(attrExpr(role) || role);
            const w = roles.find((r) => WIDGET_ROLES.has(r));
            if (w) why.push(`role="${w}"`);
          }
          const ti = f.attrs.get('tabIndex');
          if (ti) {
            const lit = attrLiteral(ti);
            const e = unparen(attrExpr(ti));
            const neg = (typeof lit === 'string' && Number(lit) < 0) || (e && ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand) && Number(e.operand.text) > 0);
            if (!neg) why.push('tabIndex');
          }
          const interactive = (t) => INTERACTIVE.has(t) && (t !== 'a' || f.attrs.has('href'));
          const h = HANDLERS.find((x) => f.attrs.has(x));
          if (h && tags.some((t) => !interactive(t))) why.push(`${h} on <${tags.find((t) => !interactive(t))}>`);
          if (why.length) ctx.hit(file, n, 'ui.rawControl', `a hand-built control (${why[0]}): use Button/Link/TextField/Select/DataTable/Disclosure/Form/Dialog/FileButton; they own focus, keys and touch.`);
        });
      }
    },
  },
  // ── eight text and address rules over consumer sources. Props and elements a kit may not have yet (Tabs badgeUnit,
  // RowAction short, DataTable listLabel/meta.tip, ExtLink/AddressText) are matched by prop or element name. ──
  {
    id: 'ui.rawUrl',
    explain: 'an address shown as plain text: a URL-like name or an http(s) literal as JSX text, a Facts value holding one, AddressText, or an ExtLink with its scheme stripped',
    run(ctx, U) {
      const { ts, unparen, initializerOf, localDecl, propKey } = ctx;
      const fix = 'shows an address as plain text. Use ExtLink (or a Facts `url:`), which shows it safely and masks secrets.';
      const isChild = (n) => n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent));
      const inHost = (file, n) => U.inside(file, n, RAW_URL_HOSTS);
      /** A name bound to JSX in scope (`const link = <a …/>`, a ReactNode prop) is content, not an address (shell/Sidebar.tsx:66). */
      const boundToJsx = (id) => {
        const init = initializerOf(id) || (localDecl(id) && ts.isVariableDeclaration(localDecl(id)) && ts.isIdentifier(localDecl(id).name) ? localDecl(id).initializer : undefined);
        if (init && U.hasJsx(init)) return true;
        return /ReactNode|ReactElement|JSX\.Element/.test(U.typeText(id) || '');
      };
      for (const file of U.sources) {
        const v = (n) => {
          // (a) a URL-like name as a JSX child
          if (ts.isJsxExpression(n) && isChild(n) && n.expression) {
            const e = unparen(n.expression);
            const name = U.urlName(e);
            if (name && !(ts.isIdentifier(e) && boundToJsx(e)) && !inHost(file, n)) ctx.hit(file, n, 'ui.rawUrl', `{${e.getText()}} ${fix}`);
            else if (e && ts.isStringLiteralLike(e) && HTTP_LIT.test(e.text) && !inHost(file, n)) ctx.hit(file, n, 'ui.rawUrl', `an http(s) literal as text ${fix}`);
          }
          // (b) an http(s) literal as JSX text
          if (ts.isJsxText(n) && HTTP_LIT.test(n.text) && !inHost(file, n)) ctx.hit(file, n, 'ui.rawUrl', `an http(s) literal as text ${fix}`);
          // (c) a Facts item whose `value:` is a URL-like name
          if (ts.isObjectLiteralExpression(n) && U.inFactContext(n)) {
            const keys = new Map();
            for (const p of n.properties) if (!ts.isSpreadAssignment(p) && propKey(p.name) !== undefined) keys.set(propKey(p.name), p);
            const val = keys.get('value');
            const ve = val && (ts.isPropertyAssignment(val) ? val.initializer : ts.isShorthandPropertyAssignment(val) ? val.name : null);
            if (ve && keys.has('label') && !keys.has('url') && U.urlName(unparen(ve))) ctx.hit(file, val, 'ui.rawUrl', `a Facts value ${unparen(ve).getText()} ${fix}`);
          }
          // (d) AddressText, or an ExtLink whose children drop the scheme
          if (ctx.isJsxEl(n)) {
            const f = ctx.facts(file, n);
            const name = U.nameOf(f);
            if (name === 'AddressText') ctx.hit(file, n, 'ui.rawUrl', `<AddressText> ${fix}`);
            else if (name === 'ExtLink' && U.stripsScheme(n)) ctx.hit(file, n, 'ui.rawUrl', '<ExtLink> with scheme-stripped children: ExtLink shows the address itself; pass only href.');
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
      }
    },
  },
  {
    id: 'ui.computerList',
    explain: 'a hand-made list of computers: a .map() rendering ComputerMark or mapping computers into rows/menu/picker items, or a DataTable/useDataView of computers',
    run(ctx, U) {
      const { ts, unparen, attrExpr } = ctx;
      const fix = 'lists computers by hand. Use ContainerTable (display) or ComputerPicker (pick); they own marks, state and order.';
      const isMap = (n) => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map' && !!n.arguments[0];
      /** The FilterChips options of a data view: a `.map()` held under `options` of a `filters` entry. */
      const filterOption = (n) => {
        let opt = false;
        for (let p = n.parent, hops = 0; p && hops < 10; p = p.parent, hops++) {
          if (ts.isPropertyAssignment(p) && ctx.propKey(p.name) === 'options') opt = true;
          else if (opt && ((ts.isPropertyAssignment(p) && ctx.propKey(p.name) === 'filters') || (ts.isJsxAttribute(p) && ctx.attrName(p) === 'filters'))) return true;
          if (ts.isFunctionLike(p) && p !== n) return false;
        }
        return false;
      };
      for (const file of U.sources) {
        const counted = new Set(); // declarations of the view a counted useDataView returned: its DataTable is the same site
        const sites = new Set(); // a named row builder mapped from several lists is one site (its declaration)
        /** A view expression that reads a counted useDataView's result (directly or through consts). */
        const fromCounted = (e, depth = 0) => {
          e = unparen(e);
          if (!e || depth > 4) return false;
          if (ts.isIdentifier(e)) {
            const d = ctx.localDecl(e);
            if (counted.has(d)) return true;
            return !!d && ts.isVariableDeclaration(d) && !!d.initializer && fromCounted(d.initializer, depth + 1);
          }
          let yes = false;
          ts.forEachChild(e, (k) => {
            if (!yes && fromCounted(k, depth + 1)) yes = true;
          });
          return yes;
        };
        /** A useDataView call that is itself a computer list (computer-typed, or computer columns). */
        const computerView = (n) => {
          if (!(ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useDataView' && !U.inside(file, n, COMPUTER_EXEMPT))) return false;
          const ta = n.typeArguments && n.typeArguments[0];
          const opts = n.arguments[0] && unparen(n.arguments[0]);
          const cols = opts && ts.isObjectLiteralExpression(opts) ? U.objProp(opts, 'columns') : null;
          return !!((ta && COMP_TYPE.test(ta.getText())) || (cols && U.computerColumns(cols)));
        };
        // first pass: every counted view's declaration, so a DataTable above its view (a render helper declared first) is judged alike
        const pre = (n) => {
          if (computerView(n) && ts.isVariableDeclaration(n.parent)) counted.add(n.parent);
          ts.forEachChild(n, pre);
        };
        pre(ctx.P.sourceOf(file));
        const v = (n) => {
          if (isMap(n) && !U.inside(file, n, COMPUTER_EXEMPT) && !filterOption(n)) {
            const cb = U.fnOf(n.arguments[0]);
            const recv = U.arrayRoot(n.expression.expression);
            const recvName = recv && (ts.isIdentifier(recv) ? recv.text : ts.isPropertyAccessExpression(recv) ? recv.name.text : null);
            const prm = cb && cb.parameters[0];
            const typed = (recv && ts.isIdentifier(recv) && COMP_TYPE.test(U.typeText(recv) || '')) || (prm && prm.type && COMP_TYPE.test(prm.type.getText()));
            const mark = cb && U.findEl(file, cb.body, (f) => U.nameOf(f) === 'ComputerMark', isMap); // a nested .map() is its own site
            const rows = cb && U.returnsOf(cb).some((r) => {
              const e = unparen(r);
              return e && ctx.isJsxEl(e) && COMPUTER_ROWS.has(U.nameOf(ctx.facts(file, e)));
            });
            const picker = U.inAttrOf(file, n, 'items', (f) => U.nameOf(f) === 'PickerPanel');
            const named = ts.isIdentifier(unparen(n.arguments[0])) ? cb : null;
            if ((mark || (((recvName && COMP_ARRAY.test(recvName)) || typed) && (rows || picker))) && !(named && sites.has(named))) {
              if (named) sites.add(named);
              ctx.hit(file, named || n, 'ui.computerList', `${recvName || 'a list'}.map(${named ? ts.idText(unparen(n.arguments[0])) : '…'}) ${fix}`);
            }
          }
          if (computerView(n)) {
            const ta = n.typeArguments && n.typeArguments[0];
            ctx.hit(file, n, 'ui.computerList', `useDataView${ta ? `<${ta.getText()}>` : ''} ${fix}`);
          }
          if (ctx.isJsxEl(n)) {
            const f = ctx.facts(file, n);
            if (U.nameOf(f) === 'DataTable' && !U.inside(file, n, COMPUTER_EXEMPT)) {
              const view = f.attrs.get('view') && attrExpr(f.attrs.get('view'));
              const ta = f.op.typeArguments && f.op.typeArguments[0];
              const cols = f.attrs.get('columns') && attrExpr(f.attrs.get('columns'));
              if (!(view && fromCounted(view)) && ((ta && COMP_TYPE.test(ta.getText())) || (cols && U.computerColumns(cols)))) ctx.hit(file, n, 'ui.computerList', `<DataTable> of computers ${fix}`);
            }
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
      }
    },
  },
  {
    id: 'ui.nativeTitle',
    explain: 'a title= attribute on an intrinsic element other than <iframe> (a native tooltip: no touch, no keyboard, no styling)',
    run(ctx, U) {
      for (const file of U.sources) {
        U.walkJsx(file, (n) => {
          const f = ctx.facts(file, n);
          // an <iframe>'s title is its accessible name, not a tooltip: exempt only when every tag the
          // element can be is an iframe
          const tag = f.intrinsic.find((x) => x !== 'iframe');
          const a = tag && f.attrs.get('title');
          if (a) ctx.hit(file, a, 'ui.nativeTitle', `title= on <${tag}> is a native tooltip (no touch, no keyboard). Use Tooltip/InfoTip, or show the text.`);
        });
      }
    },
  },
  {
    id: 'ui.inlineLabel',
    explain: 'an inline row action without `short` whose label (English) is over 20 characters or interpolates',
    run(ctx, U) {
      const { ts } = ctx;
      for (const file of U.sources) {
        const v = (n) => {
          if (ts.isObjectLiteralExpression(n)) {
            const inline = U.objProp(n, 'inline');
            const label = U.objProp(n, 'label');
            if (inline && inline.kind === ts.SyntaxKind.TrueKeyword && label && !U.objHas(n, 'short') && U.heldAsItem(n, ['label', 'inline', 'short'])) {
              const en = U.enText(file, label); // an unresolved key is not reported
              const bad = en && en.find((s) => s.length > 20 || s.includes('{{'));
              if (bad) ctx.hit(file, n, 'ui.inlineLabel', `an inline row action labelled "${bad}" (${bad.includes('{{') ? 'interpolates' : `${bad.length} characters`}) needs \`short\`: the inline button shows short ?? label.`);
            }
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
      }
    },
  },
  {
    id: 'ui.actionTwice',
    explain: 'one action offered twice in one component: a button and a menu/row item with the same label key or handler, or onRowAction and a row action calling the same callee',
    run(ctx, U) {
      const { ts, unparen, attrExpr } = ctx;
      const fix = 'offers the same action twice in one place. Keep one entry point (ActionBar, the row menu, or rowOpen).';
      for (const file of U.sources) {
        const comps = new Map(); // component key -> { btnKeys, presses, items, rowActs, rowCallees }
        /** The component a site belongs to; outside one, its outermost function (two helpers are two places), else the module. */
        const of = (n) => {
          const c = ctx.enclosingComponent(file, n);
          let k = c ? c.key : null;
          if (!k) {
            k = `${file}#`;
            for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) k = p;
          }
          return comps.get(k) || comps.set(k, { btnKeys: [], presses: [], items: [], rowCallees: [] }).get(k);
        };
        const v = (n) => {
          if (ctx.isJsxEl(n)) {
            const f = ctx.facts(file, n);
            const name = U.nameOf(f);
            if (TWICE_BUTTONS.has(name)) {
              for (const ch of ctx.childrenOf(n)) {
                const key = ts.isJsxExpression(ch) && ch.expression ? U.tKey(unparen(ch.expression)) : null;
                if (key) of(n).btnKeys.push({ key, node: n });
              }
              const op = f.attrs.get('onPress');
              const hk = op && U.handlerKey(attrExpr(op));
              if (hk) of(n).presses.push({ hk, node: n });
            }
            const oa = f.attrs.get('onAction');
            const hk = oa && U.handlerKey(attrExpr(oa));
            if (hk && !TWICE_BUTTONS.has(name)) of(n).items.push({ hk, node: n, key: null });
            if (name === 'DataTable' && f.attrs.get('onRowAction')) {
              const callee = U.calleeOf(attrExpr(f.attrs.get('onRowAction')));
              if (callee) of(n).rowCallees.push({ callee, node: n });
            }
          }
          if (ts.isObjectLiteralExpression(n) && U.objHas(n, 'label') && (U.objHas(n, 'onAction') || U.objHas(n, 'href')) && U.heldAsItem(n, ['label', 'onAction', 'href'])) {
            const oa = U.objProp(n, 'onAction');
            of(n).items.push({ hk: oa ? U.handlerKey(oa) : null, key: U.tKey(unparen(U.objProp(n, 'label'))), node: n, actCallee: oa ? U.bodyCallee(oa) : null });
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
        for (const c of comps.values()) {
          const done = new Set(); // one site per item, whichever forms it matches
          const once = (node, msg) => {
            if (done.has(node)) return;
            done.add(node);
            ctx.hit(file, node, 'ui.actionTwice', msg);
          };
          for (const it of c.items) {
            // (a) the same t('key') on a button and as an item's label
            if (it.key) for (const b of c.btnKeys) if (b.key === it.key && !U.exclusive(b.node, it.node)) once(it.node, `t('${it.key}') is a button and an item ${fix}`);
            // (b) the same handler on a button's onPress and an item's onAction
            if (it.hk) for (const p of c.presses) if (p.hk === it.hk && !U.exclusive(p.node, it.node)) once(it.node, `one handler is a button's onPress and an item's onAction ${fix}`);
            // (c) the callee of onRowAction called inside a row action's onAction
            if (it.actCallee) for (const r of c.rowCallees) if (r.callee === it.actCallee && !U.exclusive(r.node, it.node)) once(it.node, `${r.callee} is onRowAction and a row action ${fix}`);
          }
        }
      }
    },
  },
  {
    id: 'ui.bareNumber',
    explain: 'a number shown without its unit: an end-aligned DataTable accessor column with no cell or listLabel, or a Tag holding only a number',
    run(ctx, U) {
      const { ts, unparen } = ctx;
      for (const file of U.sources) {
        const v = (n) => {
          // an accessor column: col.accessor(x, { meta: { align: 'end' } }) or a { accessorKey | accessorFn } def
          let opts = null;
          if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'accessor' && n.arguments[1] && U.columnHelper(n.expression.expression)) opts = unparen(n.arguments[1]);
          else if (ts.isObjectLiteralExpression(n) && (U.objHas(n, 'accessorKey') || U.objHas(n, 'accessorFn'))) opts = n;
          if (opts && ts.isObjectLiteralExpression(opts)) {
            const meta = U.objProp(opts, 'meta');
            const m = meta && unparen(meta);
            const align = m && ts.isObjectLiteralExpression(m) ? U.objProp(m, 'align') : null;
            const end = align && ts.isStringLiteralLike(unparen(align)) && unparen(align).text === 'end';
            const listLabel = U.objHas(opts, 'listLabel') || (m && ts.isObjectLiteralExpression(m) && U.objHas(m, 'listLabel'));
            if (end && !U.objHas(opts, 'cell') && !listLabel) ctx.hit(file, n, 'ui.bareNumber', 'an end-aligned number column with no cell or listLabel: the narrow list shows a bare number. Give it listLabel (e.g. "7 steps") or a cell.');
          }
          if (ctx.isJsxEl(n) && U.nameOf(ctx.facts(file, n)) === 'Tag') {
            const kids = ctx.childrenOf(n).filter((k) => !(ts.isJsxText(k) && !k.text.trim()));
            const k = kids.length === 1 ? kids[0] : null;
            if (k && ((ts.isJsxText(k) && /^\s*\d+\s*$/.test(k.text)) || (ts.isJsxExpression(k) && k.expression && U.numberLike(file, k.expression)))) ctx.hit(file, n, 'ui.bareNumber', 'a Tag holding only a number: say what it counts ("3 failed").');
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
      }
    },
  },
  {
    id: 'ui.badgeUnit',
    explain: 'a number-like Tabs badge (a number, or a string like "12" or "99+") without a badgeUnit the item always carries',
    run(ctx, U) {
      const { attrExpr } = ctx;
      for (const file of U.sources) {
        const done = new Set();
        U.walkJsx(file, (n) => {
          const f = ctx.facts(file, n);
          if (U.nameOf(f) !== 'Tabs' || !f.attrs.get('items')) return;
          for (const item of U.itemObjects(attrExpr(f.attrs.get('items')))) {
            // only a unit the item surely ends up with exempts it: a conditional, overwritten, unknown or absent one counts the badge
            if (U.surelyHas(item, 'badgeUnit')) continue;
            for (const p of U.deepProps(item, 'badge')) {
              const val = U.propValue(p);
              if (done.has(p) || !val || !U.numberLike(file, val)) continue;
              done.add(p);
              ctx.hit(file, p, 'ui.badgeUnit', `a number badge (${val.getText()}) without badgeUnit: a screen reader hears a bare number. Add badgeUnit (n) => "3 unread".`);
            }
          }
        });
      }
    },
  },
  {
    id: 'ui.folderField',
    explain: 'a TextField for a folder (its English label says folder, directory or cwd): use the folder picker field',
    run(ctx, U) {
      const { ts, attrExpr, attrLiteral, unparen } = ctx;
      const fix = 'types a folder by hand. Use the folder field (FolderField), which browses and checks the folder.';
      const says = (list) => list && list.find((s) => FOLDER_WORDS.test(s));
      for (const file of U.sources) {
        U.walkJsx(file, (n) => {
          const f = ctx.facts(file, n);
          if (U.nameOf(f) !== 'TextField') return;
          const ml = f.attrs.get('multiline');
          if (ml && attrLiteral(ml) !== 'false' && !(attrExpr(ml) && unparen(attrExpr(ml)).kind === ts.SyntaxKind.FalseKeyword)) return; // a folder list (Board extension dirs)
          for (const an of ['label', 'aria-label']) {
            const a = f.attrs.get(an);
            const lit = a && attrLiteral(a);
            const hitWord = typeof lit === 'string' ? (FOLDER_WORDS.test(lit) ? lit : null) : a && attrExpr(a) ? says(U.enText(file, attrExpr(a))) : null;
            if (hitWord) {
              ctx.hit(file, n, 'ui.folderField', `<TextField ${an}="${hitWord}"> ${fix}`);
              return;
            }
          }
        });
        // a Board option-field descriptor ({ kind: 'text', key } / an opensFields { id, key }) renders a TextField labelled `${key}.label`
        const v = (n) => {
          if (ts.isObjectLiteralExpression(n) && U.objHas(n, 'id')) {
            const key = U.objProp(n, 'key');
            const kind = U.objProp(n, 'kind');
            const kindText = kind && ts.isStringLiteralLike(unparen(kind)) ? unparen(kind).text : kind ? null : undefined;
            const inOpens = !kind && U.underKey(n, 'opensFields');
            if (key && ts.isStringLiteralLike(unparen(key)) && (kindText === 'text' || inOpens)) {
              const table = U.nearestTable(file);
              const word = table && says(U.forms(table, `${unparen(key).text}.label`));
              if (word) ctx.hit(file, n, 'ui.folderField', `an option field labelled "${word}" ${fix}`);
            }
          }
          ts.forEachChild(n, v);
        };
        v(ctx.P.sourceOf(file));
      }
    },
  },
];

const UI_RULES = RULE_DEFS.map((r) => r.id);
const UI_CSS_RULES = RULE_DEFS.filter((r) => r.css).map((r) => r.id);
const UI_EXPLAIN = Object.fromEntries(RULE_DEFS.map((r) => [r.id, r.explain]));

/**
 * Runs every ui rule over the consumer files. ctx (from anatomy.cjs scan):
 *   ts, files, reg, P (createProject: sourceOf, traceLocal, exportBinding), facts(file, node), hit(file, node, rule, msg, scope?),
 *   cssHit(file, rule, at, msg) (CSS: `at` is an offset into the comment-stripped text cssRules returns), disabled (Set),
 *   ancestorEls, enclosingComponent, isTestFile, isSourceFile, cssRules, lineAt, and the AST helpers unparen, attrName,
 *   attrExpr, attrLiteral, propKey, propsBindings, localDecl, initializerOf, stringsOf, isJsxEl, openingOf, childrenOf,
 *   moduleClassesIn.
 */
function scanUi(ctx) {
  const { ts, files, reg, P } = ctx;
  const sources = Object.keys(files).filter((f) => ctx.isSourceFile(f) && isUiConsumer(f, ctx.isTestFile)).sort();
  const css = Object.keys(files).filter((f) => f.endsWith('.css') && isUiConsumer(f, ctx.isTestFile)).sort();
  const lookOwners = Array.isArray(reg.lookOwners) ? reg.lookOwners : [];

  const walkJsx = (file, fn) => {
    const v = (n) => {
      if (ctx.isJsxEl(n)) fn(n);
      ts.forEachChild(n, v);
    };
    v(P.sourceOf(file));
  };
  /** anatomy.cjs's layout.legacy names (Panel, Section, PageFrame, and Tabs in pages): their className is not counted again. */
  const isLegacy = (f) =>
    !!f.binding && f.binding.via && (reg.legacy.some((l) => l.file === f.binding.file && l.names.includes(f.binding.def)) || (!f.binding.file && ['Panel', 'PageFrame'].includes(f.binding.def)) || (f.file.startsWith('pages/') && !!f.binding.file && reg.legacyPageOnly.includes(f.binding.def) && f.binding.file.startsWith('kit/')));
  const isVisual = (f) => !!f.binding && f.binding.kit && f.binding.def === 'Visual';

  let kitPropsMemo = null;
  /** Custom properties the kit declares or reads: every `--x:` and `var(--x)` in kit CSS, and every quoted '--x' in kit sources. */
  const kitCustomProps = () => {
    if (kitPropsMemo) return kitPropsMemo;
    const out = new Set();
    for (const f of Object.keys(files)) {
      if (!f.startsWith('kit/')) continue;
      if (f.endsWith('.css')) {
        const { rules, text } = ctx.cssRules(files[f]);
        for (const r of rules) for (const d of r.decls) if (d.prop.startsWith('--')) out.add(d.prop);
        for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) out.add(m[1]);
      } else if (ctx.isSourceFile(f)) for (const m of files[f].matchAll(/['"`](--[a-zA-Z][\w-]*)['"`]/g)) out.add(m[1]);
    }
    return (kitPropsMemo = out);
  };
  /** The theme attributes: the data-* names kit/tokens.css selects on, read at scan time. */
  const themeAttrs = () => new Set([...(files['kit/tokens.css'] || '').matchAll(/\[\s*(data-[a-z0-9-]+)/gi)].map((m) => m[1].toLowerCase()));

  // Visual-only: per CSS module, the classes referenced inside a <Visual> subtree and those referenced anywhere
  // else, over every source file that imports it. A module any importer uses other than as `s.<name>` exempts nothing.
  let modsMemo = null;
  const moduleUse = () => {
    if (modsMemo) return modsMemo;
    modsMemo = new Map(); // css file -> { inside: Set, outside: Set, dynamic: bool }
    const use = (cssFile) => modsMemo.get(cssFile) || modsMemo.set(cssFile, { inside: new Set(), outside: new Set(), dynamic: false }).get(cssFile);
    for (const file of Object.keys(files)) {
      if (!ctx.isSourceFile(file) || !/\.(tsx|jsx)$/.test(file)) continue;
      const info = P.infoOf(file);
      const mods = new Map(); // local -> { css, cls } (cls: a named import's class, else null)
      for (const [local, imp] of info.imports) if (/\.module\.css$/.test(imp.spec) && imp.spec.startsWith('.')) mods.set(local, { css: path.posix.join(path.posix.dirname(file), imp.spec), cls: imp.name === 'default' || imp.name === '*' ? null : imp.name });
      if (!mods.size) continue;
      const inVisual = (node) => {
        for (const a of ctx.ancestorEls(file, node)) if (isVisual(a)) return true;
        return false;
      };
      const v = (n) => {
        if (ts.isIdentifier(n) && mods.has(n.text)) {
          const p = n.parent;
          const declSite = ts.isImportClause(p) || ts.isImportSpecifier(p) || ts.isNamespaceImport(p) || (ts.isPropertyAccessExpression(p) && p.name === n) || ts.isQualifiedName(p) || ((ts.isPropertyAssignment(p) || ts.isJsxAttribute(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p) || ts.isBindingElement(p)) && p.name === n) || (ts.isBindingElement(p) && p.propertyName === n);
          if (!declSite && ctx.localDecl(n) === null) {
            const m = mods.get(n.text);
            const u = use(m.css);
            const cls = m.cls !== null ? m.cls : ts.isPropertyAccessExpression(p) && p.expression === n ? p.name.text : null;
            if (cls === null) u.dynamic = true;
            else (inVisual(n) ? u.inside : u.outside).add(cls);
          }
        }
        ts.forEachChild(n, v);
      };
      v(P.sourceOf(file));
    }
    return modsMemo;
  };
  /** A predicate over a rule's selector: every class in it is used only inside <Visual> (at least one class; never for a dynamic module). */
  const visualOnly = (cssFile) => {
    const u = moduleUse().get(cssFile);
    if (!u || u.dynamic || !u.inside.size) return () => false;
    return (sel) => {
      const cls = [...sel.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
      return cls.length > 0 && cls.every((c) => u.inside.has(c) && !u.outside.has(c));
    };
  };

  const U = {
    sources,
    css,
    isUiConsumer: (f) => isUiConsumer(f, ctx.isTestFile),
    isLookOwner: (f) => lookOwners.some((o) => (o.endsWith('/') ? f.startsWith(o) : stemOf(f) === o)),
    walkJsx,
    isLegacy,
    isVisual,
    /** A kit part: an element whose tag traces to a kit export, minus the legacy names. */
    isKitPart: (f) => !!f.binding && f.binding.kit && !isLegacy(f),
    kitCustomProps,
    themeAttrs,
    visualOnly,
    ...std8Helpers(ctx),
  };
  for (const r of RULE_DEFS) if (!ctx.disabled.has(r.id)) r.run(ctx, U);
}

module.exports = { UI_RULES, UI_CSS_RULES, UI_EXPLAIN, scanUi, isUiConsumer, RULE_DEFS };
