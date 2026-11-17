// Drafty-panel pieces: Track (one open step, the open step a region named by its heading,
// unknown never drawn as done, a closed row opens on Enter or a click and closes the other, flat shows every body, the
// narrow-width and foot-primary CSS contracts) and Verdict (label and count, one Mark, segments never the only signal).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Verdict, VerdictMark } from '../states/Verdict';
import galleryStrings from '../gallery/drafty.strings.en.json';
import { firstNowStep, Track, TrackStep } from './Track';

afterEach(() => vi.restoreAllMocks());

const here = dirname(fileURLToPath(import.meta.url));
const css = (file: string) => readFileSync(join(here, file), 'utf8');

function Setup({ open, onOpen }: { open?: string | null; onOpen?: (id: string) => void }) {
  return (
    <Track label="Get it working" {...(open !== undefined ? { open } : {})} {...(onOpen ? { onOpen } : {})}>
      <TrackStep id="connect" state="done" name="Connect Telegram" result="Connected" why="It reads the token." />
      <TrackStep
        id="privacy"
        state="now"
        tone="warn"
        name="Let it read groups"
        why="Telegram hides group messages."
        foot={{ say: 'Closes once privacy is off.', primary: <button type="button">Restart and check</button> }}
      >
        <p>Send /setprivacy</p>
      </TrackStep>
      <TrackStep id="home" state="later" optional name="Choose a home chat" why="Its updates go there." />
      <TrackStep id="reach" state="unknown" name="Members can reach it" />
      <TrackStep id="answer" state="wait" name="Answers in a group" />
    </Track>
  );
}

describe('Track', () => {
  it('is one ordered list named by its label, one item per step', () => {
    render(<Setup />);
    const list = screen.getByRole('list', { name: 'Get it working' });
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('opens exactly one step, the first in state now, as a region named by its heading', () => {
    render(<Setup />);
    expect(screen.getAllByRole('region')).toHaveLength(1);
    const open = screen.getByRole('region');
    expect(open).toHaveAccessibleName(/^Let it read groups/);
    expect(within(open).getByRole('heading', { level: 3 })).toHaveTextContent('Let it read groups');
    expect(within(open).getByText('Telegram hides group messages.')).toBeTruthy();
    expect(within(open).getByText('Send /setprivacy')).toBeTruthy();
    expect(within(open).getByRole('button', { name: 'Restart and check' })).toBeTruthy();
  });

  it('a done row is one line with its result; a later row shows its number and Optional', () => {
    render(<Setup />);
    const done = document.querySelector('[data-step="connect"]') as HTMLElement;
    expect(done.textContent).toContain('Connected');
    expect(done.querySelector('svg')).not.toBeNull();
    expect(within(done).queryByText('It reads the token.')).toBeNull();
    const later = document.querySelector('[data-step="home"]') as HTMLElement;
    expect(later.textContent).toContain('3');
    expect(later.textContent).toContain('Optional');
  });

  it('an unknown step is never drawn as done: no tick, no result, the words "Can\'t tell"', () => {
    render(
      <Track label="T">
        <TrackStep id="u" state="unknown" name="Privacy" result="Off" />
      </Track>,
    );
    const row = document.querySelector('[data-step="u"]') as HTMLElement;
    expect(row.querySelector('svg')).toBeNull();
    expect(row.textContent).not.toContain('Off');
    expect(row.textContent).toContain("Can't tell");
    expect(row.className).not.toMatch(/state_done/);
  });

  it('every row carries its state in words for a screen reader', () => {
    render(<Setup />);
    const words = (id: string) => (document.querySelector(`[data-step="${id}"]`) as HTMLElement).textContent;
    expect(words('connect')).toContain('Done');
    expect(words('privacy')).toContain('Needs you');
    expect(words('home')).toContain('To do');
    expect(words('answer')).toContain('Waiting');
  });

  it('a closed row with something to show is a native button (Enter and Space press it); a press opens it, closes the open one, and its heading takes focus', () => {
    render(<Setup />);
    const row = within(document.querySelector('[data-step="home"]') as HTMLElement).getByRole('button');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    act(() => row.focus());
    fireEvent.click(row);
    expect(screen.getAllByRole('region')).toHaveLength(1);
    const open = screen.getByRole('region');
    expect(open).toHaveAccessibleName(/^Choose a home chat/);
    expect(document.activeElement).toBe(within(open).getByRole('heading'));
  });

  it('a row with nothing to show is not a button (a wait row, an unknown row without body)', () => {
    render(<Setup />);
    expect(within(document.querySelector('[data-step="answer"]') as HTMLElement).queryByRole('button')).toBeNull();
    expect(within(document.querySelector('[data-step="reach"]') as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('controlled: the page owns the open step; a press only asks; null opens none', () => {
    const asked: string[] = [];
    function Page() {
      const [open, setOpen] = useState<string | null>('privacy');
      return <Setup open={open} onOpen={(id) => (asked.push(id), setOpen(id === 'home' ? null : id))} />;
    }
    render(<Page />);
    fireEvent.click(within(document.querySelector('[data-step="home"]') as HTMLElement).getByRole('button'));
    expect(asked).toEqual(['home']);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('a press the page declines leaves no focus request behind: a later programmatic open does not steal focus', () => {
    let setOpenFromPage: (id: string) => void = () => {};
    function Page() {
      const [open, setOpen] = useState<string | null>('privacy');
      setOpenFromPage = setOpen;
      return <Setup open={open} onOpen={() => {}} />;
    }
    render(<Page />);
    fireEvent.click(within(document.querySelector('[data-step="home"]') as HTMLElement).getByRole('button'));
    expect(screen.getByRole('region')).toHaveAccessibleName(/^Let it read groups/);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => outside.focus());
    act(() => setOpenFromPage('home'));
    expect(screen.getByRole('region')).toHaveAccessibleName(/^Choose a home chat/);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('firstNowStep: the first step that needs the person, else none', () => {
    expect(
      firstNowStep([
        { id: 'a', state: 'done' },
        { id: 'b', state: 'now' },
        { id: 'c', state: 'now' },
      ]),
    ).toBe('b');
    expect(
      firstNowStep([
        { id: 'a', state: 'done' },
        { id: 'u', state: 'unknown' },
      ]),
    ).toBeNull();
  });

  it('flat: every step shows its body with no row button; only the open step is a framed region', () => {
    render(
      <Track label="Connect a laptop" flat>
        <TrackStep id="what" state="done" name="What to connect" why="Pick the port.">
          <p>Port field</p>
        </TrackStep>
        <TrackStep id="run" state="now" name="Run it on the laptop" why="Paste the command." />
      </Track>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Port field')).toBeTruthy();
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByRole('region')).toHaveAccessibleName(/^Run it on the laptop/);
  });

  it("CSS: under 600 px of its own width the open step drops its node and its foot stacks; a mirrored foot primary hides the step's own", () => {
    const c = css('Track.module.css');
    expect(c).toMatch(/container-type:\s*inline-size/);
    const narrow = c.slice(c.indexOf('@container (width < 600px)'));
    expect(narrow).toMatch(/\.open > \.node\s*\{\s*display:\s*none/);
    expect(narrow).toMatch(/\.foot\s*\{\s*flex-direction:\s*column/);
    expect(narrow).toMatch(/min-height:\s*var\(--touch-min\)/);
    expect(narrow).toMatch(/\[data-foot-primary\] \.primary\s*\{\s*display:\s*none/);
    expect(c.slice(0, c.indexOf('@container (width < 600px)'))).not.toContain('data-foot-primary');
    // The track answers to its own width, never the window's: no media query, but for the forced-colours focus outline.
    expect(c).not.toMatch(/@media(?! \(forced-colors: active\))/);
    expect(c.match(/@media/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('Verdict', () => {
  it('is a group named by its label: the count, the sentence, the next line; segments are hidden from screen readers', () => {
    render(
      <Verdict label="Get it working" count="3 of 5" segments={['done', 'done', 'limited', 'todo', 'optional']} next="Next: turn privacy off.">
        It answers in private chats. In groups it sees <VerdictMark tone="warn">only commands</VerdictMark>.
      </Verdict>,
    );
    const g = screen.getByRole('group', { name: 'Get it working' });
    expect(within(g).getByText('3 of 5')).toBeTruthy();
    expect(within(g).getByText('Next: turn privacy off.')).toBeTruthy();
    expect(within(g).getByText('only commands').tagName).toBe('STRONG');
    const segs = g.querySelectorAll('[data-segment]');
    expect([...segs].map((x) => x.getAttribute('data-segment'))).toEqual(['done', 'done', 'limited', 'todo', 'optional']);
    expect(segs[0]?.parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('a calm verdict with no progress draws no segments and no count', () => {
    render(<Verdict label="What you get">A link to port 8080.</Verdict>);
    const g = screen.getByRole('group', { name: 'What you get' });
    expect(g.querySelector('[data-segment]')).toBeNull();
    expect(g.className).toMatch(/tone_calm/);
  });

  it('at most one Mark: a second one is a dev error naming the verdict, never its text', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Verdict label="Two marks">
        <VerdictMark tone="warn">secret-a</VerdictMark> and{' '}
        <span>
          <VerdictMark tone="danger">secret-b</VerdictMark>
        </span>
      </Verdict>,
    );
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toContain('Two marks');
    expect(String(err.mock.calls[0]?.[0])).not.toContain('secret');
  });

  it('a Mark rendered by a nested component counts too (the assert sees what is drawn)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Warn = () => <VerdictMark tone="warn">secret-a</VerdictMark>;
    const Bad = () => <VerdictMark tone="danger">secret-b</VerdictMark>;
    render(
      <Verdict label="Nested">
        <Warn /> and <Bad />
      </Verdict>,
    );
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toContain('Nested');
    expect(String(err.mock.calls[0]?.[0])).not.toContain('secret');
  });

  it('a second Mark mounted later by a child with its own state is caught when it mounts', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let more: () => void = () => {};
    function Later() {
      const [on, setOn] = useState(false);
      more = () => setOn(true);
      return on ? <VerdictMark tone="danger">secret-b</VerdictMark> : null;
    }
    render(
      <Verdict label="Later">
        <VerdictMark tone="warn">secret-a</VerdictMark> <Later />
      </Verdict>,
    );
    expect(err).not.toHaveBeenCalled();
    act(() => more());
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toContain('Later');
    expect(String(err.mock.calls[0]?.[0])).not.toContain('secret');
  });

  it('one Mark is fine, nested or not', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Warn = () => <VerdictMark tone="warn">only commands</VerdictMark>;
    render(
      <Verdict label="One">
        It sees <Warn />.
      </Verdict>,
    );
    expect(err).not.toHaveBeenCalled();
  });

  it("the gallery verdict's visible count names every segment state it draws (colour is never the only signal)", () => {
    const src = css('../gallery/drafty.tsx');
    const segs = /segments=\{\[([^\]]*)\]\}/.exec(src)?.[1] ?? '';
    const states = new Set([...segs.matchAll(/'(\w+)'/g)].map((m) => m[1]));
    const words: Record<string, string> = { done: 'done', limited: 'limited', blocking: 'blocked', optional: 'optional', todo: 'to do', unknown: "can't tell" };
    expect(states.size).toBeGreaterThan(1);
    for (const st of states) expect(galleryStrings['verdict.count'].toLowerCase()).toContain(words[st as string]);
  });

  it('CSS: unknown and optional segments are hatched, never the done fill', () => {
    const c = css('../states/Verdict.module.css');
    expect(c).toMatch(/\.seg_optional,\s*\.seg_unknown\s*\{[^}]*repeating-linear-gradient/);
    expect(c).not.toMatch(/\.seg_unknown[^{]*\{[^}]*--hx-frame/);
  });
});
