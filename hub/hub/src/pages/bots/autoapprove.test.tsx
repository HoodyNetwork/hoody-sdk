// A new Bot starts with Auto-approve On, and its state is always on the page as a pill that is also the
// switch. Off is one press; On again names the effect first. It is the Settings save (same route, same fence), shown as On
// only when the Bot says so, with the helpers it has not reached counted, and an unknown outcome is never drawn as either.
import { fireEvent, render, screen, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { yoloUnappliedOf, type BotView, type Change, type SavedSettings, type SettingsPatch } from './data';
import { AutoApprove, AutoApproveNote, autoStateOf } from './parts/AutoApprove';
import strings from './strings.en.json';

type Sent = { patch: SettingsPatch; uid?: string; revision?: number };
const bot = (extra: Partial<BotView> = {}): BotView => ({ key: 'c1~global~chief', uid: 'u-1', name: 'Chief', yolo: true, yoloUnapplied: { pending: 0, refused: 0 }, guardrailRevision: 6, ...extra }) as BotView;
function change(o: { outcome?: string; running?: boolean; code?: string } = {}) {
  const run = vi.fn(async (_v: Sent) => ({ outcome: 'done' as const }));
  const readBack = vi.fn(async () => true);
  const dismiss = vi.fn();
  const c = { run, outcome: o.outcome ?? 'idle', running: o.running ?? false, code: o.code, data: undefined, details: undefined, idem: undefined, readBack, dismiss, reset: () => undefined } as unknown as Change<SavedSettings, Sent>;
  return { c, run, readBack, dismiss };
}
const pill = (name: RegExp) => screen.getByRole('button', { name });

describe('the Auto-approve pill', () => {
  it('is always there: "on" when the Bot is on, "off" when it is off', () => {
    const on = render(<AutoApprove bot={bot({ yolo: true })} save={change().c} />);
    expect(pill(/Allow everything is on/)).toHaveAttribute('aria-pressed', 'true');
    on.unmount();
    render(<AutoApprove bot={bot({ yolo: false })} save={change().c} />);
    expect(pill(/Allow everything is off/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('On to Off is one press: the Settings save with yolo false, the Bot\'s uid and revision, no dialog', () => {
    const { c, run } = change();
    render(<AutoApprove bot={bot({ yolo: true })} save={c} />);
    fireEvent.click(pill(/Allow everything is on/));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(run).toHaveBeenCalledExactlyOnceWith({ patch: { yolo: false }, uid: 'u-1', revision: 6 });
  });

  it('Off to On names the effect first: nothing is sent until Turn on; Cancel sends nothing', () => {
    const { c, run } = change();
    render(<AutoApprove bot={bot({ yolo: false })} save={c} />);
    fireEvent.click(pill(/Allow everything is off/));
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['autoapprove.confirmTitle'])).toBeTruthy();
    expect(within(d).getByText(strings['autoapprove.confirmBody'])).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(pill(/Allow everything is off/));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['autoapprove.confirmGo'] }));
    expect(run).toHaveBeenCalledExactlyOnceWith({ patch: { yolo: true }, uid: 'u-1', revision: 6 });
  });

  it('counts the helpers the change has not reached, and the ones whose approval policy refuses it', () => {
    const a = render(<AutoApprove bot={bot({ yolo: true, yoloUnapplied: { pending: 2, refused: 0 } })} save={change().c} />);
    expect(pill(/Allow everything is mixed: on for the Bot, not confirmed for 2 helpers/)).toBeTruthy();
    a.unmount();
    const b = render(<AutoApprove bot={bot({ yolo: true, yoloUnapplied: { pending: 0, refused: 1 } })} save={change().c} />);
    expect(pill(/Allow everything is mixed: on for the Bot, but 1 helper's approval policy does not allow it/)).toBeTruthy();
    b.unmount();
    render(<AutoApprove bot={bot({ yolo: true, yoloUnapplied: { pending: 0, refused: 0 } })} save={change().c} />);
    expect(pill(/^Allow everything is on$/)).toBeTruthy();
  });

  it('waits while a change runs, and an unknown outcome is neither On nor Off: it checks, never sends again', () => {
    const r = render(<AutoApprove bot={bot()} save={change({ running: true }).c} />);
    expect(pill(/Allow everything/)).toBeDisabled();
    r.unmount();
    const { c, run, readBack } = change({ outcome: 'pending' });
    render(<AutoApprove bot={bot({ yolo: false })} save={c} />);
    fireEvent.click(pill(/Allow everything may have changed/));
    expect(readBack).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the pill never says Off or On that the helpers have not confirmed', () => {
  it('Off for the Bot with helpers that have not confirmed is Mixed, not Off', () => {
    render(<AutoApprove bot={bot({ yolo: false, yoloUnapplied: { pending: 2, refused: 0 } })} save={change().c} />);
    expect(pill(/Allow everything is mixed: off for the Bot, but 2 helpers have not confirmed it and may still approve alone/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Allow everything is off$/ })).toBeNull();
  });
  it('pending and refused helpers are counted together', () => {
    render(<AutoApprove bot={bot({ yolo: true, yoloUnapplied: { pending: 2, refused: 1 } })} save={change().c} />);
    expect(pill(/not confirmed for 3 helpers/)).toBeTruthy();
  });
  it('a read that does not carry the helpers is Unknown, never On or Off', () => {
    const a = render(<AutoApprove bot={bot({ yolo: false, yoloUnapplied: undefined })} save={change().c} />);
    expect(pill(/Allow everything is unknown/)).toBeTruthy();
    a.unmount();
    render(<AutoApprove bot={bot({ yolo: true, yoloUnapplied: undefined })} save={change().c} />);
    expect(pill(/Allow everything is unknown/)).toBeTruthy();
  });
  it('autoStateOf: only an empty helper list confirms On or Off', () => {
    expect(autoStateOf({ yolo: true, yoloUnapplied: { pending: 0, refused: 0 } })).toBe('on');
    expect(autoStateOf({ yolo: false, yoloUnapplied: { pending: 0, refused: 0 } })).toBe('off');
    expect(autoStateOf({ yolo: false, yoloUnapplied: { pending: 0, refused: 1 } })).toBe('mixed-off');
    expect(autoStateOf({ yolo: true, yoloUnapplied: { pending: 1, refused: 1 } })).toBe('mixed-on');
    expect(autoStateOf({ yolo: true, yoloUnapplied: { pending: 0, refused: 1 } })).toBe('refused');
    expect(autoStateOf({ yolo: false })).toBe('unknown');
  });
});

describe('an open confirmation keeps the Bot and revision it was asked for', () => {
  it('a refresh with a newer revision does not move the fence: the press is sent with the revision it was opened at', () => {
    const { c, run } = change();
    const r = render(<AutoApprove bot={bot({ yolo: false })} save={c} />);
    fireEvent.click(pill(/Allow everything is off/));
    r.rerender(<AutoApprove bot={bot({ yolo: false, guardrailRevision: 7 })} save={c} />);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['autoapprove.confirmGo'] }));
    expect(run).toHaveBeenCalledExactlyOnceWith({ patch: { yolo: true }, uid: 'u-1', revision: 6 });
  });
  it('another Bot under an open dialog closes it: nothing is sent for the replacement', () => {
    const { c, run } = change();
    const r = render(<AutoApprove bot={bot({ yolo: false })} save={c} />);
    fireEvent.click(pill(/Allow everything is off/));
    r.rerender(<AutoApprove bot={bot({ yolo: false, uid: 'u-2', guardrailRevision: 1 })} save={c} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('the Auto-approve note', () => {
  it('says a refused change was not made, and a lost answer may have gone through, with Check again', () => {
    const f = render(<AutoApproveNote save={change({ outcome: 'failed' }).c} />);
    expect(screen.getByText(strings['autoapprove.failed'])).toBeTruthy();
    f.unmount();
    const { c, readBack } = change({ outcome: 'pending' });
    render(<AutoApproveNote save={c} />);
    expect(screen.getByText(strings['autoapprove.unknown'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
    expect(readBack).toHaveBeenCalledOnce();
  });
  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<AutoApproveNote save={change().c} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the helpers Auto-approve has not reached', () => {
  it('counts a refused row apart from the ones still being sent, and none as none', () => {
    expect(yoloUnappliedOf([])).toEqual({ pending: 0, refused: 0 });
    expect(yoloUnappliedOf([{ session_id: 'a', state: 'pending' }, { session_id: 'b', state: 'refused' }, { session_id: 'c', state: 'refused' }])).toEqual({ pending: 1, refused: 2 });
  });
});
