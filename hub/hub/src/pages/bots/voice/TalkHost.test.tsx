// Talk's slots in the composer: the kit parts fed from a fake session (useBotVoice mocked; session.test.ts holds the session).
import { act, render, screen } from '@testing-library/react';
import { voiceInitial, type VoiceState } from '@kit/pure';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type * as Core from '@core';
import type * as Data from '../data';
import type { BotView, VoiceCaps } from '../data';
import { VOICE_CAPS_UNKNOWN } from '../data';
import type { TalkSession, TalkSnapshot } from './session';
import { TALK_VIEW_START } from './talkView';
import { useTalkSlots, type TalkSlots } from './TalkHost';

const h = vi.hoisted(() => ({ snap: null as unknown, session: null as unknown, caps: null as unknown, framed: false, rows: null as unknown }));
vi.mock('./useBotVoice', () => ({ useBotVoice: (_k: string, _c: unknown, rows: unknown) => { h.rows = rows; return { session: h.session, snap: h.snap }; } }));
vi.mock('../data', async (orig) => ({ ...(await orig<typeof Data>()), useVoiceCaps: () => h.caps, useLog: () => ({ page: { rows: ['ROW'] } }), useBotView: () => ({ refetch: vi.fn() }) }));
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), isFramed: () => h.framed }));

const session = (): TalkSession => new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (t[k] ??= vi.fn()) }) as unknown as TalkSession;
const snap = (voice: Partial<VoiceState> = {}, more: Partial<TalkSnapshot> = {}): TalkSnapshot => ({ voice: { ...voiceInitial('ptt'), ...voice }, view: TALK_VIEW_START, level: 0, handsFree: false, damaged: false, suspended: false, inputs: [], outputs: [], canChooseOutput: false, restored: new Set(), ...more });
const bot = (o: Partial<BotView> = {}): BotView => ({ name: 'Juno', turnRunning: false, turnId: null, speech: { enabled: true, ready: null, why: null, config: null }, ...o }) as BotView;
const allCaps = (o: Partial<VoiceCaps> = {}): VoiceCaps => ({ ...VOICE_CAPS_UNKNOWN, check: true, ...o });

let slots!: TalkSlots;
function Host({ b }: { b: BotView }): ReactElement {
  slots = useTalkSlots(b, 'key', () => undefined);
  return <div>{slots.mic}{slots.talk}{slots.captions}</div>;
}
const draw = (b: BotView = bot()) => render(<Host b={b} />);
const noteTexts = () => slots.notes.map((n) => n.text);

beforeEach(() => {
  h.session = session();
  h.snap = snap();
  h.caps = allCaps();
  h.framed = false;
});

describe('the Mic', () => {
  it('off: Mic only, and a press starts the session', () => {
    draw();
    expect(slots.talk).toBeNull();
    expect(slots.captions).toBeNull();
    act(() => screen.getByRole('button', { name: /talk/i }).click());
    expect((h.session as TalkSession).press).toHaveBeenCalledTimes(1);
  });
  it('says why it cannot start: framed, an old agent, voice not set up', () => {
    h.framed = true;
    const a = draw();
    expect(screen.getByRole('button', { name: /talk/i }).getAttribute('aria-disabled')).toBe('true');
    a.unmount();
    h.framed = false;
    h.caps = allCaps({ check: false });
    const b = draw();
    expect(screen.getByRole('button', { name: /talk/i }).getAttribute('aria-disabled')).toBe('true');
    b.unmount();
    h.caps = allCaps();
    draw(bot({ speech: { enabled: true, ready: false, why: null, config: null } }));
    expect(screen.getByRole('button', { name: /talk/i }).getAttribute('aria-disabled')).toBe('true');
  });
  it('while the capabilities are unknown the press still works: the press itself checks', () => {
    h.caps = VOICE_CAPS_UNKNOWN;
    draw();
    expect(screen.getByRole('button', { name: /talk/i }).getAttribute('aria-disabled')).not.toBe('true');
  });
  it('passes the log rows on, so a note can settle', () => {
    draw();
    expect(h.rows).toEqual(['ROW']);
  });
});

describe('the Talk row', () => {
  it.each(['denied', 'noDevice', 'notReady', 'checkUnknown', 'busyElsewhere', 'budget', 'connectFailed', 'playbackBlocked', 'ended'] as const)('%s: a band above the composer, so Send and the Mic stay', (phase) => {
    h.snap = snap({ phase });
    draw();
    expect(slots.talk).toBeNull();
    expect(slots.band).not.toBeNull();
  });
  it.each(['starting', 'connecting', 'reconnecting', 'live', 'muting', 'muted'] as const)('%s: it takes the action row', (phase) => {
    h.snap = snap({ phase });
    draw();
    expect(slots.talk).not.toBeNull();
    expect(slots.band).toBeNull();
  });
  it('a band while connecting, no captions until live', () => {
    h.snap = snap({ phase: 'connecting' });
    draw();
    expect(slots.talk).not.toBeNull();
    expect(slots.captions).toBeNull();
  });
  it('captions while live, with the Bot\'s name', () => {
    h.snap = snap({ phase: 'live' }, { view: { ...TALK_VIEW_START, you: { text: 'book it', final: false }, bot: { text: 'on it', final: true } } });
    draw();
    expect(screen.getByText(/book it/)).toBeTruthy();
    expect(screen.getAllByText(/Juno/).length).toBeGreaterThan(0);
  });
  it('Stop answer acts on the open reply first, else the turn the Bot view names; with neither it is not offered', () => {
    h.snap = snap({ phase: 'live', reply: { turnId: 'R', speechStopped: false } });
    const a = draw(bot({ turnRunning: true, turnId: 'V' }));
    act(() => screen.getByRole('button', { name: /stop answer/i }).click());
    expect((h.session as TalkSession).stopAnswer).toHaveBeenLastCalledWith('R');
    a.unmount();
    h.snap = snap({ phase: 'live' });
    const b = draw(bot({ turnRunning: true, turnId: 'V' }));
    act(() => screen.getByRole('button', { name: /stop answer/i }).click());
    expect((h.session as TalkSession).stopAnswer).toHaveBeenLastCalledWith('V');
    b.unmount();
    draw(bot({ turnRunning: false, turnId: 'V' }));
    expect(screen.queryByRole('button', { name: /stop answer/i })).toBeNull();
  });
  it('Stop speaking only when the agent lists it and a reply is still spoken', () => {
    const live = { phase: 'live', speak: true } as const;
    h.snap = snap({ ...live, caps: { stopSpeech: false, textKey: false }, reply: { turnId: 'R', speechStopped: false } });
    const a = draw();
    expect(screen.queryByRole('button', { name: /stop speaking/i })).toBeNull();
    a.unmount();
    h.snap = snap({ ...live, caps: { stopSpeech: true, textKey: false }, reply: { turnId: 'R', speechStopped: true } });
    const b = draw();
    expect(screen.queryByRole('button', { name: /stop speaking/i })).toBeNull();
    b.unmount();
    h.snap = snap({ ...live, caps: { stopSpeech: true, textKey: false }, reply: { turnId: 'R', speechStopped: false } });
    draw();
    expect(screen.getByRole('button', { name: /stop speaking/i })).toBeTruthy();
  });
});

describe('the notes', () => {
  const may = { kind: 'maybeSent', conn: 'K', utt: 1, at: 1 } as const;
  it('a loss says may have been sent; a note from the store says it could not be confirmed; a settled one says nothing', () => {
    h.snap = snap({ notes: [may] });
    const a = draw();
    expect(noteTexts()).toEqual(['May have been sent: check the conversation']);
    a.unmount();
    h.snap = snap({ notes: [may] }, { restored: new Set(['K#1']) });
    const b = draw();
    expect(noteTexts()).toEqual(["Couldn't confirm this spoken message"]);
    b.unmount();
    h.snap = snap({ notes: [{ ...may, settled: { seq: 2 } }] });
    draw();
    expect(noteTexts()).toEqual([]);
  });
  it('uncorrelated audio has its own words', () => {
    h.snap = snap({ notes: [{ kind: 'uncorrelated', conn: 'K', at: 1 }] });
    draw();
    expect(noteTexts()).toEqual(['Some speech may have been sent']);
  });
  it('outcomes while live: utterance, reply, damaged, stop', () => {
    h.snap = snap({ phase: 'live', stop: { id: 1, turnId: 'T', at: 0, cancelNo: 1, turnCancels: 0, outcome: 'mayNotHaveStopped' } }, { damaged: true, view: { ...TALK_VIEW_START, reply: { family: 'unsure', warn: true } } });
    draw();
    expect(noteTexts()).toEqual(['Not sure you heard all of this', 'Part of the audio was lost', 'May not have stopped: check the conversation']);
    expect(slots.notes.find((n) => n.key === 'talk-stop')?.warn).toBe(true);
  });
  it('a refusal it could not read as busy reads in plain words, never the code', () => {
    h.snap = snap({ phase: 'connectFailed', refusal: { code: 'made_up', message: '' } });
    draw();
    expect(noteTexts()).toEqual(["Voice couldn't start"]);
  });
});
