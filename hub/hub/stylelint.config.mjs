// Stylelint for the Hub v3 app: colours, spacing, radius and z-index come
// from tokens.css only. Logical properties everywhere (RTL-ready). The design rules: blue only
// through the link and focus tokens (scripts/lint/stylelint-hub.mjs), no dashed borders (the side nav's item line excepted).
import { createRequire } from 'node:module';
import hubRules from './scripts/lint/stylelint-hub.mjs';

const exceptions = createRequire(import.meta.url)('./scripts/lint/exceptions.cjs');

const TOKENS_ONLY = 'Use a token from hub/src/kit/tokens.css (var(--…)).';

export default {
  extends: ['stylelint-config-standard'],
  plugins: hubRules,
  rules: {
    // The design rules fail. hub/page-anatomy-css stays a warning: it repeats the anatomy ratchet.
    'hub/blue-only-link-focus': true,
    'hub/no-dashed': true,
    'hub/token-use': true,
    'hub/hover-parity': true,
    'hub/page-anatomy-css': [true, { severity: 'warning' }],
    // Colours: tokens only.
    'color-no-hex': [true, { message: TOKENS_ONLY }],
    'color-named': ['never', { message: TOKENS_ONLY }],
    'function-disallowed-list': [['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'], { message: TOKENS_ONLY }],
    // Spacing, radius, z-index: tokens only (0 and calc() of tokens are fine).
    'declaration-property-value-disallowed-list': [
      {
        '/^(margin|padding|gap|row-gap|column-gap)(-.*)?$/': ['/(?<![\\w-])-?(?:0?\\.\\d*[1-9]\\d*|[1-9][\\d.]*)(?:e[+-]?\\d+)?(px|rem|em)\\b/i'],
        '/^border(-.*)?-radius$/': ['/(?<![\\w-])(?:0?\\.\\d*[1-9]\\d*|[1-9][\\d.]*)(?:e[+-]?\\d+)?(px|rem|em|%)(?![\\w])/i'],
        'z-index': ['/^-?\\d+$/'],
      },
      { message: TOKENS_ONLY },
    ],

    // Logical properties.
    'property-disallowed-list': [
      ['margin-left', 'margin-right', 'padding-left', 'padding-right', 'left', 'right', 'border-left', 'border-right', 'text-align-last'],
      { message: 'Use logical properties (margin-inline-start, inset-inline-end, …).' },
    ],
    'declaration-property-value-allowed-list': {
      'text-align': ['start', 'end', 'center', 'justify'],
      float: ['inline-start', 'inline-end', 'none'],
    },
    // House style.
    'selector-class-pattern': ['^[a-z][a-zA-Z0-9_]*$|^rc-[a-z]+$', { message: 'camelCase class names (CSS Modules).' }],
    'keyframes-name-pattern': null,
    'no-descending-specificity': null,
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'rule-empty-line-before': null,
    'media-feature-range-notation': 'context',
    'value-keyword-case': 'lower',
    'declaration-block-no-redundant-longhand-properties': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
  },
  overrides: [
    // Kit CSS takes its type, motion and shadow values from tokens.css (the rules: scripts/lint/stylelint-hub.mjs).
    // kit/** and shell/** only; page CSS is not held to this yet.
    {
      files: ['**/src/kit/**/*.css', '**/src/shell/**/*.css'],
      rules: {
        'hub/no-raw-font-weight': true,
        'hub/no-raw-line-height': true,
        'hub/no-raw-letter-spacing': true,
        'hub/no-raw-duration': true,
        'hub/no-raw-shadow': true,
      },
    },
    // A kit control's height and width come from size tokens; today's misses are frozen in
    // scripts/lint/control-size.debt.cjs, shrink-only (app/conformance.controlsize.test.ts). Kit only: page CSS is not held to this yet.
    {
      files: ['**/src/kit/**/*.css'],
      rules: { 'hub/control-size-token': true },
    },
    // Kit focus is the --focus-ring shadow; an outline in the focus colour only under forced-colors.
    // base.css draws the global default ring as an outline (the one place it may); today's others are frozen in
    // scripts/lint/focus-ring.debt.cjs, shrink-only (app/conformance.focusring.test.ts).
    {
      files: ['**/src/kit/**/*.css'],
      rules: { 'hub/focus-ring-token': true },
    },
    {
      files: ['**/src/kit/base.css'],
      rules: { 'hub/focus-ring-token': null },
    },
    {
      files: ['**/kit/tokens.css'],
      rules: {
        'hub/no-raw-font-weight': null,
        'hub/no-raw-line-height': null,
        'hub/no-raw-letter-spacing': null,
        'hub/no-raw-duration': null,
        'hub/no-raw-shadow': null,
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null,
        'declaration-property-value-disallowed-list': null,
        'color-hex-length': null,
        'alpha-value-notation': null,
        'color-function-notation': null,
        'color-function-alias-notation': null,
        'font-family-name-quotes': null,
      },
    },
    // File-scoped, empty unless an exception entry lists a stylelint rule.
    ...exceptions.forStylelint(),
  ],
};
