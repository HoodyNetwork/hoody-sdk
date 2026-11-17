// openOutside in a terminal: the host's browser when it has one; else the address is copied (when it can be) and shown
// whole in a toast, never silent; an address that is not a whole http(s) one is refused in words.
import { afterEach, expect, test } from 'bun:test';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { closeToast, toastQueue } from './Toast.store';
import { openOutside } from './openOutside';

let s: TermSession | null = null;
const closeAll = () => { for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); };
afterEach(() => { s?.end(); s = null; closeAll(); });
const shown = () => toastQueue().visibleToasts.map((x) => ({ title: x.content.title, body: x.content.body }));

test('a host with a browser opens it; nothing is shown', () => {
  const opened: string[] = [];
  s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
  expect(openOutside('https://docs.example.com/a')).toBe(true);
  expect(opened).toEqual(['https://docs.example.com/a']);
  expect(shown()).toEqual([]);
});

test('no browser: copied and shown whole; no clipboard either: shown whole', () => {
  const copied: string[] = [];
  s = beginTermSession({ copy: (x) => { copied.push(x); } });
  expect(openOutside('https://docs.example.com/a?b=1')).toBe(false);
  expect(copied).toEqual(['https://docs.example.com/a?b=1']);
  expect(shown()).toEqual([{ title: 'Copied the address: open it in your browser', body: 'https://docs.example.com/a?b=1' }]);
  s.end(); closeAll();
  s = beginTermSession({});
  openOutside('https://docs.example.com/a');
  expect(shown()).toEqual([{ title: 'Open this address in your browser', body: 'https://docs.example.com/a' }]);
});

test('a browser that refuses falls back the same way; a non-http address is refused in words', () => {
  s = beginTermSession({ openExternal: () => { throw new Error('no'); } });
  openOutside('https://docs.example.com/a');
  expect(shown()[0]?.title).toBe('Open this address in your browser');
  closeAll();
  openOutside('javascript:alert(1)');
  expect(shown()).toEqual([{ title: "That address can't be opened from here", body: undefined }]);
});
