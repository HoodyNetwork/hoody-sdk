// A secret ExtLink (an address with an access id in its host, or one the caller marks secret) is the web's button
// with no href: a press opens the whole address by script. In the terminal it drew as a 'button' that nothing could
// focus or press, so the address could not be opened at all. Now: Tab reaches it, a
// press hands the whole address to openOutside; the address is never drawn, not in the toast either.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { act, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { closeToast, toastQueue } from '../states/Toast.store';
import { ExtLink, autolink } from './Link';

const ID = '0123456789abcdef01234567';
const SECRET = `https://${ID}.apps.example.com/x`;

let t: TestTerm | null = null;
let s: TermSession | null = null;
const clear = () => { for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); };
afterEach(() => { t?.renderer.destroy(); t = null; s?.end(); s = null; clear(); });
beforeEach(clear);
const shown = () => toastQueue().visibleToasts.map((x) => ({ title: x.content.title, body: x.content.body }));
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
// Drawn without the terminal app the name ends "(opens in a new tab)"; once the app has put its wording into the shared
// table (another file of the same run) it ends "(opens outside the Hub)". Either names the button.
const OPENS = /opens (in a new tab|outside the Hub)/;
const press = async (name: RegExp) => { act(getByRole(tree(), 'button', { name }), 'press'); await t!.settle(); };

test('a secret address by shape: a button that takes the focus and opens the whole address', async () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><ExtLink url={SECRET} /></FocusRoot>, { width: 50, height: 4 });
  await t.settle();
  expect(t.captureCharFrame()).toContain('https://•••• ⇗');
  await press(OPENS);
  expect(opened).toEqual([SECRET]);
  expect(shown()).toEqual([]);
  expect(getByRole(tree(), 'button', { name: OPENS }).states.focused).toBe(true);
  expect(t.captureCharFrame()).not.toContain(ID);
});

test('one the caller marks secret opens whole from its words', async () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><ExtLink url="https://example.com/share/abc" secret>Shared</ExtLink></FocusRoot>, { width: 50, height: 4 });
  await t.settle();
  await press(/^Shared/);
  expect(opened).toEqual(['https://example.com/share/abc']);
});

test('no host browser: copied whole, the toast shows the mask and never the address', async () => {
  const copied: string[] = [];
  s = beginTermSession({ copy: (x) => { copied.push(x); } });
  t = await drawTest(<FocusRoot><ExtLink url="https://example.com/share/abc" secret>Shared</ExtLink></FocusRoot>, { width: 50, height: 4 });
  await t.settle();
  await press(/^Shared/);
  expect(copied).toEqual(['https://example.com/share/abc']);
  expect(shown()).toEqual([{ title: 'Copied the address: open it in your browser', body: 'https://••••' }]);
});

test('no host browser and no clipboard: it says so, and still never shows the address', async () => {
  s = beginTermSession({});
  t = await drawTest(<FocusRoot><ExtLink url={SECRET} /></FocusRoot>, { width: 50, height: 4 });
  await t.settle();
  await press(OPENS);
  const now = shown();
  expect(now.length).toBe(1);
  expect(now[0]!.title).toContain("can't be opened or copied from here");
  expect(now[0]!.body).toBeUndefined();
  expect(JSON.stringify(now)).not.toContain(ID);
  expect(JSON.stringify(now)).not.toContain('apps.example.com');
});

test('an address that is not secret stays a terminal link (no button)', async () => {
  s = beginTermSession({});
  t = await drawTest(<FocusRoot><ExtLink url="https://docs.hoody.com/start" /></FocusRoot>, { width: 50, height: 4 });
  await t.settle();
  expect(queryAllByRole(tree(), 'button')).toEqual([]);
  expect(getByRole(tree(), 'link', { name: /docs\.hoody\.com/ })).toBeDefined();
});

// A web file's sentence (a <p> through the compat runtime), which is how autolink reaches the terminal.
test('inside a sentence (autolink, secret): the words keep their line and the button opens', async () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><Box dir="column"><p>{autolink('See https://a.example/docs for more.', { secret: true })}</p></Box></FocusRoot>, { width: 60, height: 4 });
  await t.settle();
  const f = t.captureCharFrame();
  expect(f).toContain('See https://•••• ⇗ for more.');
  await press(OPENS);
  expect(opened).toEqual(['https://a.example/docs']);
});

// Connect tab, Files row at 120x40: the mask broke at its slash ("https://" then "••••" on the next line) when the
// row's buttons took the width. The mask never shrinks; what stands beside it gives way.
test('the mask never breaks: a crowded row keeps "https://••••" on one line', async () => {
  s = beginTermSession({});
  t = await drawTest(
    <FocusRoot>
      <Box dir="row" width={24}>
        <ExtLink url={SECRET} icon={false} />
        <Box dir="row" shrink={0}><Text>[Mount on your device]</Text></Box>
      </Box>
    </FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  expect(t.captureCharFrame()).toContain('https://••••');
});
