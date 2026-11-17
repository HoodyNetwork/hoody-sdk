// HGrid.tsx: the backdrop of the standalone Hub's sign-in screens (Card.tsx), the hoody.com page grid: faint lines
// every 80 px with a small "H" mark in each cell, drawn in the page ink behind the card. Under a mouse the mark of the
// cell the pointer is in lights up in the accent, flickers for a moment and fades; a cell the pointer left shows as a
// soft accent tile that fades away (the trail).
//
// Contract:
//   - Decoration only: one aria-hidden <svg> with no text, no focus and no pointer events, under everything else on
//     the screen (FirstRun.module.css .screen is its own stacking context). The card keeps its own ground.
//   - A mark is shown whole or not at all: every mark that touches `avoid` (the column holding the card and the line
//     under it) is hidden, so the card's edge never cuts one and no mark sits under the line; so is a mark the
//     screen's own edge would cut (on a narrow screen the gutters beside the card hold lines only). Grid lines are
//     not hidden.
//   - A column of marks sits on the page's centre line, so the grid is the same on both sides of the card.
//   - It sizes to the screen it is in and never widens it: the <svg> is the screen's box and clips its own content.
//   - Motion only for a mouse, and not under reduced motion or Performance mode (no listener work then; the
//     durations are tokens those two empty, and HGrid.module.css hides the lit marks as well).
//   - Colours are tokens (HGrid.module.css): --hx-ink for the grid, --hx-acc for a lit mark, --hx-acc-soft for a
//     trail tile. A tile starts as faint as its mark had become: that share is the one value set from here, as a
//     custom property through the element's style object (never style markup).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import s from './HGrid.module.css';

/** One cell, the mark's corner inside it, the mark's side and the clear margin a mark keeps from `avoid`. */
const CELL = 80;
const AT = 28;
const MARK = 24;
const KEEP = 2;
/** Lit cells kept at once (the one under the pointer and its trail). */
const TRAIL = 8;
/** How long a lit mark takes to fade (HGrid.module.css: 1.2 x --dur-4). */
const FADE_MS = 1440;
/** The mark on a 24 grid: two legs, each with a gap under the bar, and the bar. */
const BARS = ['M0 0h4v14H0z', 'M0 18h4v6H0z', 'M20 0h4v14h-4z', 'M20 18h4v6h-4z', 'M4 14h16v4H4z'];
const LO = AT - KEEP;
const HI = AT + MARK + KEEP;

interface Fit {
  w: number;
  h: number;
  /** Where the first column of cells starts (at or before 0): a cell's middle is on the centre line. */
  x: number;
  /** The squares cut out of the marks layer, as path data. */
  cut: string;
}
interface Lit {
  k: number;
  x: number;
  y: number;
  /** When the mark lit. */
  at: number;
  /** Null while the pointer is in the cell; once it left, the share of the mark's light that was still there. */
  left: number | null;
}
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

const NONE: Fit = { w: 0, h: 0, x: 0, cut: '' };

const firstColumn = (width: number): number => ((((Math.floor(width / 2) - CELL / 2) % CELL) + CELL) % CELL) - CELL;

/** `avoid`'s box in the grid's own coordinates, or null while either has no size. */
function avoidBox(grid: DOMRect, avoid: Element | null): Box | null {
  const a = avoid?.getBoundingClientRect();
  if (!a || !(a.width > 0) || !(a.height > 0)) return null;
  return { l: a.left - grid.left, t: a.top - grid.top, r: a.right - grid.left, b: a.bottom - grid.top };
}

/** The mark of the cell at (x, y) is not drawn: the grid's edge would cut it, or it touches the box (with its margin). */
const hidden = (box: Box | null, w: number, h: number, x: number, y: number): boolean =>
  x + AT < 0 || x + AT + MARK > w || y + AT + MARK > h || (box !== null && x + HI > box.l && x + LO < box.r && y + HI > box.t && y + LO < box.b);

function measure(svg: SVGSVGElement, avoid: Element | null): Fit {
  const g = svg.getBoundingClientRect();
  if (!(g.width > 0) || !(g.height > 0)) return NONE;
  const x = firstColumn(g.width);
  const box = avoidBox(g, avoid);
  let cut = '';
  for (let cx = x; cx < g.width; cx += CELL) {
    for (let cy = 0; cy < g.height; cy += CELL) {
      if (hidden(box, g.width, g.height, cx, cy)) cut += `M${cx + LO} ${cy + LO}h${HI - LO}v${HI - LO}h${LO - HI}z`;
    }
  }
  return { w: g.width, h: g.height, x, cut };
}

export interface HGridProps {
  /** The element no mark may touch: the column with the card and the line under it. The element itself, null until
   *  it exists: the grid is drawn before it, so a ref would still be empty when the grid first measures, and the
   *  grid measures again whenever this element or its box changes. */
  avoid: Element | null;
}

export function HGrid({ avoid }: HGridProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [fit, setFit] = useState<Fit>(NONE);
  const [lit, setLit] = useState<Lit[]>([]);

  // The grid follows the screen's size and the column's box (the card grows and shrinks with its state): both are
  // observed, and the effect runs again when the column element arrives or changes.
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const read = (): void => {
      const next = measure(svg, avoid);
      setFit((prev) => (prev.w === next.w && prev.h === next.h && prev.x === next.x && prev.cut === next.cut ? prev : next));
    };
    read();
    window.addEventListener('resize', read);
    let watch: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      watch = new ResizeObserver(read);
      watch.observe(svg);
      if (avoid) watch.observe(avoid);
    }
    return () => {
      window.removeEventListener('resize', read);
      watch?.disconnect();
    };
  }, [avoid]);

  // The lit mark: the cell under a mouse pointer, on the open page only.
  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof window.matchMedia !== 'function') return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let last = '';
    let n = 0;
    /** The cell the pointer was in becomes a trail tile; one whose mark had faded out is dropped. */
    const trail = (cells: Lit[]): Lit[] => {
      const now = performance.now();
      return cells.flatMap((c) => {
        if (c.left !== null) return [c];
        const left = 1 - (now - c.at) / FADE_MS;
        return left > 0 ? [{ ...c, left: Math.round(left * 100) / 100 }] : [];
      });
    };
    const leaveCell = (): void => {
      last = '';
      setLit((prev) => (prev.some((c) => c.left === null) ? trail(prev) : prev));
    };
    const move = (e: PointerEvent): void => {
      if (!fine.matches || still.matches || document.documentElement.getAttribute('data-hx-perf') === 'on') return;
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const g = svg.getBoundingClientRect();
      if (!(g.width > 0) || !(g.height > 0) || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      const over = avoid;
      if (over && e.target instanceof Node && over.contains(e.target)) {
        leaveCell();
        return;
      }
      const first = firstColumn(g.width);
      const x = Math.floor((e.clientX - g.left - first) / CELL) * CELL + first;
      const y = Math.floor((e.clientY - g.top) / CELL) * CELL;
      const key = `${x},${y}`;
      if (key === last) return;
      last = key;
      if (hidden(avoidBox(g, over), g.width, g.height, x, y)) {
        leaveCell();
        last = key;
        return;
      }
      n += 1;
      const k = n;
      const at = performance.now();
      setLit((prev) => [...trail(prev).filter((c) => c.x !== x || c.y !== y), { k, x, y, at, left: null }].slice(-TRAIL));
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('mouseleave', leaveCell);
    return () => {
      document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('mouseleave', leaveCell);
    };
  }, [avoid]);

  return (
    <svg ref={ref} className={s.grid} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="hgrid-lines" x={fit.x} y={0} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path className={s.line} d="M0 .5H80M.5 0V80" />
          <path className={s.tick} d="M76 .5h4M0 .5h4M.5 76v4M.5 0v4" />
        </pattern>
        <pattern id="hgrid-marks" x={fit.x} y={0} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path className={s.mark} transform={`translate(${AT} ${AT})`} d={BARS.join('')} />
        </pattern>
        <clipPath id="hgrid-cut">
          <path clipRule="evenodd" d={`M0 0H${fit.w}V${fit.h}H0z${fit.cut}`} />
        </clipPath>
      </defs>
      <rect width="100%" height="100%" fill="url(#hgrid-lines)" />
      <rect width="100%" height="100%" fill="url(#hgrid-marks)" clipPath={fit.w > 0 ? 'url(#hgrid-cut)' : undefined} />
      {lit.map((c) =>
        c.left === null ? (
          <g key={c.k} className={s.lit} transform={`translate(${c.x + AT} ${c.y + AT})`}>
            {BARS.map((d) => (
              <path key={d} className={s.bar} d={d} />
            ))}
          </g>
        ) : (
          <rect key={c.k} className={s.tile} x={c.x} y={c.y} width={CELL} height={CELL} style={{ '--hgrid-left': c.left } as CSSProperties} />
        ),
      )}
    </svg>
  );
}
