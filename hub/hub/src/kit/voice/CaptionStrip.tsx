// CaptionStrip: live captions above the composer while Talk is live: what the person is saying
// ("hearing" while it is partial) and what the Bot is saying. Captions are always on. A final line is announced once,
// politely; a partial line is never announced (it would talk over the person). Presentational: the binding passes the
// lines it read from transcript and reply frames.
import { useStrings } from '../strings';
import strings from './Voice.strings.en.json';
import s from './Voice.module.css';

export interface CaptionLine {
  text: string;
  /** false while the words may still change (a partial transcript, a reply still streaming). */
  final: boolean;
}

export interface CaptionStripProps {
  you?: CaptionLine;
  bot?: CaptionLine & { name: string };
}

export function CaptionStrip({ you, bot }: CaptionStripProps) {
  const t = useStrings(strings);
  if (!you?.text && !bot?.text) return null;
  const announced = [you?.final && you.text ? `${t('caption.you')}: ${you.text}` : '', bot?.final && bot.text ? `${bot.name}: ${bot.text}` : ''].filter(Boolean).join('. ');
  return (
    <div className={s.captions} role="group" aria-label={t('caption.label')}>
      {you?.text && (
        <p className={s.caption} data-final={you.final ? '' : undefined}>
          <span className={s.who}>{t('caption.you')}:</span> <span>{t('caption.said', { text: you.text })}</span>
          {!you.final && <span className={s.partial}> ({t('caption.hearing')})</span>}
        </p>
      )}
      {bot?.text && (
        <p className={s.caption} data-final={bot.final ? '' : undefined}>
          <span className={s.who} data-literal="">
            {bot.name}:
          </span>{' '}
          <span>{t('caption.said', { text: bot.text })}</span>
        </p>
      )}
      <div role="status" aria-live="polite" className={s.srOnly}>
        {announced}
      </div>
    </div>
  );
}
