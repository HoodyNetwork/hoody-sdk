// core save() in a terminal: it refuses NO_FILES and reads no browser global. A download link needs
// URL.createObjectURL and document.createElement, and a `document` read under the strict globals ends a live mount
// (term/app/lifecycle.ts) even when the caller catches the throw, so save() must refuse before either.
import { afterEach, expect, test } from 'bun:test';
import { hostEnv } from './host-env';
import { save } from './kit-io';
import { trapJournalMark, unexpectedTrapsSince } from '../term/env/strict-globals';

const realCreate = URL.createObjectURL;
afterEach(() => { URL.createObjectURL = realCreate; });

test('the terminal host is not a web page (the precondition of the refusal)', () => {
  expect(hostEnv().browserPage).toBe(false);
  expect(hostEnv().files).toBeNull();
});

test('save refuses NO_FILES, builds no object URL and records no strict-global trap', () => {
  let urls = 0;
  URL.createObjectURL = (b: Blob) => { urls++; return realCreate(b); };
  const mark = trapJournalMark();
  let out: unknown;
  let thrown: unknown = null;
  try { out = save('weekly plan.md', [new Blob(['# hi']), 'more'], { maxBytes: 1024 }); } catch (e) { thrown = e; }
  expect(thrown).toBeNull();
  expect(out).toEqual({ refused: 'NO_FILES' });
  expect(urls).toBe(0);
  expect(unexpectedTrapsSince(mark)).toEqual([]);
});

test('the refusal comes first: a bad size or an oversize save is refused the same way, still touching nothing', () => {
  const mark = trapJournalMark();
  expect(save('a', ['abcdef'], { maxBytes: 2 })).toEqual({ refused: 'NO_FILES' });
  expect(save('a', ['x'], {})).toEqual({ refused: 'NO_FILES' });
  expect(unexpectedTrapsSince(mark)).toEqual([]);
});
