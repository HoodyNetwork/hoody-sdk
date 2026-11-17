import { bootFixtureCore } from '@core/fixture-boot';
import { memoryVault } from '@core/crypt/memory-vault';
import { cryptIdleForTests, resetCryptForTests } from '@core/cryptStore';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { installTestLocks } from '../core/test/locks';
import { checkNesting } from './nesting';
import { timeoutSkip, type SkipTask } from './timeoutSkip';

// bootFixtureCore comes from its own module, not the '@core' barrel: the barrel evaluates all of core before a test
// file's own imports, in every file (0.2-0.7 s per file under load). A file that needs more of core
// imports it itself.
// Testing Library and jest-dom's matchers load only where there is a DOM (the happy-dom default). A file that runs in
// the node environment (the node projects of vite.config.mts, or `// @vitest-environment node`) has no document to
// render into or match against, and skipping them saves @testing-library/dom (aria-query, pretty-format) per file. A
// node file that imports them itself still can.
const rtl = typeof document === 'undefined' ? null : await import('@testing-library/react');
if (rtl) await import('@testing-library/jest-dom/vitest');
// React Aria's live announcer (a pending Button, a selection) keeps one log region on document.body for the file's life,
// and its first message waits 100 ms on a timer when it is made inside a Testing Library async step (findBy*, waitFor
// and userEvent turn IS_REACT_ACT_ENVIRONMENT off). cleanup() leaves both, so it is ended after every test: the region
// goes, and a message still waiting writes nothing, in the next test or after the file's DOM is gone.
const announcer = rtl ? await import('react-aria/private/live-announcer/LiveAnnouncer') : null;

// After a vitest timeout the rest of that file is skipped, and the first timeout is the real red (app/timeoutSkip.ts).
const skipAfterTimeout = timeoutSkip();
const fileOf = (t: { file: { filepath: string } }) => ({ path: t.file.filepath, file: t.file as unknown as SkipTask });

// Every test starts on a fresh fixtureWorld (Ada signed in, realm Personal, computer atlas), so
// @core hooks such as useAccountPref work without shared.js. renderPage boots again with the
// page's own rules. Core's own tests set up core themselves (core/test/env.ts) and expect it
// untouched, so they are left out of that boot; every test, core's included, gets the serialized
// navigator.locks stand-in first (core/test/locks.ts).
beforeEach(async (ctx) => {
  const { path, file } = fileOf(ctx.task);
  skipAfterTimeout.testStart(path, file, ctx.task as unknown as SkipTask);
  installTestLocks(); // every https browser has navigator.locks; core's change store refuses writes without it
  const testPath = (expect.getState().testPath ?? '').replace(/\\/g, '/');
  if (testPath.includes('/src/core/')) return;
  resetCryptForTests(memoryVault()); // happy-dom has no IndexedDB
  bootFixtureCore();
  // The keys fake server keeps its list and counters for the module's life (a create adds a key, a delete takes one
  // away): each keys test starts from the fixed rows, as each terminal session does. Loaded only there, and only where
  // there is a DOM: app/fixtures never settles in the node environment, so a node-run keys file would hang every test.
  if (rtl && testPath.includes('/src/pages/keys/')) await (await import('./fixtures')).resetFixtureServers(['keys']);
});

// A test's background preference writes (encrypted, async) finish inside it: none lands in the next test's fresh
// storage under a vault that no longer opens it.
afterEach(async (ctx) => {
  const { path, file } = fileOf(ctx.task);
  skipAfterTimeout.attemptDone(path, file, ctx.task as unknown as SkipTask);
  // Before cleanup, while the test's DOM is still there: no link or text button inside an interactive control (app/nesting.ts).
  // A finding fails the test; the cleanup still runs, so the next test starts clean.
  try {
    if (rtl) checkNesting(document.body);
  } finally {
    rtl?.cleanup();
    endAnnouncer();
    await cryptIdleForTests();
  }
});

function endAnnouncer(): void {
  try {
    announcer?.destroyAnnouncer();
  } catch {
    // The test emptied document.body itself and took the region with it: nothing is left to remove, and a message still
    // waiting on a region that is not on the page writes nothing.
  }
}

// A file whose tests were skipped after a timeout ends red even if a retry or a repeat passed that timeout.
afterAll(() => {
  skipAfterTimeout.fileDone();
});

// findBy*/waitFor wait 5 s, not the library's 1 s: on a busy machine a page's first
// render can take longer than 1 s, and that is load, not a failure.
rtl?.configure({ asyncUtilTimeout: 5000 });
