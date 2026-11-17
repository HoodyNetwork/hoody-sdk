// Vitest: Home's quick ask hands the dock a START (a new conversation with this text,
// sent), never a prefill of the conversation open before. One press, one start. The box keeps the text until the
// agent took it; not sent or maybe sent (C9), it keeps it and says so.
import { act, render, renderHook, screen, userEvent } from '@app/testing';
import { setAskForFixtures, useAskDock, type AskStartOutcome } from '@kit/ask';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetActionHolds } from './data';
import { AskStrip } from './parts/AskStrip';
import strings from './strings.en.json';

const dock = () => renderHook(() => useAskDock()).result.current;
const box = () => screen.getByRole('textbox', { name: /atlas/ });
const askBtn = () => screen.getByRole('button', { name: strings['ask.submit'] });

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
  { const d = dock(); act(() => d.close()); }
});
afterEach(() => {
  { const d = dock(); act(() => d.close()); }
  setAskForFixtures(false);
});

// Takes the start the dock was handed, as the panel does, and closes the dock again so the box shows.
function takeStart(): { text: string; tell: (o: AskStartOutcome) => void } {
  const d = dock();
  let got: ReturnType<typeof d.takeDraft>;
  act(() => { got = d.takeDraft(); });
  expect(got!).toBeDefined();
  expect(got!.start).toBe(true);
  return { text: got!.text, tell: (o) => act(() => got!.onStart?.(o)) };
}
function closeDock() { const d = dock(); act(() => d.close()); }

describe('Home quick ask', () => {
  it('pressing Ask hands the dock a start with the typed text, not a prefill', async () => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().type(box(), 'What is running?');
    await userEvent.setup().click(askBtn());
    expect(dock().isOpen).toBe(true);
    expect(takeStart().text).toBe('What is running?');
  });

  it('a double press starts once', async () => {
    render(<AskStrip name="atlas" />);
    const u = userEvent.setup();
    await u.type(box(), 'Back up my files');
    const btn = askBtn();
    await u.dblClick(btn);
    const first = takeStart();
    expect(first.text).toBe('Back up my files');
    let second: unknown;
    const d = dock();
    act(() => { second = d.takeDraft(); });
    expect(second).toBeUndefined();
  });

  it('sent: the box empties', async () => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().type(box(), 'Hello');
    await userEvent.setup().click(askBtn());
    const st = takeStart();
    st.tell('sent');
    closeDock();
    expect(box()).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('not sent: the text stays and the box says so; a new press starts again', async () => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().type(box(), 'Hello');
    await userEvent.setup().click(askBtn());
    takeStart().tell('notSent');
    closeDock();
    expect(box()).toHaveValue('Hello');
    expect(screen.getByRole('status')).toHaveTextContent(strings['ask.startNotSent']);
    await userEvent.setup().click(askBtn());
    expect(takeStart().text).toBe('Hello');
  });

  it('maybe sent: the text stays, and the box says it may have gone through (never "not sent")', async () => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().type(box(), 'Hello');
    await userEvent.setup().click(askBtn());
    takeStart().tell('unknown');
    closeDock();
    expect(box()).toHaveValue('Hello');
    expect(screen.getByRole('status')).toHaveTextContent(strings['ask.startUnknown']);
  });

  it('closed before the panel took it (no computer, still loading): not sent, the text stays', async () => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().type(box(), 'Hello');
    await userEvent.setup().click(askBtn());
    closeDock();
    expect(box()).toHaveValue('Hello');
    expect(screen.getByRole('status')).toHaveTextContent(strings['ask.startNotSent']);
  });

  it('the status line is there, empty, before the outcome comes, and the outcome fills that same line', async () => {
    render(<AskStrip name="atlas" />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    await userEvent.setup().type(box(), 'Hello');
    await userEvent.setup().click(askBtn());
    // The dock is open now (the card shows its one line); the outcome arrives while it is.
    const st = screen.getByRole('status');
    expect(st).toHaveTextContent('');
    takeStart().tell('notSent');
    expect(screen.getByRole('status')).toBe(st);
    expect(st).toHaveTextContent(strings['ask.startNotSent']);
  });

  it('the same status line stays across the dock closing: closed before the panel took it, "not sent" fills it', async () => {
    render(<AskStrip name="atlas" />);
    const st = screen.getByRole('status');
    await userEvent.setup().type(box(), 'Hello');
    await userEvent.setup().click(askBtn());
    expect(screen.getByRole('status')).toBe(st);
    closeDock();
    expect(screen.getByRole('status')).toBe(st);
    expect(st).toHaveTextContent(strings['ask.startNotSent']);
  });

  it('a second, different start while one is held is told "not sent"; the held one goes', () => {
    const d = dock();
    const a: AskStartOutcome[] = [], b: AskStartOutcome[] = [];
    act(() => d.open({ text: 'A', start: true, onStart: (o) => a.push(o) }));
    const d2 = dock();
    act(() => d2.open({ text: 'B', start: true, onStart: (o) => b.push(o) }));
    expect(b).toEqual(['notSent']);
    let got: ReturnType<typeof d.takeDraft>;
    const d3 = dock();
    act(() => { got = d3.takeDraft(); });
    expect(got!.text).toBe('A');
    expect(a).toEqual([]);
  });

  it('an empty box only opens the dock on the conversation already there', async () => {
    render(<AskStrip name="atlas" />);
    await userEvent.setup().click(askBtn());
    expect(dock().isOpen).toBe(true);
    let got: unknown;
    const d = dock();
    act(() => { got = d.takeDraft(); });
    expect(got).toBeUndefined();
  });
});
