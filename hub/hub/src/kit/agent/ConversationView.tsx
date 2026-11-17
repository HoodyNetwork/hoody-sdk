// ConversationView: one conversation inside the AI tab's frame. The frame rule (nothing overlays the
// conversation; Details takes the pane's place at m and l, sits beside at xl, is a whole-page sheet below 840) is
// SplitLayout's, drawn once; this part fills its slots: the header, the transcript with its Needs-you bar and
// Jump to newest, the host's composer and bands, and Details. It reads one ConversationSource and sends nothing.
//
// Three things belong to the composition, not to a part:
//   - Focus. A gate's card takes focus when it arrives unless the person is typing; "typing" is the host's flag OR focus in
//     any editable field of this frame (a field in Details counts), so a gate never takes focus from a field and turns the
//     next key into a decision. Opening Details moves focus into it; closing returns it to the Details button; a sheet
//     that closes because a gate arrived puts focus on that card itself (no key decides from there).
//   - The phone sheet. Below 840 an open Details sheet covers the whole page, so a gate that ARRIVES closes it: a gate
//     identity (key, id, generation) not seen waiting before. A gate already waiting when the person opens Details never does.
//   - Activity's Show brings that gate's own card: focus goes to its first control (Show was pressed on purpose); on
//     the phone the sheet closes first and focus follows once it is gone.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ConvHeader, type ConvCapability, type ConvModel } from './ConvHeader';
import { DetailsPanel, type DetailsTab } from './DetailsPanel';
import { focusCard } from './focusCard';
import { useEditing } from './takesText';
import { SessionView, type ConvStop, type TurnMenu } from './SessionView';
import { SplitLayout } from './SplitLayout';
import { gateIdOf, type ConversationSource, type GateEntry } from './source';
import { isSmall, useSizeClass } from './useSizeClass';
import s from './ConversationView.module.css';

export interface ConversationViewProps {
  source: ConversationSource;
  /** The chat list slot (the pane): shown or hidden by the frame rule, always mounted. */
  pane: ReactNode;
  detailsOpen: boolean;
  onDetails: (open: boolean) => void;
  /** Below 840 this is the conversation screen; the list is the other. */
  onBack?: () => void;
  /** Between the transcript and the end of the column: the composer, a paused or reconnecting band's neighbour. */
  composer?: ReactNode;
  /** Above the transcript: the paused band, cannot-reach, closed. */
  top?: ReactNode;
  /** The header's own buttons (Add to Board, the ⋯ menu). */
  actions?: ReactNode;
  agentUrl?: string;
  /** The person is typing in a field the host owns (the composer): a gate arriving does not take focus. */
  typing?: boolean;
  empty?: ReactNode;
  session?: ReactNode;
  usage?: ReactNode;
  activityExtra?: ReactNode;
  tab?: DetailsTab;
  onTab?: (t: DetailsTab) => void;
  /** A menu on each finished reply (see SessionView). */
  turnMenu?: TurnMenu;
  /** Edit under a message the agent did not take (see SessionView). */
  onTakeBack?: (text: string) => void;
  takeBackFiles?: boolean;
  /** The header's capability line (see ConvHeader). */
  capability?: ConvCapability | null;
  /** The header's model chip (see ConvHeader). */
  model?: ConvModel | null;
  /** The model chip's press (see ConvHeader). */
  onModel?: () => void;
  /** The host's Stop of the running turn, drawn in the working bar (see SessionView). */
  stop?: ConvStop | null;
}

const waitingIds = (gates: readonly GateEntry[]): Set<string> => new Set(gates.filter((g) => g.decision === null).map(gateIdOf));
/** That gate's card wrap in this frame, matched by its identity. */
const wrapOf = (root: HTMLElement, id: string): HTMLElement | undefined =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-gate-key]')).find((el) => el.getAttribute('data-gate-key') === id);

function bring(root: HTMLElement, id: string | null): void {
  const wrap = id ? wrapOf(root, id) : undefined;
  if (!wrap) return;
  wrap.scrollIntoView?.({ block: 'nearest' });
  focusCard(wrap, 'control');
}

export function ConversationView(p: ConversationViewProps) {
  const { source, detailsOpen, onDetails } = p;
  const [sizeRef, size] = useSizeClass<HTMLDivElement>('l');
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  const { editing, onFocus, onBlur } = useEditing(sizeRef);
  // Where focus goes once the next Details change has been drawn; set by whoever asked for it.
  const goes = useRef<'panel' | 'toggle' | 'card' | 'gate' | null>(null);
  // The gate Activity's Show asked for, brought once the sheet is gone.
  const shown = useRef<string | null>(null);
  const seen = useRef(waitingIds(snap.gates));

  useEffect(() => {
    const now = waitingIds(snap.gates);
    const arrived = [...now].some((k) => !seen.current.has(k));
    seen.current = now;
    if (arrived && isSmall(size) && detailsOpen) {
      goes.current = 'card';
      onDetails(false);
    }
  }, [snap, size, detailsOpen, onDetails]);

  const was = useRef(detailsOpen);
  useEffect(() => {
    if (was.current === detailsOpen) return;
    was.current = detailsOpen;
    const why = goes.current;
    goes.current = null;
    const root = sizeRef.current;
    if (!root || !why) return;
    if (why === 'panel') root.querySelector<HTMLElement>('[data-details-panel] [role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    else if (why === 'gate') bring(root, shown.current);
    else if (why === 'toggle') root.querySelector<HTMLElement>('[data-details-toggle]')?.focus({ preventScroll: true });
    else {
      const wrap = root.querySelector<HTMLElement>('[data-gate-wrap]');
      if (wrap) focusCard(wrap, 'card');
    }
  }, [detailsOpen, sizeRef]);

  const showGate = useCallback((g: GateEntry) => {
    const id = gateIdOf(g);
    if (isSmall(size) && detailsOpen) {
      shown.current = id;
      goes.current = 'gate';
      onDetails(false);
      return;
    }
    if (sizeRef.current) bring(sizeRef.current, id);
  }, [size, detailsOpen, onDetails, sizeRef]);

  const toggle = useCallback(() => {
    goes.current = detailsOpen ? 'toggle' : 'panel';
    onDetails(!detailsOpen);
  }, [detailsOpen, onDetails]);
  const close = useCallback(() => {
    goes.current = 'toggle';
    onDetails(false);
  }, [onDetails]);
  // A result row's Review: Details on Edits. A host that holds the tab hears it; otherwise this frame holds it until the person
  // picks another tab.
  const [tabHere, setTabHere] = useState<DetailsTab | undefined>(undefined);
  const { onTab } = p;
  const pickTab = useCallback((v: DetailsTab) => { setTabHere(v); onTab?.(v); }, [onTab]);
  const review = useCallback(() => {
    pickTab('edits');
    if (!detailsOpen) { goes.current = 'panel'; onDetails(true); }
  }, [pickTab, detailsOpen, onDetails]);

  return (
    // Focus events only note whether the person is typing; the div takes no input.
    <div ref={sizeRef} className={s.root} data-size={size} onFocus={onFocus} onBlur={onBlur}>
      <SplitLayout
        size={size}
        detailsOpen={detailsOpen}
        screen="conversation"
        pane={p.pane}
        main={(
          <>
            <ConvHeader size={size} title={snap.title} meta={snap.meta} detailsOpen={detailsOpen} onDetails={toggle} onBack={p.onBack} actions={p.actions} capability={p.capability} model={p.model} onModel={p.onModel} />
            <SessionView source={source} size={size} agentUrl={p.agentUrl} typing={p.typing || editing} empty={p.empty} top={p.top} turnMenu={p.turnMenu} onTakeBack={p.onTakeBack} takeBackFiles={p.takeBackFiles} onReview={review} stop={p.stop} />
            {/* As wide as the thread above it, centred: a wide screen does not stretch the composer past the transcript. */}
            {p.composer != null && p.composer !== false && (
              <div className={s.composerLane} data-composer-lane="">
                {p.composer}
              </div>
            )}
          </>
        )}
        details={<DetailsPanel snapshot={snap} onClose={close} activityExtra={p.activityExtra} session={p.session} usage={p.usage} tab={p.tab ?? tabHere} onTab={pickTab} onShowGate={showGate} />}
      />
    </div>
  );
}
