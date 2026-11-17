// A LinkButton or Link whose href is an absolute http(s) address (the web opens it in a new tab) hands it to openOutside in
// the terminal: the host's browser when there is one, else the address copied and shown whole. It did nothing at all
// (Notes, "Open Notes"). A Hub route still navigates and opens nothing outside.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { act, getByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { closeToast, toastQueue } from '../states/Toast.store';
import { LinkButton } from './Button';
import { Link } from './Link';

let t: TestTerm | null = null;
let s: TermSession | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; s?.end(); s = null; for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); });
const clear = () => { for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); };
beforeEach(clear); // another file's press may have left one
const shown = () => toastQueue().visibleToasts.map((x) => ({ title: x.content.title, body: x.content.body }));
const pressLink = async (name: string) => { act(getByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'link', { name }), 'press'); await t!.settle(); };

test('Enter on an http(s) link button opens the address in the host browser', async () => {
  const opened: string[] = [];
  const pressed: number[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><LinkButton href="https://notes.example.com/a?b=1" onPress={() => pressed.push(1)}>Open Notes</LinkButton></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  await pressLink('Open Notes');
  expect(opened).toEqual(['https://notes.example.com/a?b=1']);
  expect(pressed).toEqual([1]);
  expect(shown()).toEqual([]);
});

test('no host browser: the address is shown whole, never nothing', async () => {
  s = beginTermSession({});
  t = await drawTest(<FocusRoot><LinkButton href="HTTPS://notes.example.com/a">Open Notes</LinkButton></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  await pressLink('Open Notes');
  expect(shown()).toEqual([{ title: 'Open this address in your browser', body: 'HTTPS://notes.example.com/a' }]);
});

test('a Hub route opens nothing outside', async () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><LinkButton href="/notes">Notes</LinkButton></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  await pressLink('Notes');
  expect(opened).toEqual([]);
  expect(shown()).toEqual([]);
});

test('a kit Link with an http(s) address does the same (Notes: the group row\'s Open Notes)', async () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><Link href="https://notes.example.com/n">Open Notes</Link></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  await pressLink('Open Notes');
  expect(opened).toEqual(['https://notes.example.com/n']);
  s.end();
  s = beginTermSession({});
  await pressLink('Open Notes');
  expect(shown()).toEqual([{ title: 'Open this address in your browser', body: 'https://notes.example.com/n' }]);
});

test('an address holding an id shows only the mask; the browser and the clipboard get it whole', async () => {
  const id = '0123456789abcdef01234567';
  const url = `https://${id}.notes.example.com/notebook/${id}`;
  const copied: string[] = [];
  s = beginTermSession({ copy: (x) => { copied.push(x); } });
  t = await drawTest(<FocusRoot><LinkButton href={url}>Open Notes</LinkButton></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  await pressLink('Open Notes');
  expect(copied).toEqual([url]);
  expect(shown()).toEqual([{ title: 'Copied the address: open it in your browser', body: 'https://••••' }]);
  expect(JSON.stringify(shown())).not.toContain('notes.example.com');
  expect(JSON.stringify(shown())).not.toContain(id);
});

test('an /auth/ page opens on the web Hub when its origin is known, for a Link and a LinkButton', async () => {
  const opened: string[] = [];
  s = beginTermSession({ webOrigin: 'https://hub.example.com', openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><LinkButton href="/auth/token">Token page</LinkButton><Link href="/auth/login?x=1">Sign in</Link></FocusRoot>, { width: 40, height: 5 });
  await t.settle();
  await pressLink('Token page');
  await pressLink('Sign in');
  expect(opened).toEqual(['https://hub.example.com/auth/token', 'https://hub.example.com/auth/login?x=1']);
  expect(shown()).toEqual([]);
});

test('an /auth/ page with no known origin says it opens on the web, never a dead press', async () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  t = await drawTest(<FocusRoot><Link href="/auth/login">Sign in</Link></FocusRoot>, { width: 40, height: 4 });
  await t.settle();
  await pressLink('Sign in');
  expect(opened).toEqual([]);
  expect(shown()).toEqual([{ title: 'This page opens on the web, in a browser', body: undefined }]);
});

test('an id written percent-encoded never shows either (kit Link and LinkButton): the mask, one rule with ExtLink', async () => {
  const id = '0123456789abcdef01234567';
  const enc = id.replace(/^0/, '%30');
  const url = `https://${enc}.notes.example.com/n`;
  const copied: string[] = [];
  s = beginTermSession({ copy: (x) => { copied.push(x); } });
  t = await drawTest(<FocusRoot><Link href={url}>Open Notes</Link><LinkButton href={url}>Open it</LinkButton></FocusRoot>, { width: 40, height: 5 });
  await t.settle();
  await pressLink('Open Notes');
  expect(shown()).toEqual([{ title: 'Copied the address: open it in your browser', body: 'https://••••' }]);
  clear();
  await pressLink('Open it');
  expect(shown()).toEqual([{ title: 'Copied the address: open it in your browser', body: 'https://••••' }]);
  expect(copied).toEqual([url, url]);
});
