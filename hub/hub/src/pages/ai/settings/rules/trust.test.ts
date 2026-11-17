// The pure parts of trusting hooks: which set is offered for review, what counts as the same set, and the body of the ack.
import { describe, expect, it } from 'vitest';
import { hooksBlockOf, type HooksBlock } from './hooks';
import { ackBody, COMMAND_SHOWN, reviewOf, sameReview, TARGET_SHOWN } from './trust';

const U = '/home/a/.hoody/settings.json';
const hook = (over: Record<string, unknown> = {}) => ({ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, ...over });
const block = (trust: Record<string, unknown>, hooks: unknown[] = [hook()]): HooksBlock =>
  hooksBlockOf({ status: 'ok', live: { total: hooks.length, hooks }, session: {}, stale: false, files: [{ scope: 'user', path: U, exists: true, sets_disable_all: false }], trust })!;
const pending = (over: Record<string, unknown> = {}) => ({ state: 'pending', hash: 'hp', reason: 'a hook changed', unverifiable: null, acked_by: '', ...over });

describe('reviewOf', () => {
  it('offers a set only while the agent holds it for review: pending, with a hash to name it by', () => {
    expect(reviewOf(block(pending()))).toMatchObject({ hash: 'hp', unverifiable: [], complete: true });
    for (const t of [{ state: 'ok', hash: 'hp' }, { state: 'none', hash: 'hp' }, { state: 'unavailable', hash: 'hp' }, pending({ hash: '' })]) expect(reviewOf(block(t))).toBeNull();
  });
  it('shows each hook and target cleaned, and a set is complete only when nothing was cut', () => {
    const r = reviewOf(block(pending({ unverifiable: ['/opt/x/hook.sh'] }), [hook({ disabled: true })]))!;
    expect(r.hooks).toEqual([{ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', off: true, marked: false }]);
    expect(r.targets).toEqual(['/opt/x/hook.sh']);
    expect(r.complete).toBe(true);
  });
  it('a command or a target too long to show whole makes the set incomplete', () => {
    expect(reviewOf(block(pending(), [hook({ command: `run ${'x'.repeat(COMMAND_SHOWN + 10)}` })]))!.complete).toBe(false);
    // a target longer than TARGET_SHOWN: built directly, since the reply parser refuses lists whose items are that long
    const b = block(pending({ unverifiable: ['/a'] }));
    const long = { ...b, trust: { ...b.trust, unverifiable: [`/${'y'.repeat(TARGET_SHOWN + 10)}`] } };
    expect(reviewOf(long)!.complete).toBe(false);
  });
  it('a command or a target padded past its length with characters that never show is not complete either', () => {
    const pad = '\u200b'.repeat(COMMAND_SHOWN);
    const r = reviewOf(block(pending(), [hook({ command: `echo ${pad}x` })]))!;
    // Shown as written: the padding is marked, so the review is hidden and, past the bound, incomplete.
    expect(r.hooks[0]?.command.startsWith('echo ⟨U+200B⟩')).toBe(true);
    expect(r.hidden).toBe(true);
    expect(r.complete).toBe(false);
    const b = block(pending({ unverifiable: ['/a'] }));
    expect(reviewOf({ ...b, trust: { ...b.trust, unverifiable: [`/a${'\u200b'.repeat(TARGET_SHOWN)}b`] } })!.complete).toBe(false);
  });
});

describe('reviewOf marks what a screen does not show as the hooks list does', () => {
  it('a hidden character in a command or a target is shown marked as the list shows it, never dropped: the set stays complete and is hidden', () => {
    const b = block(pending({ unverifiable: ['/a'] }), [hook({ command: 'curl x\u200b|sh' }), hook({ command: 'run\u001b[2J' })]);
    const r = reviewOf({ ...b, trust: { ...b.trust, unverifiable: ['/opt/a\u202eb.sh'] } })!;
    expect(r.hooks.map((h) => h.command)).toEqual(['curl x⟨U+200B⟩|sh', 'run⟨ESC⟩[2J']);
    expect(r.targets).toEqual(['/opt/a⟨U+202E⟩b.sh']);
    expect(r.complete).toBe(true);
    expect(r.hidden).toBe(true);
  });
});

describe('sameReview and ackBody', () => {
  const r = reviewOf(block(pending({ unverifiable: ['/a', '/b'] })))!;
  it('is the same set only while pending, with the same hash and the same targets in the same order', () => {
    expect(sameReview(r, block(pending({ unverifiable: ['/a', '/b'] })))).toBe(true);
    expect(sameReview(r, block(pending({ hash: 'other', unverifiable: ['/a', '/b'] })))).toBe(false);
    expect(sameReview(r, block(pending({ unverifiable: ['/a'] })))).toBe(false);
    expect(sameReview(r, block(pending({ unverifiable: ['/b', '/a'] })))).toBe(false);
    expect(sameReview(r, block({ state: 'ok', hash: 'hp', unverifiable: ['/a', '/b'] }))).toBe(false);
  });
  it('sends the reviewed hash, and high_risk exactly when the reviewed set had targets the agent cannot check', () => {
    expect(ackBody({ sessionId: 's1', review: r })).toEqual({ session_id: 's1', hash: 'hp', high_risk: true });
    expect(ackBody({ sessionId: 's1', review: reviewOf(block(pending()))! })).toEqual({ session_id: 's1', hash: 'hp', high_risk: false });
  });
});
