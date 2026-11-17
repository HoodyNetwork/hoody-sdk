// @core/pure: core functions whose whole import closure is free of CSS, packages and browser
// globals, so Node-loaded code (Playwright specs and the links.ts files they import) can use them; the @core barrel
// cannot load there. A name joins only when kit/entries.closure.test.ts passes with it; its list there is the
// membership. Pages import it as '@core/pure'.
export { isRealmId, isRealmOrGlobal } from './realm-id';
export { utf8Bytes } from './utf8';
