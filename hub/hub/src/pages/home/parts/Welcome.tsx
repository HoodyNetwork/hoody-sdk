// The Welcome panel of an account Home saw being onboarded (or one that asked with ?intro=1): a short entry. One value
// line, the first useful action (open the computer) and the tour as the marked way to learn the rest: how
// Hoody fits together and the first steps live in the tour (pages/onboarding). Beside them the shown computer on the
// world map: pinned at its server's country, with a small copy of its card and the ways in. Hide closes it whatever
// opened it; "What is Hoody?" in the header opens it again.
import { Button, Handoff, IntroPanel, LinkButton, StatusPill, useStrings, type IconName } from '@kit';
import { forwardRef } from 'react';
import { links as computers } from '../../computers/links';
import { links as tour } from '../../onboarding/links';
import type { HomeComputer } from '../data';
import { contextState } from '../logic';
import { mapPlaceOf } from '../mapPins';
import strings from '../strings.en.json';
import { usePageTarget } from './usePageTarget';

interface Props {
  /** The state's one primary action: open the shown computer (ready), or none here when the state's own panel above
   *  holds it (pick-one: the chooser; an empty realm: Get a computer). */
  primary: 'open' | 'none';
  computer?: Pick<HomeComputer, 'name' | 'handle' | 'state' | 'country'>;
  onHide: () => void;
}

/** The card's tiles, as Home's "Your computer" card orders them. */
const TILES: readonly { id: 'agent' | 'terminal' | 'desktop' | 'files' | 'browser'; icon: IconName }[] = [
  { id: 'agent', icon: 'agent' },
  { id: 'terminal', icon: 'terminal' },
  { id: 'desktop', icon: 'display' },
  { id: 'files', icon: 'files' },
  { id: 'browser', icon: 'browser' },
];
/** The ways in drawn over the map: a terminal, the desktop, the agent's chat (the kit has no chat mark; the agent's stands for it). */
const WAYS: readonly IconName[] = ['terminal', 'display', 'agent'];

export const Welcome = forwardRef<HTMLElement, Props>(function Welcome({ primary, computer, onHide }, ref) {
  const t = useStrings(strings);
  // Opens the computer (or the list) when this load serves Computers; usePageTarget gives nothing otherwise.
  const open = usePageTarget('computers', computer ? computers.item(computer.handle) : computers.list);
  const tourLink = usePageTarget('onboarding', tour.page);
  const state = computer ? contextState(computer.state) : undefined;
  return (
    <IntroPanel
      ref={ref}
      labelId="home-welcome-lead"
      eyebrow={t('intro.reopen')}
      lead={t('intro.lead')}
      hide={
        <Button variant="ghost" size="sm" icon="x" aria-label={t('intro.hideLabel')} onPress={onHide}>
          {t('intro.hide')}
        </Button>
      }
      computer={
        computer && state
          ? {
              name: computer.name,
              state: <StatusPill tone={state.tone} dot>{t(state.key)}</StatusPill>,
              tiles: TILES.map((tile) => ({ icon: tile.icon, label: t(`intro.tile.${tile.id}`) })),
              place: mapPlaceOf(computer.country),
            }
          : undefined
      }
      ways={WAYS}
      actions={
        <>
          {primary === 'open' && computer && open ? (
            // The computer's name is the user's, any length: the button says Open and its name names the computer (the
            // header above names it too).
            <LinkButton variant="primary" iconEnd="chevron-right" href={open.href} aria-label={open.asPage ? undefined : t('intro.open', { name: computer.name })}>
              {open.asPage ? t('intro.openPage') : t('intro.openShort')}
            </LinkButton>
          ) : null}
          {/* The tour is an animated web page: on the web this is its link, in the terminal Hub a hand-off line. */}
          {tourLink ? (
            <Handoff size="line" to={tour.page} what={t('intro.tourWhat')} reason={t('intro.tourReason')}>
              <LinkButton variant="secondary" href={tourLink.href} iconEnd="chevron-right">
                {t('intro.tour')}
              </LinkButton>
            </Handoff>
          ) : null}
        </>
      }
    />
  );
});
