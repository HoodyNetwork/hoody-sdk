// A server's country as its flag (the regional-indicator emoji, named by the code). Its own part so the terminal
// (Flag.term.tsx) draws the kit CountryFlag instead: a terminal draws flag emoji wide, in colour or not at all.
import { countryFlag } from '@kit';
import s from './parts.module.css';

export function Flag({ cc }: { cc: string | undefined }) {
  const f = countryFlag(cc);
  return f ? (
    <span className={s.flag} role="img" aria-label={cc}>
      {f}
    </span>
  ) : null;
}
