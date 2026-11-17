// Network tab: at a glance first, then internet access (blocked or allowed), then where
// traffic leaves from (the exit, which only an account owner can change), then the firewall rules, then using this
// computer as a proxy for another device. Internet access and the rules share one Firewall part (its sends and holds),
// so Firewall renders the exit section between its two sections, and the exit's "Disable internet" choice asks
// Internet access to block.
import { focusSection, useSearchParam } from '@kit';
import { useEffect } from 'react';
import type { Computer } from '../types';
import { ConnectProxy } from './ConnectProxy';
import { Firewall } from './Firewall';
import { NetworkSummary } from './NetworkSummary';
import s from './parts.module.css';

/** The Firewall section's anchor: `?at=firewall` (links.firewall) shows the tab with it in view. */
export const FIREWALL_SECTION = 'net-firewall';

const LAND_EVERY_MS = 100;
const LAND_TRIES = 50;

export function Network({ c, canWrite }: { c: Computer; canWrite: boolean }) {
  // A link to the firewall (the Permissions tab's reminder) lands on its heading: in view and focused, so a screen
  // reader says where it is. The key is read once and dropped (replace), so Back returns to where the link was.
  const [at, setAt] = useSearchParam('at');
  useEffect(() => {
    if (at !== 'firewall') return;
    // The section may not be drawn yet when the tab first shows: the landing waits for it (a few seconds at most),
    // and the key stays until then.
    let tries = 0;
    const land = () => {
      // focusSection scrolls the heading clear of the sticky header and tab bar, then focuses it.
      if (!focusSection(FIREWALL_SECTION)) return false;
      setAt(undefined, { replace: true });
      return true;
    };
    if (land()) return;
    const timer = setInterval(() => { if (land() || ++tries >= LAND_TRIES) clearInterval(timer); }, LAND_EVERY_MS);
    return () => clearInterval(timer);
  }, [at, setAt]);
  return (
    <div className={s.stack}>
      <NetworkSummary c={c} />
      {/* Keyed like the other parts of a computer (Desktop, Run, AccessPanel): a change of several steps started for one
          computer (Block / Allow internet access, an edit, a preset) reads its rules between the steps through this
          instance's query, which would follow the page to the computer picked next while the steps still went to the first. */}
      <Firewall key={c.id} c={c} canWrite={canWrite} withExit />
      <ConnectProxy c={c} />
    </div>
  );
}
