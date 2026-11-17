// The trap journal and the test teardown (strict-globals.ts): a strict-global trap a test did
// not declare fails that test even when the code that read the global swallowed the throw.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The term test preload registered the teardown | 'preload enforces' |
// | 2 | A swallowed, undeclared trap: the REAL teardown (the preload's afterEach) gives TERM_TRAP_UNDECLARED naming it and the reading line (probe mode keeps the verdict instead of failing this test) | 'swallowed trap: teardown verdict' + 'verdict was a failure' |
// | 3 | The same trap declared with expectTraps: no verdict | 'declared trap: teardown passes' + 'verdict was clean' |
// | 4 | clear() on the instance does not hide a trap from the journal | 'clear does not hide' |
// | 5 | A window lookup by an arbitrary key (a canary) keeps no trace of it: the thrown error, the ledger row (name and stack) and the teardown verdict say `window.*`; after teardown the journal holds nothing | 'canary lookup' + 'canary verdict and drain' |
// | 6 | The journal is bounded: past JOURNAL_MAX the traps are counted, and the verdict still fails ('journal-full'); drained after | 'journal bound' + 'bound verdict' |
import { expect, test } from 'bun:test';
import { activeStrictGlobals, expectTraps, JOURNAL_MAX, probeTrapVerdict, trapJournalMark, trapJournalSize, trapTeardownRegistered, undeclaredTrapError, verdictOfProbe } from './strict-globals';

const swallow = (): void => { try { void (globalThis as { document?: unknown }).document; } catch { /* swallowed */ } };

test('preload enforces', () => {
  expect(activeStrictGlobals()).not.toBeNull();
  expect(trapTeardownRegistered).toBe(true);
});

test('swallowed trap: teardown verdict', () => {
  probeTrapVerdict();
  swallow();
});

test('verdict was a failure', () => {
  const v = verdictOfProbe();
  expect(v).toBeInstanceOf(Error);
  expect(v!.message).toContain('TERM_TRAP_UNDECLARED: 1 strict-global trap');
  expect(v!.message).toContain('document');
  expect(v!.message).toContain('trap-journal.term.test.ts');
});

test('declared trap: teardown passes', () => {
  probeTrapVerdict();
  expectTraps('document');
  swallow();
});

test('verdict was clean', () => {
  expect(verdictOfProbe()).toBeNull();
});

test('clear does not hide', () => {
  const mark = trapJournalMark();
  swallow();
  activeStrictGlobals()!.clear();
  expect(undeclaredTrapError(mark)?.message).toContain('document');
  expectTraps('document');
  expect(undeclaredTrapError(mark)).toBeNull();
});

const CANARY = 'TOKEN_CANARY_ABC123';

test('canary lookup', () => {
  probeTrapVerdict();
  const before = activeStrictGlobals()!.ledger().length;
  let thrown = '';
  try { void (globalThis as unknown as { window: Record<string, unknown> }).window[CANARY]; } catch (e) { thrown = String((e as Error).message) + (e as Error).stack; }
  expect(thrown).not.toContain(CANARY);
  expect(thrown).toContain('window.*');
  const rows = activeStrictGlobals()!.ledger().slice(before);
  expect(rows.map((r) => r.name)).toEqual(['window.*']);
  expect(JSON.stringify(rows)).not.toContain(CANARY);
});

test('canary verdict and drain', () => {
  const v = verdictOfProbe();
  expect(v!.message).toContain('window.*');
  expect(v!.message).not.toContain(CANARY);
  expect(trapJournalSize()).toBe(0);
});

test('journal bound', () => {
  probeTrapVerdict();
  for (let i = 0; i < JOURNAL_MAX + 5; i++) swallow();
  expect(trapJournalSize()).toBe(JOURNAL_MAX);
});

test('bound verdict', () => {
  const v = verdictOfProbe();
  expect(v!.message).toContain(`TERM_TRAP_UNDECLARED: ${JOURNAL_MAX + 1} strict-global trap`);
  expect(trapJournalSize()).toBe(0);
  activeStrictGlobals()!.clear();
});
