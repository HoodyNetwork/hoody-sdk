// The Home card's launch strip ("Your computer"): the five programs as joined cells, each a head (icon over name, a
// new-tab mark) over its actions band (copy, QR, Put on Board). Its own file so the terminal can draw it its own way
// (ProgramStrip.term.tsx); the markup and classes are the card's as they were (parts.module.css .tiles).
import { CopyButton, Icon, QrButton, useStrings, type IconName, openOutside, qrReachOf } from '@kit';
import { BoardAddButton } from '../../board/links';
import { subjectOf } from '../data';
import { PROGRAMS, SLUG, type ProgramLink } from '../logic';
import strings from '../strings.en.json';
import type { Computer } from '../types';
import { programUrl } from '../urls';
import s from './parts.module.css';

const ICON: Record<ProgramLink, IconName> = { agent: 'agent', terminal: 'terminal', screen: 'display', files: 'files', browser: 'browser' };

export function ProgramStrip({ computer: c, running }: { computer: Computer; running: boolean }) {
  const t = useStrings(strings);
  return (
    <div className={s.tiles}>
      {PROGRAMS.map((p) => {
        const url = programUrl(c, p);
        return (
          <div key={p} className={s.stripCell}>
            <button type="button" className={s.stripTile} disabled={!running || !url} onClick={() => url && openOutside(url)}>
              <Icon name={ICON[p]} />
              <span className={s.useText}>
                <strong>{t(`program.${p}`)}</strong>
              </span>
              {/* A press opens a new tab: the mark says so (decorative; the tile's name stays the program's). */}
              <Icon name="external" size="sm" className={s.stripGo} />
            </button>
            {/* The same fixed actions row as the Overview's Open on tiles: under the tile, never
                over it, quiet at rest and full on hover or focus; an open QR keeps its anchor. */}
            {running && url ? (
              <div className={`${s.useActions} ${s.stripActions}`} role="group" aria-label={t('use.actions', { what: t(`program.${p}`) })}>
                <CopyButton text={url} size="md" label={t('copy.what', { what: t(`program.${p}`) })} />
                <QrButton url={url} name={t(`program.${p}`)} size="md" reach={qrReachOf(SLUG[p])} resetKey={c.id} />
                <BoardAddButton computer={subjectOf(c)} program={p} what={t(`program.${p}`)} size="md" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
