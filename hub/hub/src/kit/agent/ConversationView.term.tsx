// ConversationView.term: one conversation in the terminal AI tab. The web composition (SplitLayout's frame rule, ConvHeader,
// the transcript, the host's composer, Details) with the terminal's own measures:
//   - Size class from the frame's width in cells (one cell counted as 8 px against the web's breakpoints): 80 columns is
//     's' (the chat alone, Details as a whole sheet), 120 'm', 200 'xl' (Details beside the chat).
//   - Typing: the host's flag, or the focus in a text field inside this frame (the composer, a Details field, a card's
//     reason): the web's useEditing rule (takesText.ts), read from the focus store (inField + containsFocus). A gate
//     arriving never takes focus from such a field, so the next key stays text; the card itself waits a moment before
//     any key counts (GateCard.term). The AI page passes no flag, so this frame's own reading is what protects its composer.
//   - A gate that ARRIVES while the small-size Details sheet is open closes the sheet (the web rule); Activity's Show brings
//     that gate's card through GateBringContext (the transcript scrolls to it and focuses its first control).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type * as Web from './ConversationView';
import type { ConversationViewProps } from './ConversationView';
import { Box, useBoxSize } from '@term/prim';
import { useFocusControl, useFocusedNode, type BoxRenderable } from '@term/kit';
import { ConvHeader } from './ConvHeader';
import { DetailsPanel, type DetailsTab } from './DetailsPanel';
import { GateBringContext, type GateBring } from './gateBring';
import { SessionView } from './SessionView';
import { SplitLayout } from './SplitLayout';
import { gateIdOf, type GateEntry } from './source';
import { isSmall, sizeClassOf } from './useSizeClass';

export type { ConversationViewProps } from './ConversationView';

/** Pixels one terminal cell stands for against the web's size breakpoints. */
const CELL_PX = 8;
const waitingIds = (gates: readonly GateEntry[]): Set<string> => new Set(gates.filter((g) => g.decision === null).map(gateIdOf));

export const ConversationView: typeof Web.ConversationView = (p: ConversationViewProps) => {
  const { source, detailsOpen, onDetails } = p;
  const [measured, onSize] = useBoxSize();
  const size = sizeClassOf((measured?.width ?? 120) * CELL_PX, 'l');
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  // Editing: the focus is on a text field drawn inside this frame. Read on every focus change, and once after mount: a
  // field that took the focus on mount (autoFocus) did so in its own effect, before this frame subscribed.
  const frame = useRef<BoxRenderable | null>(null);
  const fc = useFocusControl();
  const [editing, setEditing] = useState(false);
  const readEditing = useCallback(() => setEditing(fc.inField() && fc.containsFocus(frame.current)), [fc]);
  useFocusedNode(readEditing);
  useEffect(() => { readEditing(); }, [readEditing]);
  const [bring, setBring] = useState<GateBring>({ id: null, n: 0 });
  const seen = useRef(waitingIds(snap.gates));
  useEffect(() => {
    const now = waitingIds(snap.gates);
    const arrived = [...now].filter((k) => !seen.current.has(k));
    seen.current = now;
    if (arrived.length > 0 && isSmall(size) && detailsOpen) {
      onDetails(false);
      setBring((b) => ({ id: arrived[0]!, n: b.n + 1 }));
    }
  }, [snap, size, detailsOpen, onDetails]);
  const showGate = useCallback((g: GateEntry) => {
    if (isSmall(size) && detailsOpen) onDetails(false);
    setBring((b) => ({ id: gateIdOf(g), n: b.n + 1 }));
  }, [size, detailsOpen, onDetails]);
  const toggle = useCallback(() => onDetails(!detailsOpen), [detailsOpen, onDetails]);
  const close = useCallback(() => onDetails(false), [onDetails]);
  const [tabHere, setTabHere] = useState<DetailsTab | undefined>(undefined);
  const { onTab } = p;
  const pickTab = useCallback((v: DetailsTab) => { setTabHere(v); onTab?.(v); }, [onTab]);
  const review = useCallback(() => {
    pickTab('edits');
    if (!detailsOpen) onDetails(true);
  }, [pickTab, detailsOpen, onDetails]);
  return (
    <Box dir="column" grow={1} shrink={1} onSize={onSize} boxRef={frame}>
      <GateBringContext.Provider value={bring}>
        <SplitLayout
          size={size}
          detailsOpen={detailsOpen}
          screen="conversation"
          pane={p.pane}
          main={(
            <Box dir="column" grow={1} shrink={1}>
              <ConvHeader size={size} title={snap.title} meta={snap.meta} detailsOpen={detailsOpen} onDetails={toggle} onBack={p.onBack} actions={p.actions} capability={p.capability} model={p.model} onModel={p.onModel} />
              <SessionView source={source} size={size} agentUrl={p.agentUrl} typing={p.typing || editing} empty={p.empty} top={p.top} turnMenu={p.turnMenu} onTakeBack={p.onTakeBack} takeBackFiles={p.takeBackFiles} onReview={review} stop={p.stop} />
              {p.composer}
            </Box>
          )}
          details={<DetailsPanel snapshot={snap} onClose={close} activityExtra={p.activityExtra} session={p.session} usage={p.usage} tab={p.tab ?? tabHere} onTab={pickTab} onShowGate={showGate} />}
        />
      </GateBringContext.Provider>
    </Box>
  );
};
