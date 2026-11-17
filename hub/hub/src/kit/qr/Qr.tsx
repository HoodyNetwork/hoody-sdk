// QrButton + QrPanel: a QR code for an address, in a popover next to the button, enlarged to a dialog, or a full-screen
// sheet on phones. QrCode draws a code alone; QrSecret wraps any code that carries a key with its badge and caption.
// The surfaces are the QR's own (not the kit Popover and Dialog) because one of them is open at a time across the page
// and each wipes what it drew when it closes.
//
// Secret addresses (every program address is one): until Show, the page draws neither the real
// code nor the address, only a blurred stand-in and `•••• •••• ••••`; Copy and Open work without
// Show, reading the address from memory. Once shown, the address is the kit's new-tab link (ExtLink, `revealed`: a
// button with no href). The caption under a keyed code says to share it only with people you trust, and its InfoTip
// says what the address reaches (`reach`). Everything drawn is wiped when the surface closes (×,
// Esc, outside click, route change, page hide, `resetKey` change such as a realm switch), and
// only one QR surface is open at a time. An address that changes while the surface is open
// closes it rather than showing the new one.
import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay, Popover as AriaPopover } from 'react-aria-components';
import { Button, IconButton, cx } from '../controls/Button';
import { ExtLink } from '../controls/Link';
import { useCopy } from '../data/Ids';
import { Icon } from '../icons';
import { useWipeOn } from '../forms/wipe';
import { InfoTip } from '../overlays/InfoTip';
import { useIsPhone } from '../overlays/shared';
import { useStrings } from '../strings';
import { BOT_LOGO_PATH, KEY_PATH, LOGO_PATH, matrixPath, qrMatrix, standInMatrix, type QrMatrix, type QrReachKind } from './qr';
// The marks' paths live in qr.ts (pure) so the terminal sibling shares them.
export { BOT_LOGO_PATH, KEY_PATH, LOGO_PATH } from './qr';
export type { QrReachKind } from './qr';
import strings from './strings.en.json';
import s from './Qr.module.css';

// The code is dark ink on a light ground in both themes so phones can scan it; never tinted.
// The raw colours are a listed exception (app/conformance/exceptions.ts): scanners need black on white.
const QR_LIGHT = '#ffffff';
// QR modules must be black on white to scan.
const QR_DARK = '#111111';
const QUIET = 4;
/** Which mark sits in the middle of a code: the Hoody mark (the pixel h), or the B on a Bot's address. */
export type QrLogoKind = 'hoody' | 'bot';
/** A kind the kit words, or the page's own sentence (a broadcast's viewer link: "Anyone with this link can watch ..."). */
export type QrReach = QrReachKind | { text: string };
/** The light ring between the code and the logo, in modules. */
const LOGO_RING = 0.5;

// The caption id of the QrSecret around a code (null outside one).
const SecretNote = createContext<string | null>(null);

/** The caption of the QrSecret this code sits in, for `aria-describedby` on a code that is not a QrCode (an image). */
export function useQrSecretNote(): string | undefined {
  return useContext(SecretNote) ?? undefined;
}

export interface QrCodeProps {
  matrix: QrMatrix;
  label: string;
  className?: string;
  logo?: QrLogoKind;
  /** The code carries a secret (a token, a key, or an address that grants access). Put it in a QrSecret, which draws
   *  the key badge above it and the caption under it; the code is described by that caption. The drawing itself never changes. Every page
   *  caller states it (qr.conformance.test.ts). */
  secret?: boolean;
}

/** An SVG QR code with its quiet zone, scaled to its box; the Hoody mark (or the Bot B) in the middle when the matrix
 *  leaves room. */
export function QrCode({ matrix, label, className, logo: kind = 'hoody', secret = false }: QrCodeProps) {
  const note = useQrSecretNote();
  const side = matrix.size + QUIET * 2;
  const d = useMemo(() => matrixPath(matrix, QUIET), [matrix]);
  const logo = matrix.logo;
  return (
    <svg className={className} viewBox={`0 0 ${side} ${side}`} role="img" aria-label={label} aria-describedby={secret ? note : undefined} shapeRendering="crispEdges">
      <rect width={side} height={side} fill={QR_LIGHT} />
      <path d={d} fill={QR_DARK} />
      {logo && (
        // The code's own ink and ground in both themes (a phone must read it); the cleared square stays light
        // around the mark as its ring.
        <svg
          x={logo.at + QUIET + LOGO_RING}
          y={logo.at + QUIET + LOGO_RING}
          width={logo.side - LOGO_RING * 2}
          height={logo.side - LOGO_RING * 2}
          viewBox={kind === 'bot' ? '0 0 24 24' : '1 1 22 22'}
          aria-hidden="true"
        >
          {kind === 'bot' ? (
            <>
              <rect width={24} height={24} fill={QR_DARK} />
              <path d={BOT_LOGO_PATH} fill={QR_LIGHT} shapeRendering="geometricPrecision" />
            </>
          ) : (
            <path fillRule="evenodd" d={LOGO_PATH} fill={QR_DARK} shapeRendering="geometricPrecision" />
          )}
        </svg>
      )}
    </svg>
  );
}

export interface QrImageProps {
  /** A QR code the API sent as an image: a `data:image/png` or `data:image/svg+xml` base64 URL. */
  src: string;
  alt: string;
  className?: string;
}

/** A QR code that reached the Hub only as an image (the 2FA setup answer). Inside a QrSecret it is described by the
 *  caption. The terminal reads the modules back from the image and draws them in cells. */
export function QrImage({ src, alt, className }: QrImageProps): ReactElement | null {
  const note = useQrSecretNote();
  return <img className={cx(s.image, className)} src={src} alt={alt} aria-describedby={note} />;
}

export interface QrSecretProps {
  /** The code's box: a QrCode (or an image) that states `secret`, or a box holding one. */
  children: ReactNode;
  /** The caption, when "contains a key, share it only with people you trust" is not the whole story (a 2FA key). */
  note?: string;
  /** What the code gives access to, in one or two sentences: with it (and no `note`) the trust sentence is an InfoTip
   *  that says so, on hover, keyboard focus and tap. */
  reach?: string;
  /** Sizes the box around the code (QrPanel: the variant's code size). */
  boxClassName?: string;
  /** The key badge above the box (default true). A QR panel leaves it out: its caption starts with the same key mark, and
   *  its slots stay one column with one left edge. */
  badge?: boolean;
  className?: string;
}

/** A code that carries a secret: the key badge above its box, the box as given, and the caption under it, which the code
 *  is described by. The badge is outside the code and its quiet zone, so the code is drawn and read exactly as without
 *  it, whatever its size (a centre mark fits only codes up to version 12). */
export function QrSecret({ children, note, reach, boxClassName, badge = true, className }: QrSecretProps) {
  const t = useStrings(strings);
  const id = useId();
  return (
    <SecretNote.Provider value={id}>
      <div className={cx(s.secret, className)}>
        {/* The badge and the box share a column, so the badge stays centred over the code wherever a page aligns the
            QrSecret (the account's 2FA column starts it at the left). The caption says it in words; the badge is its mark. */}
        <div className={s.secretStack}>
          {badge && (
            <span className={s.keyBadge} aria-hidden="true">
              <svg className={s.keyMark} viewBox="0 0 12 12" data-qr-key="">
                <rect width={12} height={12} fill={QR_DARK} />
                <path fillRule="evenodd" d={KEY_PATH} fill={QR_LIGHT} />
              </svg>
              <span>{t('qr.keyBadge')}</span>
            </span>
          )}
          <div className={cx(s.secretBox, boxClassName)}>{children}</div>
        </div>
        <p id={id} className={s.keyNote}>
          <Icon name="key" size="sm" />
          {note !== undefined || reach === undefined ? (
            <span>{note ?? t('qr.keyNote')}</span>
          ) : (
            <span>
              {t('qr.keyNoteLead')}{' '}
              <InfoTip text={reach} subject={t('qr.reachSubject')}>
                {t('qr.trust')}
              </InfoTip>
            </span>
          )}
        </p>
      </div>
    </SecretNote.Provider>
  );
}

// One QR surface at a time: opening one closes the one before.
let closeActive: (() => void) | null = null;

export interface QrPanelProps {
  url: string;
  /** What the address opens ("Terminal"); the title reads "QR code: Terminal". */
  name: string;
  /** Secret addresses start hidden (default true). */
  secret?: boolean;
  /** The address grants access, so the code wears the key badge and its caption (default: `secret`). An address shown
   *  at once can still grant access (a broadcast's viewer link). */
  keyed?: boolean;
  /** What the address reaches, said by the caption's InfoTip (a secret address with none: one program on the computer). */
  reach?: QrReach;
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
  /** `popover` 240 px code, `large` 440 px, `sheet` (phone) 280 px. */
  variant?: 'popover' | 'large' | 'sheet';
  /** Toggle between the popover and the large dialog; omitted on the sheet. */
  onToggleLarge?: () => void;
  onClose: () => void;
  /** The mark in the middle: 'bot' on a Bot's address (default 'hoody'). */
  logo?: QrLogoKind;
}

/** The body of a QR surface. QrButton hosts it; use it directly only inside your own overlay. */
export function QrPanel({ url, name, secret = true, keyed = secret, reach, revealed, onRevealedChange, variant = 'popover', onToggleLarge, onClose, logo = 'hoody' }: QrPanelProps) {
  const t = useStrings(strings);
  const [copyState, copy] = useCopy();
  const visible = !secret || revealed;
  const matrix = useMemo(() => (visible ? qrMatrix(url) : null), [visible, url]);
  const standIn = useMemo(() => standInMatrix(), []);
  const open = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  // A secret code always says what the address reaches (one program on the computer when the caller names nothing). A
  // code shown at once that still grants access (a broadcast's viewer link) says it when its page does.
  const reachText = typeof reach === 'object' ? reach.text : reach !== undefined || secret ? t(`qr.reach.${reach ?? 'program'}`) : undefined;
  const buttonSize = variant === 'sheet' ? 'md' : 'sm';
  // `s` toggles Show while focus is inside the surface.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || !secret) return;
    const onKey = (e: KeyboardEvent) => {
      // A held key repeats: only its first press toggles, so holding s never flickers the secret.
      if (e.key !== 's' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      onRevealedChange(!revealed);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [secret, revealed, onRevealedChange]);
  return (
    // One column of fixed slots, one left edge for all: head (title | size | close), code, caption, address, actions.
    <div ref={root} className={cx(s.panel, s[variant])}>
      <div className={s.head}>
        <Heading slot="title" className={s.title}>
          {t('qr.title', { name })}
        </Heading>
        {/* Larger and smaller sit with the surface's own controls, beside Close: the size of what is shown, not an action on
            the address. */}
        {onToggleLarge &&
          (variant === 'large' ? (
            <IconButton icon="minimize" size="sm" label={t('qr.shrink')} onPress={onToggleLarge} />
          ) : (
            <IconButton icon="maximize" size="sm" label={t('qr.enlarge')} onPress={onToggleLarge} />
          ))}
        <IconButton icon="x" size="sm" label={t('qr.close')} onPress={onClose} />
      </div>
      {/* The four QrCode elements below stay literal JSX: qr.conformance.test.ts reads each one's `secret` and its QrSecret
          parent from the syntax tree, and a helper function or a shared variable would hide both from it. */}
      {keyed ? (
        <QrSecret boxClassName={s.codeSize} badge={false} className={s.panelSecret} {...(reachText !== undefined ? { reach: reachText } : {})}>
          <div className={s.codeBox}>
            {matrix ? (
              <QrCode matrix={matrix} label={t('qr.codeLabel')} className={s.code} logo={logo} secret />
            ) : (
              <QrCode matrix={standIn} label={t('qr.hiddenCodeLabel')} className={cx(s.code, s.blurred)} logo={logo} secret />
            )}
          </div>
        </QrSecret>
      ) : (
        <div className={cx(s.codeSize, s.codeBox)}>
          {matrix ? (
            <QrCode matrix={matrix} label={t('qr.codeLabel')} className={s.code} logo={logo} secret={false} />
          ) : (
            <QrCode matrix={standIn} label={t('qr.hiddenCodeLabel')} className={cx(s.code, s.blurred)} logo={logo} secret={false} />
          )}
        </div>
      )}
      {/* Shown: the kit's new-tab link, the address itself as its words (revealed), still no href. Hidden: no link and
          nothing of the address. */}
      <div className={s.addressSlot}>
        {visible ? (
          <p className={s.address} translate="no">
            <ExtLink url={url} secret={secret || keyed} revealed look="nav" icon={false} />
          </p>
        ) : (
          <>
            <p className={cx(s.address, s.masked)} aria-hidden="true">
              {t('qr.mask')}
            </p>
            <p className={s.status} role="status">
              {t('qr.hidden')}
            </p>
          </>
        )}
      </div>
      <div className={s.actions}>
        {secret && (
          <Button size={buttonSize} variant={revealed ? 'secondary' : 'primary'} icon={revealed ? 'eye-off' : 'eye'} onPress={() => onRevealedChange(!revealed)} aria-keyshortcuts="s">
            {revealed ? t('qr.hide') : t('qr.show')}
          </Button>
        )}
        {/* One primary: Show while the address is hidden, then Copy (scanning needs no button; Copy is the way on). */}
        <Button size={buttonSize} variant={visible ? 'primary' : 'secondary'} icon={copyState === 'copied' ? 'check' : 'copy'} onPress={() => copy(url)}>
          {copyState === 'copied' ? t('qr.copied') : copyState === 'failed' ? t('qr.copyFailed') : t('qr.copy')}
        </Button>
        <Button size={buttonSize} icon="external" onPress={open}>
          {t('qr.open')}
        </Button>
      </div>
    </div>
  );
}

export interface QrButtonProps {
  /** The address. Undefined (not known yet) or not https / too long: the button is disabled. */
  url: string | undefined;
  /** What the address opens ("Terminal"). */
  name: string;
  /** Secret addresses start hidden behind Show (default true: every program address is secret). */
  secret?: boolean;
  /** The address grants access: the code wears the key badge and its caption (default: `secret`). */
  keyed?: boolean;
  /** What the address reaches, for the caption's InfoTip (a secret address with none: one program on the computer). */
  reach?: QrReach;
  /** Closes and wipes an open surface when it changes (pass the realm id). */
  resetKey?: string;
  /** Keyboard hint for the tooltip ("Alt+Q"); the page binds the key and calls `openRef`. */
  shortcut?: string;
  size?: 'sm' | 'md';
  /** Receives a function that opens the surface (for a page-level shortcut). */
  openRef?: (open: (() => void) | null) => void;
  className?: string;
  /** The mark in the middle of the code: 'bot' on a Bot's address (default 'hoody'). */
  logo?: QrLogoKind;
}

/** An icon button (the kit's icon-only ghost look, `size` md or sm) that opens the QR surface for one address. */
export function QrButton({ url, name, secret = true, keyed = secret, reach, resetKey, shortcut, size = 'md', openRef, className, logo = 'hoody' }: QrButtonProps) {
  const t = useStrings(strings);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<'closed' | 'popover' | 'large'>('closed');
  const [revealed, setRevealed] = useState(false);
  const shown = useRef<string | undefined>(undefined);
  const phone = useIsPhone();
  const available = useMemo(() => qrMatrix(url) !== null, [url]);

  const close = useCallback(() => {
    shown.current = undefined;
    setRevealed(false);
    setMode((m) => {
      if (m !== 'closed' && document.activeElement === document.body) requestAnimationFrame(() => triggerRef.current?.focus());
      return 'closed';
    });
    if (closeActive === close) closeActive = null;
  }, []);

  const open = useCallback(() => {
    if (!url || !available) return;
    if (closeActive && closeActive !== close) closeActive();
    closeActive = close;
    shown.current = url;
    setRevealed(false);
    setMode(phone ? 'large' : 'popover');
  }, [url, available, phone, close]);

  useEffect(() => {
    openRef?.(available ? open : null);
    return () => openRef?.(null);
  }, [openRef, open, available]);

  // Wipe with the kit's secret signal (route change, resetKey, page hide, core ending the context: realm
  // switch, sign-out), when the tab is hidden, and when the address changes.
  useWipeOn(close, resetKey);
  useEffect(() => {
    if (shown.current !== undefined && shown.current !== url) close();
  }, [url, close]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') close();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (closeActive === close) closeActive = null;
    };
  }, [close]);

  const label = available ? t('qr.button') : t('qr.unavailable');
  const live = mode !== 'closed' && shown.current !== undefined ? shown.current : undefined;
  const panel = (variant: 'popover' | 'large' | 'sheet'): ReactNode =>
    live !== undefined && (
      <QrPanel
        url={live}
        name={name}
        secret={secret}
        keyed={keyed}
        {...(reach !== undefined ? { reach } : {})}
        revealed={revealed}
        onRevealedChange={setRevealed}
        variant={variant}
        onToggleLarge={variant === 'sheet' ? undefined : () => setMode((m) => (m === 'large' ? 'popover' : 'large'))}
        onClose={close}
        logo={logo}
      />
    );

  return (
    <>
      {/* An address with no code keeps the button focusable (aria-disabled, the kit's disabled look): its name says why. */}
      <IconButton
        ref={triggerRef}
        icon="qr"
        label={label}
        size={size}
        shortcut={available ? shortcut : undefined}
        aria-disabled={available ? undefined : 'true'}
        aria-expanded={mode !== 'closed'}
        aria-haspopup="dialog"
        onPress={() => (mode === 'closed' ? open() : close())}
        className={className}
      />
      <AriaPopover
        triggerRef={triggerRef}
        isOpen={mode === 'popover' && live !== undefined}
        onOpenChange={(o) => !o && close()}
        placement="bottom end"
        offset={6}
        className={s.popover}
      >
        <Dialog className={s.dialog} aria-label={t('qr.title', { name })}>
          {panel('popover')}
        </Dialog>
      </AriaPopover>
      <ModalOverlay isOpen={mode === 'large' && live !== undefined} onOpenChange={(o) => !o && close()} isDismissable className={s.scrim}>
        <Modal className={cx(s.modal, phone && s.sheetModal)}>
          <Dialog className={s.dialog} aria-label={t('qr.title', { name })}>
            {panel(phone ? 'sheet' : 'large')}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
