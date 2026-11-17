// The terminal and agent live preview: a sample drawn by the Hub from the draft (font,
// size, line height, spacing, theme, background, cursor, bold in bright colours). No frame, no session, no token:
// nothing is sent before Save. Colours go through colour-only style properties, so a typed value can only paint.
import type { CSSProperties } from 'react';
import type { Params } from './model';
import { PREVIEW_DEFAULTS, type TermTheme } from './themes';
import type { TT } from './Rows';
import s from './options.module.css';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function themeOf(p: Params): TermTheme {
  const t = p.theme && typeof p.theme === 'object' && !Array.isArray(p.theme) ? (p.theme as Record<string, unknown>) : {};
  const base = PREVIEW_DEFAULTS.theme;
  const out: Record<string, string> = {};
  for (const k of Object.keys(base) as Array<keyof TermTheme>) out[k] = str(t[k]) ?? base[k];
  return out as unknown as TermTheme;
}

export function Preview({ params: p, t }: { params: Params; t: TT }) {
  const th = themeOf(p);
  const fontSize = num(p.fontSize) ?? PREVIEW_DEFAULTS.fontSize;
  const style: CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: num(p.lineHeight) ?? PREVIEW_DEFAULTS.lineHeight,
    letterSpacing: `${num(p.letterSpacing) ?? PREVIEW_DEFAULTS.letterSpacing}px`,
    color: th.foreground,
    backgroundColor: str(p.backgroundColor) ?? th.background,
    fontWeight: str(p.fontWeight),
  };
  if (str(p.fontFamily)) style.fontFamily = str(p.fontFamily);
  const bold: CSSProperties = { fontWeight: str(p.fontWeightBold) ?? 'bold', color: p.drawBoldTextInBrightColors === true ? th.brightWhite : th.foreground };
  const shape = str(p.cursorStyle) ?? 'block';
  const cursor: CSSProperties = shape === 'bar' ? { borderInlineStartColor: th.cursor, borderInlineStartWidth: `${num(p.cursorWidth) ?? 1}px` } : shape === 'underline' ? { borderBlockEndColor: th.cursor } : { backgroundColor: th.cursor };
  return (
    <figure className={s.preview} aria-label={t('preview.label')}>
      <div className={s.term} style={style} aria-hidden="true">
        <div>
          <span style={{ color: th.green }}>{t('preview.prompt')}</span> {t('preview.command')}
        </div>
        <div className={s.termRow}>
          <span style={{ color: th.blue }}>{t('preview.dir1')}</span>
          <span style={{ color: th.blue }}>{t('preview.dir2')}</span>
          <span>{t('preview.file1')}</span>
          <span style={{ color: th.green }}>{t('preview.file2')}</span>
        </div>
        <div>
          <span style={bold}>{t('preview.bold')}</span>
        </div>
        <div>
          <span style={{ color: th.green }}>{t('preview.prompt')}</span>{' '}
          <span className={shape === 'bar' ? s.cursorBar : shape === 'underline' ? s.cursorLine : s.cursorBlock} data-blink={p.cursorBlink === true || undefined} style={cursor} />
        </div>
      </div>
      <figcaption className={s.caption}>{t('preview.caption')}</figcaption>
    </figure>
  );
}
