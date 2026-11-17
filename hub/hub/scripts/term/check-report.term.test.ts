// check.ts never prints a bare FAIL: the contract gate's reasons, and any failing gate's summary line.
import { expect, test } from 'bun:test';
import { contractReport, failLine } from './check-report';

const TOTALS = 'types: 136 siblings, 0 failing\nbehaviour: 218 components, 3 open obligations, 0 any escapes (2 in debt, 0 of them escapes), 1 new, 0 fixed-but-listed';

test('a green run: the totals are the summary, not the timing line', () => {
  const r = contractReport(`ok   src/a.term.tsx\n${TOTALS}\n27.4 s\n`, 0);
  expect(r).toMatchObject({ ok: true, problems: [] });
  expect(r.summary).toContain('types: 136 siblings, 0 failing');
  expect(r.summary).toContain('behaviour: 218 components');
});

test('a new obligation: the component, its sibling and the obligation are the problem', () => {
  const out = `FAIL SegmentedControl (src/kit/controls/SegmentedControl.term.tsx)  scenario: none  read 5/6 props\n       prop variant is never read\n         read it, or ignore it with a reason\n${TOTALS}\n27.4 s\n`;
  const r = contractReport(out, 1);
  expect(r.ok).toBe(false);
  expect(r.problems).toHaveLength(1);
  expect(r.problems[0]!.file).toBe('src/kit/controls/SegmentedControl.term.tsx');
  expect(r.problems[0]!.message).toContain('prop variant is never read');
});

test('fixed-but-listed debt fails the gate and says how to clear it (the old filter dropped these lines)', () => {
  const r = contractReport(`FIXED (remove from contract.debt.json): src/kit/layouts/Layouts.term.tsx: any escape x -> bun scripts/term/contract.ts --update-debt\n${TOTALS}\n9.1 s\n`, 1);
  expect(r.problems[0]).toMatchObject({ file: 'src/kit/layouts/Layouts.term.tsx', fix: 'bun scripts/term/contract.ts --update-debt' });
});

test('a crash with no recognised line still names the exit code and the last output', () => {
  const r = contractReport('error: out of memory\n', 134);
  expect(r.problems[0]!.message).toBe('exit 134, no failing line recognised: error: out of memory');
  expect(contractReport('', 1).problems[0]!.message).toContain('(no output)');
});

test('failLine: a failing summary carries its first problems, never stands bare', () => {
  const r = contractReport(`FAIL src/a.term.tsx\n       exports X, which src/a.tsx does not\n${TOTALS}\n1 s\n`, 1);
  const line = failLine(r.summary, r.problems);
  expect(line).toContain('1 problem: src/a.term.tsx: FAIL src/a.term.tsx | exports X');
  expect(failLine('27.4 s', [])).toBe('27.4 s | no problem recorded');
  const many = Array.from({ length: 5 }, (_v, i) => ({ file: `f${i}`, rule: 'r', message: 'm', fix: '' }));
  expect(failLine('', many)).toBe('5 problems: f0: m; f1: m; f2: m (+2 more)');
});
