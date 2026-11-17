// The intro panel of a dashboard: what the product is in one line, its first actions, and the person's own computer
// on a dotted world map. The text column (eyebrow, the line set in phrase lines, the actions) is at the start; the
// map bleeds in from the end edge with the computer pinned at its place, a small copy of its card beside the pin, and
// the ways in wired to it. Without a computer the map is shown alone; without a place the card is shown with no pin.
// The whole stage is a picture (aria-hidden): the page names the computer and its state in its own header.
import { forwardRef, useMemo, type ReactNode, type Ref } from 'react';
import { Icon, type IconName } from '../icons';
import { Widget } from '../layouts/Layouts';
import { phraseLines } from './IntroPanel.pure';
import { WORLD_W, worldPath } from './worldDots';
import s from './IntroPanel.module.css';

export interface IntroPanelComputer {
  name: string;
  /** Its state word, as the page draws it (a StatusPill). */
  state: ReactNode;
  /** The card's tiles in order; the first one is lit. */
  tiles: readonly { icon: IconName; label: string }[];
  /** Where it is on the map, in percent of the world (x from the west edge, y from the top). Absent: no pin. */
  place?: { x: number; y: number };
}

export interface IntroPanelProps {
  /** The id of the line, for the panel's name. */
  labelId: string;
  eyebrow: string;
  /** The one line; it is set in phrase lines (a break after each comma or full stop). */
  lead: string;
  /** The first actions, under the line. */
  actions: ReactNode;
  /** The Hide control, on its plate at the top end corner. */
  hide: ReactNode;
  computer?: IntroPanelComputer;
  /** The ways in drawn above the card, each wired to the pin (up to three). */
  ways?: readonly IconName[];
}

// The stage's own units: the map's view box. The pin always sits at PIN_X (the world turns under it); its height is
// the place's.
const VIEW_W = 980;
const VIEW_H = 423.4;
const VIEW_X = 40;
const VIEW_Y = 10;
const PIN_X = 748.3;
/** The card's edge the pin line leaves from. */
const CARD_AT = { x: 700, y: 236.7 };
/** Where each way's plate sits, in stage units (its centre). */
const WAY_AT = [
  { x: 182.2, y: 76.6 },
  { x: 258.7, y: 135.8 },
  { x: 488.9, y: 88.2 },
] as const;
const WORLD_H_UNITS = 432;
const round = (n: number): number => Math.round(n * 10) / 10;

export const IntroPanel = forwardRef<HTMLElement, IntroPanelProps>(function IntroPanel({ labelId, eyebrow, lead, actions, hide, computer, ways = [] }, ref) {
  const land = useMemo(worldPath, []);
  const place = computer?.place;
  // The world's offset: with a pin its longitude lands on PIN_X, else the map shows its resting view.
  const shift = place ? (((PIN_X - (place.x / 100) * WORLD_W) % WORLD_W) + WORLD_W) % WORLD_W : WORLD_W - VIEW_X;
  const pinY = place ? (place.y / 100) * WORLD_H_UNITS - VIEW_Y : 0;
  return (
    <Widget size="l" flush fit className={s.card}>
      <div ref={ref as Ref<HTMLDivElement>} role="group" className={s.root} aria-labelledby={labelId} tabIndex={-1}>
        <div className={s.text}>
          <p className={s.eyebrow}>{eyebrow}</p>
          {/* One text, a line break after each phrase (the CSS keeps the breaks). */}
          <p id={labelId} className={s.lead}>
            {phraseLines(lead).join('\n')}
          </p>
          <div className={s.actions}>{actions}</div>
        </div>
        <div className={s.stage} aria-hidden="true" data-intro-stage="">
          <div className={s.stageIn}>
            <svg className={s.map} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
              <path className={s.land} d={land} transform={`translate(${round(shift - WORLD_W)} ${-VIEW_Y})`} />
              <path className={s.land} d={land} transform={`translate(${round(shift)} ${-VIEW_Y})`} />
              {computer && place && (
                <>
                  {ways.slice(0, WAY_AT.length).map((way, i) => {
                    const from = WAY_AT[i] as { x: number; y: number };
                    return <path key={way} className={s.wire} d={`M${from.x},${from.y} Q${round((from.x + PIN_X) / 2)},${round(from.y - 90)} ${PIN_X},${round(pinY)}`} />;
                  })}
                  <path className={s.pinLine} d={`M${CARD_AT.x},${CARD_AT.y} L${PIN_X},${round(pinY)}`} />
                  <circle className={s.halo} cx={PIN_X} cy={round(pinY)} r={18} />
                  <circle className={s.pin} cx={PIN_X} cy={round(pinY)} r={6} />
                </>
              )}
            </svg>
            {computer && (
              <>
                {ways.slice(0, WAY_AT.length).map((way, i) => (
                  <span key={way} className={`${s.way} ${s[`way${i}`]}`}>
                    <Icon name={way} size="sm" />
                  </span>
                ))}
                <div className={s.mini}>
                  <div className={s.miniHead}>
                    <strong className={s.miniName}>{computer.name}</strong>
                    {computer.state}
                  </div>
                  <div className={s.tiles}>
                    {computer.tiles.map((tile, i) => (
                      <span key={tile.label} className={i === 0 ? `${s.tile} ${s.tileLit}` : s.tile}>
                        <Icon name={tile.icon} size="sm" />
                        <span className={s.tileName}>{tile.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <span className={s.hide}>{hide}</span>
      </div>
    </Widget>
  );
});
