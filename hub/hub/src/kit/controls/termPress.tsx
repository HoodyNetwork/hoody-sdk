// The terminal side of kit buttons and text buttons, shared by Button.term and Link.term (never imported by web code):
// - PRESS: what a press handler written for the web receives here.
// - SoftPress: a Pressable that can be soft-disabled (a disabled control that says why stays focusable, does
//   nothing on Enter, Space or a click, and shows its reason while it has the focus, in a tip under it, read as words).
//   Esc hides the tip until the focus comes back (the web closes it and lets Esc go on; here the first Esc is the tip's).
//   The tip opens only when the person asked: the focus ARRIVED on it while it was off (Tab, a click, a shortcut), or
//   it was pressed while off. A control that turns off under a focus it already had (its own send went out; a drawer
//   it opened is sending), or whose page comes back from under a layer, opens no tip: a tip never covers the next step
//   (the VMs held band's [Check again] sat under "Make the disk bigger"'s tip). The reason is still read.
// - SoftPressNotice: a press on a soft-disabled control told to the one who drew it (ReasonButton's `onPress`); it
//   still never runs the control's own action.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Pressable, Text, useFocusControl, type FocusId, type KeyHandler, type Sem } from '../../term/prim';
import { cellWidth } from '../../term/prim/Caret';
import { Layer, useAnchor } from '../../term/prim/Overlay';

/** A keyboard press as React Aria's PressEvent: the fields web handlers read. */
export const PRESS = { type: 'press', pointerType: 'keyboard', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, x: 0, y: 0, target: null, continuePropagation() {} } as never;

/** Buttons inside wrap their label over as many lines as it needs instead of cutting it with "…": the web's inline
 *  action and suggestion rows (ActionBar.module.css `.inline > *`, `max-inline-size: 100%`), where a label is data (a
 *  computer name). Set by InlineActions and SuggestionActions; a button anywhere else stays one line. */
export const ButtonWrap = createContext(false);
export const useButtonWrap = (): boolean => useContext(ButtonWrap);

/** Who hears a press on a soft-disabled control below (ReasonButton `onPress`: a page scrolls the failing fact into
 *  view). Never the action itself, which a soft-disabled control never runs; hard-off and busy controls hear nothing. */
export const SoftPressNotice = createContext<(() => void) | undefined>(undefined);

/** The widest a reason tip is drawn; longer reasons wrap. */
const TIP_MAX = 48;

export interface SoftPressProps {
  /** Hard off: skipped by Tab, no press (isDisabled with no reason). */
  off: boolean;
  /** Busy: no press, but the focus stays (a Save that goes busy under the keyboard keeps it, as on the web). */
  busy?: boolean;
  /** Soft off: focusable, no press, the reason shows while focused. */
  soft: boolean;
  reason?: string;
  onPress?: () => void;
  autoFocus?: boolean;
  /** The control's web `id`: code that focuses it by id on the web finds it here (FocusControl.focusDomId). */
  domId?: string;
  /** Keys beyond Enter and Space while it has the focus (the web control's onKeyDown); true = taken. */
  onKey?: KeyHandler;
  grow?: boolean;
  /** May be narrowed by its row (a link cut with an ellipsis). */
  shrink?: boolean;
  /** What the press is to a reader: name, role (default button), pressed, busy, description. Disabled and the reason
   *  come from off / soft / reason. */
  sem?: Sem;
  /** `hovered`: the pointer is on it and a press would act: never while off, soft off, busy or focused. */
  children: (state: { focused: boolean; hovered: boolean }) => ReactNode;
}

export function SoftPress({ off, busy = false, soft, reason, onPress, autoFocus, domId, onKey, grow, shrink, sem, children }: SoftPressProps) {
  const anchor = useAnchor();
  const notice = useContext(SoftPressNotice);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Asked: the person arrived on it or pressed it while it was off. Reset when it is on again.
  const [asked, setAsked] = useState(false);
  useEffect(() => { if (!soft) setAsked(false); }, [soft]);
  // `soft` as of the previous commit: the Pressable's focus-change effect (a child's) runs before this one, so a click
  // that focuses the control AND turns it off in one go reads "was on" (an arrival on an ON control: no tip).
  const wasSoft = useRef(soft);
  useEffect(() => { wasSoft.current = soft; });
  // A focus that only went dark under a layer (the scope's focused thing is still this one) comes back as a return,
  // not an arrival: `kept` says so at the next gain.
  const fc = useFocusControl();
  const mine = useRef<FocusId | null>(null);
  const kept = useRef(false);
  const show = soft && focused && asked && !hidden && !!reason;
  return (
    <>
      {/* A press is the button's own: it never also presses a pressable row around it (the web's click stops at the button). */}
      <Box boxRef={anchor.ref} dir="row" shrink={grow || shrink ? 1 : 0} grow={grow ? 1 : 0} onPress={(e) => e.stopPropagation()}>
        <Pressable
          dir="row"
          shrink={grow || shrink ? 1 : 0}
          grow={grow ? 1 : 0}
          disabled={off && !soft && !busy}
          autoFocus={autoFocus}
          domId={domId}
          onKey={onKey}
          onFocusChange={(f) => {
            setFocused(f);
            if (f) {
              setHidden(false);
              if (!kept.current) setAsked(wasSoft.current);
              kept.current = false;
              mine.current = fc.current();
            } else kept.current = mine.current !== null && fc.current() === mine.current;
          }}
          onPress={busy ? undefined : soft ? () => { setAsked(true); setHidden(false); notice?.(); } : off ? undefined : onPress}
          sem={{ ...sem, disabled: off || soft || busy || undefined, disabledReason: soft ? reason : undefined }}
        >
          {/* Hard off alone is a disabled Pressable, which is never hovered. */}
          {(s) => children({ focused: s.focused, hovered: s.hovered && !soft && !busy })}
        </Pressable>
      </Box>
      <Layer
        open={show}
        kind="tip"
        place={{ at: 'anchor', anchor: show ? anchor.rect() : null, side: 'bottom', align: 'start', width: Math.min(TIP_MAX, cellWidth(reason ?? '') + 4) }}
        padX={1}
        onEscape={() => setHidden(true)}
      >
        <Text colour="ink">{reason}</Text>
      </Layer>
    </>
  );
}
