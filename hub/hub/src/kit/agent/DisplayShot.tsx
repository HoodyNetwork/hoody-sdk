// DisplayShot: "Screenshot of a display" in the composer's add menu (displayShot.ts reads and captures).
// The composer draws three things from this hook: the menu item, one note above the box (what is going on, or why no picture
// came) and, when the chat's computer runs several displays, the dialog that asks which one. One display is captured at once.
// The picture is handed to the host's own add path as a file, so it is a chip the person sees and can remove; nothing goes to
// the agent before Send. What is known without asking the computer disables the item with its reason (the chat takes no files,
// its computer is not shown here, the message has its images already, a capture is still on its way).
// A press belongs to the chat it was made in: another chat, or a composer that leaves, ends it and adds nothing.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { isFramed, type Target } from '@core';
import { IconButton } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { RadioGroup } from '../forms/RadioGroup';
import { ErrorDetails } from '../states/ErrorDetails';
import { formatNumber } from '../format';
import { Dialog } from '../overlays/Dialog';
import type { MenuAction } from '../overlays/Menu';
import { useStrings } from '../strings';
import type { ComposerNote } from './Composer';
import { captureDisplay, isDisplayNumber, listDisplays, shotCtx, ShotError, type ShotDisplay, type ShotWhy } from './displayShot';
import strings from './Conversation.strings.en.json';
import s from './Conversation.module.css';

/** What a host says for its composer to offer a screenshot. */
export interface ComposerScreenshot {
  /** The chat this composer writes to: a capture asked for in another chat adds nothing here. */
  chat: string;
  /** The computer the CHAT runs on (never the one shown elsewhere in the Hub); null while it is not known here. */
  target: Target | null;
  /** That computer's name, for the words. */
  computer: string;
  /** How many more images the message takes, and how many it takes in all (the host's own limit, for the words). */
  room: number;
  max: number;
  /** Why the chat's computer is not known here, in the host's words; absent: the kit's own sentence. */
  noTarget?: string;
  /** Why the chat takes no files now, in the host's words; '' or absent when it does. */
  refused?: string;
}

// `lost`: the chat's computer stopped being known here while the dialog was open.
type Said = Exclude<ShotWhy, 'stale'> | 'none' | 'listFailed' | 'lost';
type Phase =
  | { k: 'idle' }
  | { k: 'listing' }
  | { k: 'pick'; displays: ShotDisplay[]; chosen: string }
  | { k: 'capturing'; n: number }
  // `again`: what Try again does: read the displays again, or capture that display again.
  | { k: 'said'; why: Said; n: number | null; error?: unknown; again: 'list' | number | null };

const IDLE: Phase = { k: 'idle' };

/** Enter on a display's radio in the picker takes that display (the radio named by the key's target, not a stale choice).
 *  Only a plain Enter on a radio: Space still picks, and Enter anywhere else in the dialog is the dialog's. */
function takeOnEnter(e: KeyboardEvent<HTMLDivElement>, shoot: (n: number) => Promise<void>): void {
  const el = e.target;
  if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
  if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !isDisplayNumber(Number(el.value))) return;
  e.preventDefault();
  e.stopPropagation();
  void shoot(Number(el.value));
}

export function useDisplayShot(cfg: ComposerScreenshot | null | undefined, onAddFiles: ((files: readonly File[]) => void) | undefined): { item: MenuAction | null; note: ComposerNote | null; dialog: ReactNode } {
  const t = useStrings(strings);
  const [phase, setPhase] = useState<Phase>(IDLE);
  // One press at a time; a press that ends after its chat left (or the composer went) is dropped.
  const run = useRef(0);
  const stop = useRef<AbortController | null>(null);
  const chat = cfg?.chat ?? null;
  const end = useCallback(() => {
    run.current += 1;
    stop.current?.abort();
    stop.current = null;
  }, []);
  useEffect(() => {
    setPhase(IDLE);
    return end;
  }, [chat, end]);
  const add = useRef(onAddFiles);
  add.current = onAddFiles;
  const target = cfg?.target ?? null;

  const fail = (e: unknown, n: number | null, again: 'list' | number): void => {
    const why = e instanceof ShotError ? e.why : 'failed';
    if (why === 'stale') { setPhase(IDLE); return; }
    setPhase({ k: 'said', why: n === null && why !== 'private' && why !== 'framed' && why !== 'unreachable' ? 'listFailed' : why, n, again: why === 'framed' ? null : again, ...(why === 'failed' && e instanceof ShotError ? { error: e.error } : {}) });
  };
  const begin = (): { id: number; ctx: ReturnType<typeof shotCtx>; signal: AbortSignal } | null => {
    if (!target) return null;
    end();
    const c = new AbortController();
    stop.current = c;
    return { id: run.current, ctx: shotCtx(target), signal: c.signal };
  };
  const shoot = async (n: number, from?: { id: number; ctx: ReturnType<typeof shotCtx>; signal: AbortSignal }): Promise<void> => {
    const at = from ?? begin();
    if (!at || !target) { end(); setPhase({ k: 'said', why: 'lost', n: null, again: null }); return; }
    setPhase({ k: 'capturing', n });
    try {
      const file = await captureDisplay(target, n, { ctx: at.ctx, signal: at.signal });
      if (run.current !== at.id) return;
      setPhase(IDLE);
      add.current?.([file]);
    } catch (e) {
      if (run.current === at.id) fail(e, n, n);
    }
  };
  const start = async (): Promise<void> => {
    const at = begin();
    if (!at || !target) return;
    setPhase({ k: 'listing' });
    try {
      const displays = await listDisplays(target, { ctx: at.ctx, signal: at.signal });
      if (run.current !== at.id) return;
      const only = displays[0];
      if (!only) setPhase({ k: 'said', why: 'none', n: null, again: null });
      else if (displays.length === 1) await shoot(only.n, at);
      else setPhase({ k: 'pick', displays, chosen: String(only.n) });
    } catch (e) {
      if (run.current === at.id) fail(e, null, 'list');
    }
  };

  if (!cfg || !onAddFiles) return { item: null, note: null, dialog: null };
  const computer = cfg.computer;
  const busy = phase.k === 'listing' || phase.k === 'capturing';
  const off = cfg.refused || (isFramed() ? t('agent.shot.framed') : !target ? cfg.noTarget || t('agent.shot.noComputer') : cfg.room <= 0 ? t('agent.shot.full', { count: cfg.max, max: formatNumber(cfg.max) }) : busy ? t('agent.shot.busy') : '');
  const item: MenuAction = {
    id: 'screenshot', label: t('agent.shot.item'), icon: 'camera', description: t('agent.shot.desc'),
    ...(off ? { isDisabled: true, disabledReason: off } : {}),
    onAction: () => { if (!off) void start(); },
  };

  const dismiss = <IconButton icon="x" size="sm" label={t('agent.shot.dismiss')} onPress={() => setPhase(IDLE)} />;
  let note: ComposerNote | null = null;
  if (phase.k === 'listing') note = { key: 'shot', text: t('agent.shot.listing', { computer }), status: true, busy: true };
  else if (phase.k === 'capturing') note = { key: 'shot', text: t('agent.shot.capturing', { n: String(phase.n), computer }), status: true, busy: true };
  else if (phase.k === 'said') {
    const n = phase.n === null ? '' : String(phase.n);
    const said: Record<Said, string> = {
      none: t('agent.shot.none', { computer }), gone: t('agent.shot.gone', { n, computer }), unreachable: t('agent.shot.unreachable', { computer }),
      private: t('agent.shot.private', { computer }), framed: t('agent.shot.framed'), lost: t('agent.shot.lost'), tooBig: t('agent.shot.tooBig', { n }),
      notImage: t('agent.shot.notImage', { n }), listFailed: t('agent.shot.listFailed', { computer }), failed: t('agent.shot.failed', { n, computer }),
    };
    const text = said[phase.why];
    const again = phase.again;
    note = {
      key: 'shot', text, warn: phase.why !== 'none', status: true,
      // Details, Try again and the close button stay together: one group at the end of the line, or one row under the words.
      end: (
        <span className={s.composerNoteEnd}>
          {phase.error !== undefined && phase.error !== null && <ErrorDetails error={phase.error} mode="button" />}
          {again !== null && <TextButton onPress={() => { void (again === 'list' ? start() : shoot(again)); }}>{t('agent.shot.again')}</TextButton>}
          {dismiss}
        </span>
      ),
    };
  }

  const dialog = phase.k === 'pick' ? (
    <Dialog
      isOpen
      onOpenChange={(open) => { if (!open) setPhase(IDLE); }}
      title={t('agent.shot.pick.title')}
      body={t('agent.shot.pick.body', { computer })}
      primaryLabel={t('agent.shot.pick.take')}
      onPrimary={() => { void shoot(Number(phase.chosen)); }}
      initialFocus="field"
    >
      {/* Enter on a display takes that display, as the primary button does. Caught on the way down: the radio's own label
          takes Enter as a press and stops it before any parent sees it. */}
      <div onKeyDownCapture={(e) => { takeOnEnter(e, shoot); }}>
      <RadioGroup
        aria-label={t('agent.shot.pick.label', { computer })}
        value={phase.chosen}
        onChange={(chosen) => setPhase({ ...phase, chosen })}
        options={phase.displays.map((d) => ({
          value: String(d.n),
          label: t('agent.shot.display', { n: String(d.n) }),
          description: d.windows === 0 ? t('agent.shot.windows.none')
            : d.titles.length === 0 ? t('agent.shot.windows', { count: d.windows, n: formatNumber(d.windows) })
              : t('agent.shot.windows.titled', { count: d.windows, n: formatNumber(d.windows), titles: d.titles.join(t('agent.shot.windows.join')) + (d.windows > d.titles.length ? t('agent.shot.windows.more') : '') }),
        }))}
      />
      </div>
    </Dialog>
  ) : null;
  return { item, note, dialog };
}
