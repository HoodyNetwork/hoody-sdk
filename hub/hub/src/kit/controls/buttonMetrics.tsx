// The width a column needs for the widest kit Button it can show: measured from real kit Buttons drawn where the
// caller's own Buttons sit, so the case, the tracking, the language, a fallback face for a script the main font lacks,
// the inherited tokens, a ButtonStrip, the padding, the border, the icons and the end glyph are all the Button's own,
// never a canvas guess at them. Use it when a column or grid track must fit a set of button labels before they show.
import { type ReactElement, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { IconName } from '../icons';
import { useFontsReady } from '../data/fontsReady';
import { Button, LinkButton, type ButtonLook, type ButtonSize, type ButtonVariant } from './Button';
import s from './buttonMetrics.module.css';

/** One label with what its Button shows besides it: `busy` draws the spinner in the start icon's place, as a busy
 *  Button does; `shortcut` is the key cap shown after the label ('Mod+J'). */
export interface ButtonLabelSpec {
  label: string;
  icon?: IconName;
  iconEnd?: IconName;
  busy?: boolean;
  shortcut?: string;
}
export type ButtonLabel = string | ButtonLabelSpec;

/**
 * The look every label is measured in: the kit Button's own props and defaults (variant 'secondary', size 'md', the
 * automatic end glyph), plus the className the caller's Buttons carry. `link` measures kit LinkButtons instead of
 * Buttons (a LinkButton keeps its glyph inside a ButtonStrip), for a column of links; a LinkButton has no busy or
 * shortcut, so those label fields are not drawn there.
 */
export interface ButtonLabelsOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  chip?: boolean;
  literal?: boolean;
  className?: string;
  link?: boolean;
}

/** The width, and the probe that measures it (render it, once, where the measured Buttons sit). */
export interface ButtonLabelsWidth {
  width: number | null;
  probe: ReactElement;
}

type Look = { variant: ButtonVariant; size: ButtonSize; chip?: boolean; literal: boolean; className?: string; link: boolean };
type Measured = { key: string; w: number };

function specOf(l: ButtonLabel): ButtonLabelSpec {
  return typeof l === 'string' ? { label: l } : { label: l.label, icon: l.icon, iconEnd: l.iconEnd, busy: l.busy || undefined, shortcut: l.shortcut || undefined };
}

/**
 * The probe: one kit Button per label in a hidden holder, in the caller's own tree (its context, language and inherited
 * styles). It reports the widest border box, rounded up, under its key: once the fonts are ready, and again whenever a
 * Button's box changes size (a font that loads later, a theme, language, token or pointer change), by ResizeObserver.
 */
function ButtonLabelsProbe({ k, specs, look, onWidth }: { k: string; specs: readonly ButtonLabelSpec[]; look: Look; onWidth: (m: Measured | null) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const ready = useFontsReady();
  useLayoutEffect(() => {
    const holder = ref.current;
    if (!holder || !ready) return;
    const buttons = [...holder.querySelectorAll<HTMLElement>(':scope > span > :first-child')];
    const measure = () => onWidth({ key: k, w: Math.ceil(buttons.reduce((w, b) => Math.max(w, b.getBoundingClientRect().width), 0)) });
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
    for (const b of buttons) ro?.observe(b, { box: 'border-box' });
    // A probe that goes (unmounted, or replaced for other labels) takes its width with it: the hook is null again until a
    // probe measures, so a removed probe never leaves a width that later style changes could outgrow.
    return () => {
      ro?.disconnect();
      onWidth(null);
    };
  }, [k, ready, onWidth]);
  // A union-typed variant with a chip choice: ButtonLook is the props pair a wrapper that picks them passes (Dialog's).
  const pick = { variant: look.variant, chip: look.chip } as ButtonLook;
  return (
    <span className={s.box} aria-hidden="true" data-kit-probe="button-labels">
      <span ref={ref} className={s.probe} inert>
        {/* Each in its own item, so every probe stands first among its siblings: inside a ButtonStrip the first keeps its
            start border and the rest lose it, so the first is the widest box any position draws. */}
        {specs.map((b, i) => (
          <span key={i} className={s.item}>
            {look.link ? (
              <LinkButton {...pick} href="#/" size={look.size} icon={b.icon} iconEnd={b.iconEnd} literal={look.literal} className={look.className}>
                {b.label}
              </LinkButton>
            ) : (
              <Button
                {...pick}
                size={look.size}
                icon={b.icon}
                iconEnd={b.iconEnd}
                busy={b.busy}
                shortcut={b.shortcut}
                literal={look.literal}
                className={look.className}
                excludeFromTabOrder
              >
                {b.label}
              </Button>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * The width in px (whole, rounded up) of the widest kit Button showing one of `labels` in the look `opts` names: what a
 * column sized to its widest action needs. Render `probe` once where those Buttons sit (the same container, so the same
 * context, language and inherited styles); it is hidden, inert and takes no room.
 *
 * `width` is null until the probe has measured these labels in this look with the fonts ready (useFontsReady), so a
 * caller keeps its own floor while it is null. It is never a width measured for other labels: when `labels` or `opts`
 * change by value it is null until the probe measures them, which happens in the same commit, before paint, and it is null
 * again once the probe is no longer rendered. A new array of the same labels measures nothing. It follows a Button's box when it changes size later (a font that loads, a theme,
 * language or token change, the coarse touch minimum). No labels measure 0. Without the probe rendered it stays null.
 */
export function useButtonLabelsWidth(labels: readonly ButtonLabel[], opts: ButtonLabelsOptions = {}): ButtonLabelsWidth {
  const key = JSON.stringify([
    labels.map(specOf),
    { variant: opts.variant ?? 'secondary', size: opts.size ?? 'md', chip: opts.chip, literal: !!opts.literal, className: opts.className, link: !!opts.link },
  ]);
  const [specs, look] = useMemo(() => JSON.parse(key) as [ButtonLabelSpec[], Look], [key]);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const onWidth = useCallback((m: Measured | null) => setMeasured((p) => (p === m || (p && m && p.key === m.key && p.w === m.w) ? p : m)), []);
  const probe = useMemo(() => <ButtonLabelsProbe k={key} specs={specs} look={look} onWidth={onWidth} />, [key, specs, look, onWidth]);
  return { width: measured && measured.key === key ? measured.w : null, probe };
}
