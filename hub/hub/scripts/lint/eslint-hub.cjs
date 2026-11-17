// Local ESLint rules of the Hub: common mistakes caught early.
// Each message names the kit component or rule that fixes it.
//   hub/one-accent        at most one accent (primary) button rendered together
//   hub/no-text-literal   user-visible text in object literals (column headers, menu items) comes from strings
//   hub/no-raw-color      no hex / rgb() / --hx-blue in TS/TSX: colours live in tokens.css
//   hub/use-data-view     pages never hand-roll search, filters or sort over rows (FUNCTIONAL RULE)
//   hub/retired-syntax    variant="subtle" and literal ellipses in JSX
//   hub/retired-alias     old names kept as aliases: a warning, and a count that only shrinks
//   hub/anatomy           page-layout debt above a file's `layout.*` rows in conformance.allow.ts (anatomy.cjs; the ratchet test is the truth)
//   hub/no-loose-faqlink, hub/one-band-per-section, hub/no-drawer-ol   the layout rules of the same detector under their own names:
//                         layout.looseFaqLink, layout.bandsPerSection, layout.drawerOl; hub/anatomy skips them
'use strict';

const ACCENT = new Set(['primary', 'accent']);

/** The literal string of a JSX attribute value, if it is one. */
function attrString(attr) {
  const v = attr && attr.value;
  if (!v) return undefined;
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
  if (v.type === 'JSXExpressionContainer' && v.expression.type === 'Literal' && typeof v.expression.value === 'string') return v.expression.value;
  const e = v.type === 'JSXExpressionContainer' ? v.expression : undefined;
  if (e && e.type === 'TemplateLiteral' && e.expressions.length === 0) return e.quasis.map((q) => q.value.cooked).join('');
  return undefined;
}

const oneAccent = {
  meta: {
    type: 'suggestion',
    messages: {
      second:
        'A second accent button renders beside "{{first}}" (one primary per screen). Make this one variant="secondary", or render them in different branches (a condition, a state). ' +
        'An EmptyState with its own primary replaces the header primary while it shows.',
    },
    schema: [],
  },
  create(context) {
    const src = context.sourceCode ?? context.getSourceCode();
    // Accent elements found per outermost JSX tree, skipping any under a condition (?:, &&, ||).
    const roots = new Map();
    const isJsx = (n) => n && (n.type === 'JSXElement' || n.type === 'JSXFragment');
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'variant' || !ACCENT.has(attrString(node) ?? '')) return;
        const el = node.parent.parent; // JSXOpeningElement → JSXElement
        let root = el;
        for (let p = el.parent; p; p = p.parent) {
          if (p.type === 'ConditionalExpression' || p.type === 'LogicalExpression' || p.type === 'IfStatement') return;
          if (p.type === 'CallExpression' || p.type.startsWith('Function') || p.type === 'ArrowFunctionExpression') break;
          if (isJsx(p)) root = p;
        }
        const list = roots.get(root) ?? [];
        list.push(el);
        roots.set(root, list);
      },
      'Program:exit'() {
        for (const list of roots.values()) {
          if (list.length < 2) continue;
          const first = src.getText(list[0].openingElement).slice(0, 60);
          for (const el of list.slice(1)) context.report({ node: el.openingElement, messageId: 'second', data: { first } });
        }
      },
    };
  },
};

// Object keys that carry user-visible text (column defs, menu entries, chips, toasts, steps).
const TEXT_KEYS = /^(label|title|header|description|placeholder|emptyText|tooltip|message|hint|body|subtitle|caption|confirmLabel|cancelLabel|text|summary)$/;
// A string that reads as words: a capital or a space between letters. Keys ('col.name') do not.
const WORDS = /[A-Z][a-z]|[A-Za-z] [A-Za-z]/;

const noTextLiteral = {
  meta: {
    type: 'problem',
    messages: {
      literal: 'User-visible text "{{text}}" comes from strings.en.json: {{key}}: t(\'…\'). A strings key ("col.name") is fine.',
    },
    schema: [],
  },
  create(context) {
    const file = context.filename ?? context.getFilename();
    const manifest = /[\\/]page\.ts$/.test(file);
    return {
      Property(node) {
        const key = node.key && (node.key.name ?? node.key.value);
        if (typeof key !== 'string' || !TEXT_KEYS.test(key)) return;
        if (manifest && key === 'description') return; // manifest notes for agents, never rendered
        const v = node.value;
        const text = v.type === 'Literal' && typeof v.value === 'string' ? v.value : v.type === 'TemplateLiteral' && v.expressions.length === 0 ? v.quasis[0].value.cooked : undefined;
        // Keys ('link.cliRef') and code or payload samples ('{"title": …}') are not prose.
        if (text === undefined || !WORDS.test(text) || /^[a-z][\w-]*(\.[\w-]+)+$/.test(text) || /^\s*[{[<]/.test(text)) return;
        context.report({ node: v, messageId: 'literal', data: { text: text.slice(0, 40), key } });
      },
    };
  },
};

const RAW_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$|\b(?:rgba?|hsla?|oklch|oklab)\(|--hx-blue/i;

const noRawColor = {
  meta: {
    type: 'problem',
    messages: {
      raw: 'Raw colour "{{text}}" in code: colours come from tokens.css through CSS modules. Blue is only --hx-link and focus.',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      if (typeof text === 'string' && RAW_COLOR.test(text.trim())) context.report({ node, messageId: 'raw', data: { text: text.slice(0, 40) } });
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
    };
  },
};

// searchText-style accessors feed useDataView `search` and are fine; filter*/sort* helpers are not.

// Page search boxes the box branch lets stand: hub/src path -> how many boxes the file holds
// today and why. A file gets that many boxes, no more (the next one is reported). Shrink-only: a fixed box lowers its
// count (or drops the row) in the same change; a raise or a new row is a reviewed change to this
// file. app/conformance.searchbox.test.ts fails a count that no longer equals the file's boxes. Only the box branch
// reads it: the search and fn branches stay on in these files.
const BOX_ALLOW = Object.freeze({
  'pages/ai/agents/Tools.tsx': Object.freeze({ boxes: 1, why: "debt: a local filter over the agent's tool checklist (beside its on/off segments), not a DataTable list yet" }),
  'pages/ai/knowledge/skills/Hub.tsx': Object.freeze({ boxes: 1, why: 'a query sent to the remote skill hub on submit, not a filter over loaded rows' }),
  'pages/apps/launch/FindPane.tsx': Object.freeze({ boxes: 1, why: "debt: the launcher catalogue's search over its sectioned groups (recent, agents, GitHub), not a DataTable list" }),
  'pages/board/parts/Picker.tsx': Object.freeze({ boxes: 1, why: "debt: the hand-built picker's combobox input; it goes with the Picker move to the kit PickerPanel" }),
  'pages/computers/parts/RealmsLine.tsx': Object.freeze({ boxes: 1, why: 'a short read-only realm list inside a popover, shown from SEARCH_FROM entries only, not a list page' }),
  'pages/files/Find.tsx': Object.freeze({ boxes: 1, why: 'a file find sent to the computer on submit, not a filter over loaded rows' }),
  'pages/logs/view.tsx': Object.freeze({ boxes: 1, why: "the logs stream's query in the toolbar: read by the server for each source, not a filter over a DataTable's rows" }),
});

/** A file's path relative to hub/src ('pages/x/y.tsx'), or '' outside it. */
function srcPath(filename) {
  const f = String(filename || '').split('\\').join('/');
  const i = f.lastIndexOf('/hub/src/');
  return i < 0 ? '' : f.slice(i + '/hub/src/'.length);
}
const VIEW_FN = /^(apply(Filters?|Search|Sort)|(filter|sort)[A-Z]\w*)$/;

const useDataView = {
  meta: {
    type: 'problem',
    messages: {
      search:
        'Hand-rolled search over rows. Search, filter chips, sort, paging and selection come from useDataView (@kit) and render in <DataTable view={view}>: ' +
        'URL-kept, restored on reload, with the no-match state and Clear filters.',
      fn: '"{{name}}" looks like a hand-rolled list filter/sort. Declare it as a useDataView filter ({ id, label, value: (row) => … }) or column sort instead.',
      box: 'A page-built search box. The search lives in <DataTable view={view}> (useDataView `search`), so it is URL-kept and pairs with no-match + Clear filters.',
    },
    // ignoreAllow: count every box as if no BOX_ALLOW row held the file (conformance.searchbox.test.ts measures with it).
    schema: [{ type: 'object', properties: { ignoreAllow: { type: 'boolean' } }, additionalProperties: false }],
  },
  create(context) {
    const src = context.sourceCode ?? context.getSourceCode();
    const name = (n) => n && n.type === 'Identifier' && n.name;
    const file = srcPath(context.filename ?? context.getFilename());
    const row = Object.prototype.hasOwnProperty.call(BOX_ALLOW, file) ? BOX_ALLOW[file] : undefined;
    let left = (context.options[0] && context.options[0].ignoreAllow) || !row ? 0 : row.boxes;
    // The kit SearchField under any local name: the plain name, an import alias (`SearchField as Q`), or a namespace
    // import's member (`<K.SearchField>`). A JSX tag is a JSXIdentifier, never an Identifier (the box branch read it
    // with name() and never fired).
    const boxNames = new Set(['SearchField']);
    const namespaces = new Set();
    const isBoxTag = (n) => {
      if (!n) return false;
      if (n.type === 'JSXIdentifier') return boxNames.has(n.name);
      return n.type === 'JSXMemberExpression' && n.object.type === 'JSXIdentifier' && namespaces.has(n.object.name) && n.property.name === 'SearchField';
    };
    return {
      ImportDeclaration(node) {
        for (const s of node.specifiers) {
          if (s.type === 'ImportSpecifier' && (s.imported.name ?? s.imported.value) === 'SearchField') boxNames.add(s.local.name);
          else if (s.type === 'ImportNamespaceSpecifier') namespaces.add(s.local.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || name(callee.property) !== 'filter') return;
        const fn = node.arguments[0];
        if (!fn || !/Function/.test(fn.type)) return;
        const body = src.getText(fn);
        if (/toLowerCase|toLocaleLowerCase|normalize\(|foldText/.test(body) && /\.includes\(|\.startsWith\(|\.indexOf\(|matchesSearch/.test(body)) {
          context.report({ node, messageId: 'search' });
        }
      },
      FunctionDeclaration(node) {
        if (node.id && VIEW_FN.test(node.id.name)) context.report({ node: node.id, messageId: 'fn', data: { name: node.id.name } });
      },
      VariableDeclarator(node) {
        if (name(node.id) && VIEW_FN.test(node.id.name) && node.init && /Function/.test(node.init.type)) {
          context.report({ node: node.id, messageId: 'fn', data: { name: node.id.name } });
        }
      },
      JSXOpeningElement(node) {
        const type = node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'type');
        const input = node.name.type === 'JSXIdentifier' && node.name.name === 'input' && attrString(type) === 'search';
        if (!isBoxTag(node.name) && !input) return;
        if (left > 0) left -= 1;
        else context.report({ node, messageId: 'box' });
      },
    };
  },
};

// Retired design patterns, kept apart from no-restricted-syntax so they can warn on their own.
const retiredSyntax = {
  meta: {
    type: 'suggestion',
    messages: {
      subtle: 'The muted-grey link variant is retired: <Link> for links in prose, the nav Link variant for navigation chrome, <TextButton> for actions.',
      ellipsis: 'A literal ellipsis in JSX: put it in the strings value ("Rename…", "Loading…"), never beside t().',
      searchSm: 'SearchField size="sm" is retired: a search field is as tall and as large as every other field; size="toolbar" in a toolbar.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name === 'variant' && attrString(node) === 'subtle') context.report({ node, messageId: 'subtle' });
        if (node.name.name === 'size' && attrString(node) === 'sm' && node.parent.name.name === 'SearchField') context.report({ node, messageId: 'searchSm' });
      },
      JSXText(node) {
        if (/…|\.\.\./.test(node.value)) context.report({ node, messageId: 'ellipsis' });
      },
    };
  },
};

// Old names kept as aliases while their callers move: `tone` for danger. A warning, not an error, so a page moves when it is next touched; the number of hits
// in the Hub's sources only shrinks (app/conformance.retiredalias.test.ts), and at zero the old names are retired.
const ALIAS_BUTTONS = new Set(['Button', 'LinkButton', 'IconButton']);
const OLD_DANGER = new Set(['danger', 'dangerSolid']);
const retiredAlias = {
  meta: {
    type: 'suggestion',
    messages: {
      variant: 'variant="{{v}}" is the old spelling of tone="danger": tone="danger", with variant="primary" only for the filled, armed confirm.',
      primaryVariant: 'primaryVariant="{{v}}" is the old spelling of primaryTone="danger".',
    },
    schema: [],
  },
  create(context) {
    const tag = (n) => (n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? n.property.name : undefined);
    /** The old danger name an expression can take: a literal, `'danger' as const`, either branch of a conditional, the
     *  right of a logical (x && 'danger'). Anything else (a variable, a call) is not read. */
    const oldName = (e) => {
      if (!e) return undefined;
      if (e.type === 'JSXExpressionContainer' || e.type === 'TSAsExpression' || e.type === 'TSSatisfiesExpression') return oldName(e.expression);
      if (e.type === 'Literal') return OLD_DANGER.has(e.value) ? e.value : undefined;
      if (e.type === 'TemplateLiteral' && e.expressions.length === 0) {
        const s = e.quasis.map((q) => q.value.cooked).join('');
        return OLD_DANGER.has(s) ? s : undefined;
      }
      if (e.type === 'ConditionalExpression') return oldName(e.consequent) ?? oldName(e.alternate);
      if (e.type === 'LogicalExpression') return oldName(e.right) ?? oldName(e.left);
      return undefined;
    };
    const keyOf = (p) => p.type === 'Property' && p.key && (p.key.type === 'Identifier' ? p.key.name : p.key.value);
    /** Object literals a spread can hand over: {…}, either branch of a conditional, the right of a logical. */
    const objectsOf = (e) => {
      if (!e) return [];
      if (e.type === 'TSAsExpression' || e.type === 'TSSatisfiesExpression') return objectsOf(e.expression);
      if (e.type === 'ObjectExpression') return [e];
      if (e.type === 'ConditionalExpression') return [...objectsOf(e.consequent), ...objectsOf(e.alternate)];
      if (e.type === 'LogicalExpression') return [...objectsOf(e.left), ...objectsOf(e.right)];
      return [];
    };
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const attr = node.name.name;
        const el = tag(node.parent.name);
        const v = oldName(node.value);
        if (!v) return;
        if (attr === 'variant' && ALIAS_BUTTONS.has(el)) context.report({ node, messageId: 'variant', data: { v } });
        else if (attr === 'primaryVariant') context.report({ node, messageId: 'primaryVariant', data: { v } });
      },
      // Props spread onto a kit button ({...(x ? { variant: 'danger' as const } : {})}).
      JSXSpreadAttribute(node) {
        if (!ALIAS_BUTTONS.has(tag(node.parent.name))) return;
        for (const o of objectsOf(node.argument))
          for (const p of o.properties) {
            const v = keyOf(p) === 'variant' ? oldName(p.value) : undefined;
            if (v) context.report({ node: p, messageId: 'variant', data: { v } });
          }
      },
      // A Dialog's props built as an object ({ primaryVariant: 'danger' } spread onto it, or passed on).
      Property(node) {
        const v = keyOf(node) === 'primaryVariant' ? oldName(node.value) : undefined;
        if (v) context.report({ node, messageId: 'primaryVariant', data: { v } });
      },
    };
  },
};

// Page anatomy: the import-resolving detector scripts/lint/anatomy.cjs, reported per
// file. Only debt above the file's row (pages/<page>/conformance.allow.ts, `layout.*`) is reported; the ratchet test and the
// layout gate are what fail the build. ESLint's cache keeps a file's result while the file is unchanged, so a lint warning
// may lag behind a change in another file: the ratchet is the truth.
// The layout rules (loose FaqLinks, Bands per section, drawer lists) are the detector's too, reported under their own names: hub/anatomy leaves them out.
const LAYOUT_ALIAS = { 'no-loose-faqlink': 'layout.looseFaqLink', 'one-band-per-section': 'layout.bandsPerSection', 'no-drawer-ol': 'layout.drawerOl' };
const LAYOUT_ALIAS_IDS = new Set(Object.values(LAYOUT_ALIAS));
/** A rule reporting the detector's hits above the file's rows, for the rule ids `keep` accepts. */
const anatomyRule = (keep) => ({
  meta: {
    type: 'suggestion',
    messages: { hit: '{{msg}} [{{rule}}; the page anatomy: hub/scripts/lint/anatomy.cjs]' },
    schema: [],
  },
  create(context) {
    const file = (context.filename ?? context.getFilename()).split(require('node:path').sep).join('/');
    const at = file.lastIndexOf('/hub/src/');
    if (at < 0 || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return {};
    const src = file.slice(0, at + '/hub/src'.length);
    const rel = file.slice(at + '/hub/src/'.length);
    if (!/^(pages|kit|shell|ask|app)\//.test(rel)) return {};
    return {
      Program() {
        const anatomyDetector = require('./anatomy.cjs');
        for (const h of anatomyDetector.lintHits(src, rel)) {
          if (!keep(h.rule)) continue;
          context.report({ loc: { line: h.line, column: Math.max(0, h.col - 1) }, messageId: 'hit', data: { msg: h.msg, rule: h.rule } });
        }
      },
    };
  },
});
const anatomy = anatomyRule((id) => !LAYOUT_ALIAS_IDS.has(id));
const layoutAliasRules = Object.fromEntries(Object.entries(LAYOUT_ALIAS).map(([name, id]) => [name, anatomyRule((r) => r === id)]));

module.exports = { BOX_ALLOW, rules: { anatomy, ...layoutAliasRules, 'retired-syntax': retiredSyntax, 'retired-alias': retiredAlias, 'one-accent': oneAccent, 'no-text-literal': noTextLiteral, 'no-raw-color': noRawColor, 'use-data-view': useDataView } };
