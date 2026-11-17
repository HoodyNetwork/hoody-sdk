// The realm band of every Memory screen: which realm the memory is, where it is kept, and
// whether memory is on, in one sentence ("Realm Work · stored on atlas (this realm's memory host) · memory on"), with
// Details. Words for each data-host state, plus the two failures of the read itself: a 503 (the realm's memory is not
// connected on the agent right now) and any other failure. Props only: the page reads the agent and says what to draw.
// An unknown on/off is left out, never guessed.
import { useId, useState, type ReactNode } from 'react';
import { TextButton } from '../controls/Link';
import { Band } from '../states/Band';
import { useStrings } from '../strings';
import strings from './RealmBand.strings.en.json';
import s from './RealmBand.module.css';

export type RealmBandState = 'leader' | 'follower' | 'electing' | 'unavailable' | 'stuck' | 'not_realm_member' | 'fleet_disabled' | 'realm_blocked';

/** What the band says about where memory is kept: still reading, one of the agent's eight states (with the host's
 *  name for leader and follower), the read's 503 (`cold`), or any other failed read (`unreachable`). */
export type RealmBandHost =
  | { kind: 'loading' }
  | { kind: 'state'; state: RealmBandState; host: string }
  | { kind: 'cold' }
  | { kind: 'unreachable' };

export interface RealmBandProps {
  /** The realm's name (alias or short id). */
  realm: string;
  /** The computer the agent runs on, by name. */
  computer: string;
  host: RealmBandHost;
  /** Memory capture on or off; null when not known (left out). */
  memory: boolean | null;
  /** Reads again: offered on unavailable, cold and unreachable. */
  onRetry?: () => void;
  /** The recovery action, when the page offers one: drawn only while no host serves the realm's memory
   *  (electing, unavailable, stuck), the states the agent offers "Use this computer" in. */
  action?: ReactNode;
  /** What Details shows (the hosts, the on/off switch); without it there is no Details. */
  details?: ReactNode;
}

const SERVING: readonly RealmBandState[] = ['leader', 'follower', 'electing'];
const RETRY: readonly string[] = ['unavailable', 'cold', 'unreachable'];
// No host serves the realm's memory: an election still running, an elected host not reachable, or a stuck election.
const RECOVERY: readonly RealmBandState[] = ['electing', 'unavailable', 'stuck'];

/** The band's sentence and tone for a host view (exported for tests and the page's own checks). */
export function realmBandWords(t: ReturnType<typeof useStrings<typeof strings>>, p: Pick<RealmBandProps, 'realm' | 'computer' | 'host' | 'memory'>): { parts: string[]; warn: boolean; retry: boolean } {
  const { realm, computer, host } = p;
  const key = host.kind === 'state' ? host.state : host.kind;
  const said = t(key as 'loading', { realm, computer, host: host.kind === 'state' ? host.host : '' });
  const serving = host.kind === 'loading' || (host.kind === 'state' && SERVING.includes(host.state));
  // The serving states continue "Realm Work · …"; the others are whole sentences that name the realm themselves.
  const parts = serving ? [t('realm', { realm }), said] : [said];
  if (p.memory !== null) parts.push(t(p.memory ? 'on' : 'off'));
  return { parts, warn: !serving, retry: RETRY.includes(key) };
}

export function RealmBand({ realm, computer, host, memory, onRetry, action, details }: RealmBandProps) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const id = useId();
  const w = realmBandWords(t, { realm, computer, host, memory });
  const recovery = host.kind === 'state' && RECOVERY.includes(host.state);
  return (
    <div className={s.wrap} data-realm-band={host.kind === 'state' ? host.state : host.kind}>
      <Band
        tone={w.warn ? 'warn' : 'neutral'}
        icon="database"
        actions={
          <>
            {w.retry && onRetry ? <TextButton onPress={onRetry}>{t('retry')}</TextButton> : null}
            {recovery && action ? action : null}
            {details ? (
              <TextButton onPress={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}>
                {t(open ? 'hideDetails' : 'details')}
              </TextButton>
            ) : null}
          </>
        }
      >
        <span data-band-text="">{w.parts.join(t('sep'))}</span>
      </Band>
      {details && open ? (
        <div id={id} className={s.details}>
          {details}
        </div>
      ) : null}
    </div>
  );
}
