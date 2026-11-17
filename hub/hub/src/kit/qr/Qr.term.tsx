// QR codes in the terminal (the web's Qr.tsx). The code is drawn in half-block cells (prim/Qr: one module wide, two
// high, quiet zone included, black on white at every colour tier so a phone reads it on any theme). Same rules as the
// web for a secret:
// - A secret address shows neither code nor address until Show (`s` or the button); Copy works without Show. A hidden
//   code is a hatched box of the code's size, never the web's blurred stand-in (a stand-in is a real-looking code: in
//   cells it is not blurred, and a phone would scan it).
// - What the screen allows is asked as SecretField asks it (term/app/secret-screen-ctx.ts). QrPanel asks at each Show and
//   each Copy of a secret address. A secret code a page draws itself (QrCode `secret`, the 2FA QrImage in a QrSecret) is
//   asked each time it would be drawn; a QrPanel's own code is not asked again (the panel asked at Show, or its caller
//   made no secret). Refused: nothing drawn or copied, and SecretField's line says why. A shown QrPanel address hides
//   again as a shown field does: on terminal blur, when the host is hidden, and after revealIdleMs() with no key press.
// - Everything drawn is wiped when the surface closes, on route change, page hide, `resetKey` change, context end
//   (useWipeOn), on unmount, and when the address changes; one QR surface is open at a time.
// - The semantics tree never holds a module or the address of a hidden code: the code is an img named by its label with
//   the state "filled" (its cells are hidden from the tree); a secret's text is never collected.
// Size check: a code that does not fit its pane is not drawn cropped (a cut code does not scan): a line says why, the
// page's own manual entry (the 2FA key beside it) stays, and the address can be opened on the web (Handoff).
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Web from './Qr';
import { hostEnv } from '@core';
import { Box, Pressable, Text, useKeys, usePaneSize, useTerminalBlur } from '../../term/prim';
import { useRenderer } from '../../term/prim/engine';
import { Qr, qrCells } from '../../term/prim/Qr';
import { cellWidth } from '../../term/prim/TableCells';
import { Button, IconButton } from '../controls/Button';
import { useCopy } from '../data/Ids';
import { useWipeOn } from '../forms/wipe';
import { Dialog } from '../overlays/Dialog';
import { InfoTip } from '../overlays/InfoTip';
import { Handoff } from '../states/Handoff';
import { shownAddress } from '../states/handoff.pure';
import { useStrings } from '../strings';
import { qrMatrix, standInMatrix, type QrMatrix } from './qr';
import { qrImageMatrix } from './qrImage';
import { RevealIdle, secretCopyText } from '../../term/app/secret-screen';
import { revealIdleMs, useSecretScreen } from '../../term/app/secret-screen-ctx';
import secretWords from '../forms/term.strings.en.json';
import strings from './strings.en.json';
import termStrings from './Qr.term.strings.en.json';
import { AddressDialog, InDialog } from './termQrDialog';
import { focusInk } from '@term/kit';

export { BOT_LOGO_PATH, KEY_PATH, LOGO_PATH } from './qr';
export type { QrReachKind } from './qr';
export type { QrButtonProps, QrCodeProps, QrImageProps, QrLogoKind, QrPanelProps, QrReach, QrSecretProps } from './Qr';

const SecretNote = createContext<string | null>(null);
/** Inside QrButton's dialog, which already draws the title and closes on Esc: the panel leaves its own head out. */

export const useQrSecretNote: typeof Web.useQrSecretNote = () => useContext(SecretNote) ?? undefined;

/** Does a code of `size` modules fit the pane (cells, quiet zone included)? */
function useFits(size: number): { fits: boolean; cols: number; rows: number } {
  const pane = usePaneSize();
  const need = qrCells(size);
  return { fits: pane.cols >= need.cols && pane.rows >= need.rows, ...need };
}

/** Too small: one line why, and the web to open it on. A code that holds a key (inside QrSecret: a Bot key share, the 2FA
 *  setup) is shown only here: the web page cannot show that key again, so there is no hand-off, only how to get it here. */
function NoRoom({ cols, rows }: { cols: number; rows: number }) {
  const tt = useStrings(termStrings);
  const addressShown = useContext(AddressDialog);
  const holdsKey = useContext(SecretNote) !== null;
  if (addressShown) return <Text colour="muted">{tt('qr.term.noRoom', { cols, rows })}</Text>;
  if (holdsKey) {
    return (
      <Box dir="column" shrink={0}>
        <Text colour="muted">{tt('qr.term.noRoom', { cols, rows })}</Text>
        <Text colour="muted">{tt('qr.term.noRoomSecret')}</Text>
      </Box>
    );
  }
  return (
    <Box dir="column" shrink={0}>
      <Text colour="muted">{tt('qr.term.noRoom', { cols, rows })}</Text>
      <Handoff size="line" what={tt('qr.term.what')} reason={tt('qr.term.noRoomReason')} />
    </Box>
  );
}

/** The code's cells, named for the tree (img, "filled"); the modules themselves are hidden from it. */
function Cells({ matrix, label, describedBy }: { matrix: QrMatrix; label: string; describedBy?: string }) {
  const { fits, cols, rows } = useFits(matrix.size);
  if (!fits) return <NoRoom cols={cols} rows={rows} />;
  return (
    <Box dir="column" shrink={0} alignSelf="start" sem={{ role: 'img', name: label, value: 'filled', ...(describedBy ? { describedBy } : {}) }}>
      <Box dir="column" shrink={0} sem={{ hidden: true }}>
        <Qr modules={matrix} />
      </Box>
    </Box>
  );
}

/** A hidden code: a hatched box (░ in muted ink, visible on every ground) with one centred line saying what it is and how
 *  to see it (the web's own words, qr.hidden). Full code size only when the pane could also hold a keyed link's code
 *  (FULL_HIDDEN_MIN modules): where the real code will not fit anyway (80x24: "needs 45 × 23"), a compact 3-row box, so
 *  the caption and the buttons stay in view (the Bot key drawer). `said` replaces the words (a refused code). */
function Hatched({ label, size, said }: { label: string; size: number; said?: string }) {
  const t = useStrings(strings);
  const pane = usePaneSize();
  const full = qrCells(Math.max(size, FULL_HIDDEN_MIN));
  const { fits, cols, rows } = useFits(size);
  const words = said ?? t('qr.hidden');
  const compact = !(pane.cols >= full.cols && pane.rows >= full.rows);
  if (!fits && !compact) return <NoRoom cols={cols} rows={rows} />;
  const w = compact ? Math.min(Math.max(cellWidth(words) + 6, 24), Math.max(cellWidth(words) + 2, pane.cols)) : cols;
  const h = compact ? 3 : rows;
  const mid = Math.floor(h / 2);
  const side = Math.max(1, Math.floor((w - cellWidth(words) - 2) / 2));
  const right = Math.max(1, w - side - cellWidth(words) - 2);
  return (
    <Box dir="column" shrink={0} alignSelf="start" sem={{ role: 'img', name: label, value: 'hidden' }}>
      <Box dir="column" shrink={0} sem={{ hidden: true }}>
        {Array.from({ length: h }, (_, i) => i === mid
          ? <Box key={i} dir="row" shrink={0}><Text colour="muted">{'░'.repeat(side)}</Text><Text colour="ink">{` ${words} `}</Text><Text colour="muted">{'░'.repeat(right)}</Text></Box>
          : <Text key={i} colour="muted">{'░'.repeat(w)}</Text>)}
      </Box>
    </Box>
  );
}
/** Modules of the smallest keyed link code the Hub shows (a Bot key address): below its size the real code never fits,
 *  so a hidden one is drawn compact. */
const FULL_HIDDEN_MIN = 37;

/** Inside a QrPanel: the panel asked the screen at Show (or its caller made no secret, secret={false}), so its code is
 *  drawn as given and not asked again. */
const InPanel = createContext(false);

/** A code the screen refused: the hatched box saying "hidden" (pressing Show again would not help; the 2FA image has no
 *  Show), and SecretField's line saying why. */
function Refused({ label, size }: { label: string; size: number }) {
  const tt = useStrings(secretWords);
  return (
    <Box dir="column" shrink={0}>
      <Hatched label={label} size={size} said={tt('secret.hidden')} />
      <Text colour="warn">! {tt('secret.revealRefused')}</Text>
    </Box>
  );
}

// The mark in the middle (`logo`) is not drawn: its square is left light, which the code's error correction covers (the
// web draws the mark or the B there; a two-row mark in half blocks reads as noise).
/** The kit's stand-in (standInMatrix): a pattern that holds nothing, drawn where a secret code is withheld until Show
 *  (Bot key share, key share). The web blurs it; drawn crisp in cells it read as the real code (the Bot key
 *  drawer), so here it is the same hatched box a hidden QrPanel shows. Known by its modules, so no page changes. */
function isStandIn(m: QrMatrix): boolean {
  const s = standInMatrix(m.size);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c) !== s.dark(r, c)) return false;
  return true;
}

export const QrCode: typeof Web.QrCode = ({ matrix, label, secret = false }) => {
  const note = useQrSecretNote();
  const ask = useSecretScreen();
  const inPanel = useContext(InPanel);
  const standIn = useMemo(() => isStandIn(matrix), [matrix]);
  if (standIn) return <Hatched label={label} size={matrix.size} />;
  // A code that carries a key is a secret drawn: the screen is asked each time it would be drawn, as SecretField asks at
  // Show (term/app/secret-screen-ctx.ts; a main-screen mount writes every frame into the scrollback). Refused: the
  // hatched box, and SecretField's line saying why. A QrPanel's own code was asked at its Show.
  if (secret && !inPanel && !ask().reveal) return <Refused label={label} size={matrix.size} />;
  return <Cells matrix={matrix} label={label} {...(secret && note ? { describedBy: note } : {})} />;
};

/** The image's modules read back (qrImage.ts) and drawn as any code; while reading, nothing; an image that does not read
 *  as a clean code says so in words, and the page's manual entry beside it is the way in. The matrix lives only in this
 *  component's state: gone on unmount or a new `src`. */
export const QrImage: typeof Web.QrImage = ({ src, alt }) => {
  const tt = useStrings(termStrings);
  const note = useQrSecretNote();
  const ask = useSecretScreen();
  const [read, setRead] = useState<{ src: string; m: QrMatrix | null } | null>(null);
  useEffect(() => {
    let live = true;
    void qrImageMatrix(src).then((m) => { if (live) setRead({ src, m }); });
    return () => { live = false; setRead(null); };
  }, [src]);
  if (!read || read.src !== src) return null;
  if (!read.m) return <Text colour="muted">{tt('qr.term.unreadable')}</Text>;
  // In a QrSecret (the 2FA key) the drawing is a reveal: asked each time it would be drawn, as QrCode `secret`.
  if (note && !ask().reveal) return <Refused label={alt} size={read.m.size} />;
  return <Cells matrix={read.m} label={alt} {...(note ? { describedBy: note } : {})} />;
};

export const QrSecret: typeof Web.QrSecret = ({ children, note, reach, badge = true }) => {
  const t = useStrings(strings);
  const id = useId();
  // The note wraps at the code's width (as the web's caption under the code), so a long note never widens the column
  // beside it (the 2FA key and steps); never narrower than NOTE_MIN, so a small code keeps a readable line.
  const [codeW, setCodeW] = useState<number | null>(null);
  const noteW = codeW === null ? undefined : Math.max(codeW, NOTE_MIN);
  return (
    <SecretNote.Provider value={id}>
      <Box dir="column" shrink={0} gap={0}>
        {/* The badge: the web's key mark over the code, in words. Never inverse: a light block against the code's top
            edge reads as more quiet zone and makes the code look bigger than the pane it needs. */}
        {badge && <Text bold colour="warn">{t('qr.keyBadge')}</Text>}
        <Box dir="column" shrink={0} alignSelf="start" onSize={(w) => setCodeW((o) => (o === w ? o : w))}>{children}</Box>
        <Box dir="row" shrink={0} sem={{ id }} {...(noteW !== undefined ? { width: noteW } : {})}>
          {/* With `reach`, the trust sentence is the kit InfoTip (focus or press shows what the address reaches), as on the web. */}
          {note !== undefined || reach === undefined ? (
            <Text colour="warn">{`! ${note ?? t('qr.keyNote')}`}</Text>
          ) : (
            <Box dir="row" wrap shrink={1}>
              <Text colour="warn">{`! ${t('qr.keyNoteLead')} `}</Text>
              <InfoTip text={reach} subject={t('qr.reachSubject')}>{t('qr.trust')}</InfoTip>
            </Box>
          )}
        </Box>
      </Box>
    </SecretNote.Provider>
  );
};

/** The narrowest the secret note wraps at (cells), whatever the code's width. */
const NOTE_MIN = 24;

// One QR surface at a time: opening one closes the one before.
let closeActive: (() => void) | null = null;

/** The 29-module size a hidden code is shown at (the web's stand-in size) when the real size is not known yet. */
const HIDDEN_SIZE = 29;

/** While `shown`, `hide` runs as SecretField hides a shown value (its useOnHidden and useRevealIdle, which a sibling
 *  cannot export): the terminal losing focus, the host saying it is hidden, and revealIdleMs() with no key press or
 *  paste on this renderer (the same RevealIdle clock). */
function useHideShown(shown: boolean, hide: () => void): void {
  const renderer = useRenderer();
  const latest = useRef(hide);
  latest.current = hide;
  const on = useRef(shown);
  on.current = shown;
  useTerminalBlur(() => { if (on.current) latest.current(); });
  useEffect(() => {
    if (!shown) return;
    const idle = new RevealIdle(() => latest.current(), revealIdleMs());
    const touch = (): void => idle.touch();
    const input = renderer.keyInput;
    input.prependListener('keypress', touch);
    input.prependListener('paste', touch);
    let off: (() => void) | undefined;
    try {
      off = hostEnv().onVisibilityChange(() => {
        let visible = true;
        try { visible = hostEnv().visible(); } catch { visible = true; }
        if (!visible) latest.current();
      });
    } catch { off = undefined; }
    idle.shown();
    return () => { idle.hidden(); input.off('keypress', touch); input.off('paste', touch); off?.(); };
  }, [shown, renderer]);
}

type Refusal = 'revealRefused' | 'copyRefused' | 'copyValueRefused';

export const QrPanel: typeof Web.QrPanel = ({ url, name, secret = true, keyed = secret, reach, revealed, onRevealedChange, onClose }) => {
  const t = useStrings(strings);
  const tt = useStrings(secretWords);
  const [copyState, copy] = useCopy();
  const inDialog = useContext(InDialog);
  const ask = useSecretScreen();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const visible = !secret || revealed;
  const matrix = useMemo(() => (visible ? qrMatrix(url) : null), [visible, url]);
  // What the address reaches, worded as on the web (Qr.tsx).
  const reachText = typeof reach === 'object' ? reach.text : reach !== undefined || secret ? t(`qr.reach.${reach ?? 'program'}`) : undefined;
  // Show and Copy of a secret ask the screen at each press, as SecretField's do; the code drawn after Show is not asked
  // again (InPanel).
  const toggle = (): void => {
    if (revealed) { onRevealedChange(false); return; }
    const ok = ask().reveal;
    setRefusal(ok ? null : 'revealRefused');
    if (ok) onRevealedChange(true);
  };
  const copyUrl = (): void => {
    if (!secret) { copy(url); return; }
    if (!ask().copy) { setRefusal('copyRefused'); return; }
    const text = secretCopyText(url);
    setRefusal(text === null ? 'copyValueRefused' : null);
    if (text !== null) copy(text);
  };
  useHideShown(secret && revealed, () => onRevealedChange(false));
  // `s` toggles Show while the surface has the keys (as on the web).
  useKeys((k) => {
    if (!secret || k.name !== 's' || k.ctrl || k.meta || k.option) return false;
    toggle();
    return true;
  });
  // The keyed and unkeyed codes are written as literal branches (secret / secret={false}), as the web's are, so the
  // QR key scan (qr.conformance.test.ts) can see that every secret code sits in a QrSecret.
  const hidden = <Hatched label={t('qr.hiddenCodeLabel')} size={HIDDEN_SIZE} />;
  return (
    <Box dir="column" gap={1} shrink={0}>
      {!inDialog && (
        <Box dir="row" justify="between" shrink={0}>
          <Text bold>{t('qr.title', { name })}</Text>
          <IconButton icon="x" size="sm" label={t('qr.close')} onPress={onClose} />
        </Box>
      )}
      <InPanel.Provider value>
        {keyed ? (
          <QrSecret badge={false} {...(reachText !== undefined ? { reach: reachText } : {})}>{matrix ? <QrCode matrix={matrix} label={t('qr.codeLabel')} secret /> : hidden}</QrSecret>
        ) : matrix ? (
          <QrCode matrix={matrix} label={t('qr.codeLabel')} secret={false} />
        ) : (
          hidden
        )}
      </InPanel.Provider>
      {visible ? (
        // Drawn with every 24-hex id masked (CONTRIBUTING.md "Secrets and ids"); the code and Copy take it whole. A secret
        // address stays a secret in the semantics tree once shown, as SecretField's value does: the tree says only
        // that one is there.
        secret ? (
          <Box dir="column" shrink={0} sem={{ role: 'group', name: t('qr.title', { name }), secret: true, value: '•' }}>
            <Text>{shownAddress(url)}</Text>
          </Box>
        ) : (
          <Text>{shownAddress(url)}</Text>
        )
      ) : (
        <Box dir="column" shrink={0}>
          <Text colour="muted" sem={{ hidden: true }}>{t('qr.mask')}</Text>
          <Box dir="row" shrink={0} sem={{ role: 'status' }}><Text colour="muted">{t('qr.hidden')}</Text></Box>
        </Box>
      )}
      <Box dir="row" gap={2} shrink={0}>
        {secret && (
          <Button size="sm" onPress={toggle} shortcut="s">
            {revealed ? t('qr.hide') : t('qr.show')}
          </Button>
        )}
        <Button size="sm" onPress={copyUrl}>
          {copyState === 'copied' ? t('qr.copied') : copyState === 'failed' ? t('qr.copyFailed') : t('qr.copy')}
        </Button>
      </Box>
      {refusal ? <Text colour="warn">! {tt(`secret.${refusal}`)}</Text> : null}
    </Box>
  );
};

export const QrButton: typeof Web.QrButton = ({ url, name, secret = true, keyed = secret, reach, resetKey, openRef, logo = 'hoody' }) => {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const shown = useRef<string | undefined>(undefined);
  const available = useMemo(() => qrMatrix(url) !== null, [url]);

  const close = useCallback(() => {
    shown.current = undefined;
    setRevealed(false);
    setOpen(false);
    if (closeActive === close) closeActive = null;
  }, []);
  const show = useCallback(() => {
    if (!url || !available) return;
    if (closeActive && closeActive !== close) closeActive();
    closeActive = close;
    shown.current = url;
    setRevealed(false);
    setOpen(true);
  }, [url, available, close]);

  useEffect(() => {
    openRef?.(available ? show : null);
    return () => openRef?.(null);
  }, [openRef, show, available]);
  useWipeOn(close, resetKey);
  useEffect(() => {
    if (shown.current !== undefined && shown.current !== url) close();
  }, [url, close]);
  useEffect(() => () => { if (closeActive === close) closeActive = null; }, [close]);

  const label = available ? t('qr.button') : t('qr.unavailable');
  const live = open && shown.current !== undefined ? shown.current : undefined;
  return (
    <>
      <Pressable
        dir="row"
        shrink={0}
        onPress={() => (open ? close() : show())}
        disabled={!available}
        sem={{ role: 'button', name: label, expanded: open, ...(available ? {} : { disabled: true, disabledReason: t('qr.unavailable') }) }}
      >
        {({ focused }) => <Text colour={available ? 'ink' : 'faint'} {...focusInk(focused)}>[QR]</Text>}
      </Pressable>
      <Dialog isOpen={live !== undefined} onOpenChange={(o) => !o && close()} title={t('qr.title', { name })} size="xl" cancelLabel={t('qr.close')}>
        {live !== undefined && (
          <InDialog.Provider value>
          <QrPanel url={live} name={name} secret={secret} keyed={keyed} {...(reach !== undefined ? { reach } : {})} revealed={revealed} onRevealedChange={setRevealed} onClose={close} logo={logo} />
          </InDialog.Provider>
        )}
      </Dialog>
    </>
  );
};
