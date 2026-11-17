// The lock view's sentences (lock-text.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | An unusable store: the text names the directory when known, says why in plain words, and how to repair by hand | 'an unusable store' |
// | 2 | The forget that could not finish (`forget-failed`): the text says the passcode will not open it and names the move-aside repair | 'forget failed' |
// | 3 | A reason this module does not know, or a path that is not printable text, is never echoed | 'nothing unknown is echoed' |
// | 4 | One sentence per refused unlock try | 'refused unlock' |
// | 5 | Both repairs say that agent keys this terminal made stay valid until they expire, and where to remove them | 'an unusable store', 'forget failed' |
// | 6 | No sentence is written in the module: each is a `lock.*` entry of the terminal's strings file, and each entry is used | 'the sentences are in the strings file' |
import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import strings from '../shell/strings.en.json';
import { lockNoticeText, unlockRefusalText } from './lock-text';

const DIR = '/home/ada/.hoody/hub/0123456789abcdef0123456789abcdef';

test('an unusable store', () => {
  expect(lockNoticeText(null)).toBeNull();
  const seen = new Set<string>();
  for (const reason of ['unknown', 'failed', 'TERM_STORE_UNSAFE', 'TERM_STORE_CORRUPT', 'TERM_STORE_FAILED']) {
    const t = lockNoticeText({ path: DIR, reason })!;
    expect(t.where).toBe(DIR);
    expect(t.passcodeUseless).toBe(false);
    expect(t.problem).toMatch(/^The Hub is locked because its saved data cannot be used\. \S/);
    expect(t.repair).toContain('repair that directory or move it aside');
    expect(t.repair).toContain('start the Hub again');
    expect(t.repair).toContain('cannot work');
    expect(t.repair).toMatch(/keys this terminal made for agents .* stay valid until they expire; you can remove them in the web Hub\.$/);
    expect(t.problem + t.repair).not.toMatch(/TERM_|undefined|null/);
    seen.add(t.problem);
  }
  // Unsafe, corrupt and failed each say their own reason.
  expect(seen.size).toBe(4);
  // No path known: the repair still says which directory, in words.
  const t = lockNoticeText({ path: null, reason: 'TERM_STORE_CORRUPT' })!;
  expect(t.where).toBeNull();
  expect(t.repair).toContain('data directory for this account');
});

test('forget failed', () => {
  const t = lockNoticeText({ path: DIR, reason: 'forget-failed' })!;
  expect(t.passcodeUseless).toBe(true);
  expect(t.where).toBe(DIR);
  expect(t.problem).toContain('Too many wrong passcodes');
  expect(t.problem).toContain('could not be removed');
  expect(t.repair).toContain('The passcode will not open it');
  expect(t.repair).toContain('move that directory aside');
  expect(t.repair).toContain('start the Hub again');
  // It does not promise what the forget would have done, and does not call the open changes cancelled.
  expect(t.repair).toContain('check those in the web Hub');
  expect(t.repair).toMatch(/keys this terminal made for agents .* stay valid until they expire; you can remove them in the web Hub\.$/);
  expect(t.problem + t.repair).not.toMatch(/\{\{|\}\}/);
  expect(t.problem + t.repair).not.toMatch(/cancel/i);
  // The two kinds read differently.
  expect(t.problem).not.toBe(lockNoticeText({ path: DIR, reason: 'failed' })!.problem);
  expect(t.repair).not.toBe(lockNoticeText({ path: DIR, reason: 'failed' })!.repair);
});

test('nothing unknown is echoed', () => {
  const canary = 'hdy_LOCKcanary0123456789';
  const t = lockNoticeText({ path: `/tmp/x\u001b[2J${canary}`, reason: `EACCES ${canary}` })!;
  expect(t.where).toBeNull();
  expect(JSON.stringify(t)).not.toContain(canary);
  expect(t.problem).toContain('It could not be opened.');
  expect(lockNoticeText({ path: 'x'.repeat(401), reason: 'toString' })!.where).toBeNull();
  expect(lockNoticeText({ path: DIR, reason: 'toString' })!.problem).toContain('It could not be opened.');
  expect(lockNoticeText({ path: DIR, reason: '__proto__' })!.problem).toContain('It could not be opened.');
});

test('refused unlock', () => {
  const texts = (['other-hub', 'read-only-choice', 'no-store'] as const).map(unlockRefusalText);
  expect(new Set(texts).size).toBe(3);
  expect(texts[0]).toContain('Unlock in the Hub that is already open');
  expect(texts[1]).toContain('read-only');
  expect(texts[2]).toContain('cannot be checked');
  for (const t of texts) { expect(t).toMatch(/^[A-Z].*\.$/); expect(t.split('. ').length).toBeLessThanOrEqual(2); }
  expect(unlockRefusalText('toString' as never)).toBe(texts[2]!);
});

test('the sentences are in the strings file', () => {
  const src = readFileSync(new URL('./lock-text.ts', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[^]*?\*\//g, '');
  // Every quoted piece of the module is a key, a reason, a placeholder name or a type word: never a sentence.
  for (const m of src.matchAll(/'([^'\n]*)'|`([^`]*)`/g)) {
    const lit = m[1] ?? m[2] ?? '';
    expect(lit.replace(/\$\{[^}]*\}/g, '').trim().split(/\s+/).filter(Boolean).length, lit).toBeLessThanOrEqual(1);
  }
  const keys = Object.keys(strings).filter((k) => k.startsWith('lock.'));
  expect(keys.length).toBe(15);
  for (const k of keys) expect(src, k).toContain(`'${k}'`);
  // What is drawn is the file's text.
  expect(unlockRefusalText('other-hub')).toBe(strings['lock.refused.otherHub']);
  expect(lockNoticeText({ path: null, reason: 'failed' })!.problem).toBe(strings['lock.store.problem'].replace('{{why}}', strings['lock.store.why.failed']));
});
