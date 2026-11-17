// BrandMark: the Hoody Hub logo as one treatment, drawn the same wherever the Hub names itself: `sm` beside the
// navigation and on the lock screen, `lg` at the top of a sign-in card. The art is the brand's own horizontal logo
// (the square mark, "Hoody" bold and "Hub" light, the words drawn as paths), its shapes unchanged, in one inline SVG
// filled with currentColor: the square and the words take the text colour of the place, and the pixel "h" is cut out
// of the square, so it is the ground the logo sits on (the brand's on-light and on-dark variants in one drawing,
// following the theme and forced colours). The SVG is decoration; the name is one line of visually hidden text with a
// real space, so a reader and a copy get "Hoody Hub".
// A caller whose heading already names the place hides the whole brand on its own wrapper (aria-hidden).
import { cx } from '../controls/Button';
import { SR_ONLY } from '../controls/SrOnly';
import { useStrings } from '../strings';
import strings from './BrandMark.strings.en.json';
import s from './BrandMark.module.css';

/** The square with the "h" cut out (evenodd), on the logo's 64-unit height: the art's rect and h, one path. */
export const BRAND_MARK_PATH = 'M0 0h64v64H0zM10 10h8v24h-8zM10 42h8v12h-8zM18 34h36v20h-8V42H18z';
/** The words sit 20 units after the square, drawn at 1.2 times their own size about (84, 34), as in the art. */
const WORDS_TRANSFORM = 'translate(84 34) scale(1.2) translate(-84 -34)';
/** "Hoody", bold: H, o, o, d, y (the art's paths, verbatim). */
const HOODY = [
  'M84 44V17H89V28H104V17H109V44H104V33H89V44H84Z',
  'M112 28.36V38.65C112 41.61 114.4 44.01 117.36 44.01H127.65C130.61 44.01 133.01 41.61 133.01 38.65V28.36C133.01 25.4 130.61 23 127.65 23H117.36C114.4 23 112 25.4 112 28.36ZM128 39H117V28H128V39Z',
  'M136 28.36V38.65C136 41.61 138.4 44.01 141.36 44.01H151.65C154.61 44.01 157.01 41.61 157.01 38.65V28.36C157.01 25.4 154.61 23 151.65 23H141.36C138.4 23 136 25.4 136 28.36ZM152 39H141V28H152V39Z',
  'M160 28.36V38.65C160 41.61 162.4 44.01 165.36 44.01H175.65C178.61 44.01 181.01 41.61 181.01 38.65V15H176.01C176.01 15 176.01 17.62 176.01 23H165.37C162.41 23 160.01 25.4 160.01 28.36H160ZM176 39H165V28H176V39Z',
  'M200 23V39H189V23H184V38.64C184 42 186 44 189.36 44H200C200 44.32 200 48 200 48H188V53H199.64C203 53 205 51 205 47.64V23H200Z',
] as const;
/** "Hub", light: H, u, b (the art's paths, verbatim). */
const HUB = [
  'M217 44V17H220V29H239V17H242V44H239V32H220V44Z',
  'M248 23V41H263V23H266V44H250.36C247 44 245 42 245 38.64V23Z',
  'M269 15H272V23H284.65C287.61 23 290.01 25.4 290.01 28.36V38.65C290.01 41.61 287.61 44 284.65 44H274.36C271.4 44 269 41.61 269 38.65V15ZM272 26V41H287.01V26Z',
] as const;
/** The drawing's width for each extent, on the 64-unit height: the square; up to the y of "Hoody" (205 scaled); the
 *  whole logo (the art's own viewBox width, 331.21). */
export const BRAND_WIDTH = { mark: 64, hoody: 229.2, hub: 331.21 } as const;

export interface BrandMarkProps {
  /** sm: the logo 24 px tall (--brand-h; the sidebar, the lock screen). lg: 32 px tall (--icon-xl; an auth card). */
  size?: 'sm' | 'lg';
  /** The second word, "Hub". Off: the mark and "Hoody". */
  hub?: boolean;
  /** Off: the mark alone (a collapsed rail), no text. */
  words?: boolean;
  className?: string;
}

/** The Hoody Hub logo. Inline: it sits in a row or a line of its caller. */
export function BrandMark({ size = 'sm', hub = true, words = true, className }: BrandMarkProps) {
  const t = useStrings(strings);
  const width = !words ? BRAND_WIDTH.mark : hub ? BRAND_WIDTH.hub : BRAND_WIDTH.hoody;
  return (
    <span className={cx(s.brand, size === 'lg' && s.lg, className)} data-brand-mark={size}>
      <svg className={s.art} viewBox={`0 0 ${width} 64`} width={width} height={64} aria-hidden="true" focusable="false">
        <path fillRule="evenodd" d={BRAND_MARK_PATH} />
        {words && (
          <g transform={WORDS_TRANSFORM}>
            {HOODY.map((d) => (
              <path key={d} fillRule="evenodd" d={d} />
            ))}
            {hub && HUB.map((d) => <path key={d} fillRule="evenodd" d={d} />)}
          </g>
        )}
      </svg>
      {words && (
        // One line of text with a real space between the words, so a reader and a copy both get "Hoody Hub".
        <span className={SR_ONLY}>
          {t('name')}
          {hub && (
            <>
              {' '}
              {t('hub')}
            </>
          )}
        </span>
      )}
    </span>
  );
}
