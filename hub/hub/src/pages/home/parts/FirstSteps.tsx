// First steps: milestones ticked only from facts Home reads (a computer, an API key), and "Try next" suggestions
// with a real destination and no tick (Home cannot see whether they were done). A fact seen true stays true; an
// unknown one says "Checking" and the count waits for it, so an unread fact never looks like progress or like
// "not done". Inline in the Welcome panel, or a card of its own once the Welcome is hidden. Both lists are the kit
// widget list, as the kit's own Start widget: a progress bar over rows of icon, name and action.
import { Link, Widget, WidgetList, WidgetProgress, WidgetRow, useStrings, type IconName } from '@kit';
import { links as bots } from '../../bots/links';
import { links as computers } from '../../computers/links';
import { links as keys } from '../../keys/links';
import { links as home } from '../links';
import strings from '../strings.en.json';
import { progressOf, type MilestoneId, type Step, type TryId } from '../logic';
import { usePageTarget } from './usePageTarget';
import s from './home.module.css';

const MILESTONE_PAGE: Record<MilestoneId, { page: string; path: string }> = {
  computer: { page: 'computers', path: computers.create },
  key: { page: 'keys', path: keys.create },
};

const MILESTONE_ICON: Record<MilestoneId, IconName> = { computer: 'computer', key: 'key' };
const TRY_ICON: Record<TryId, IconName> = { open: 'computer', bot: 'bot' };

// An open milestone's row is its own link to where it is done (a kit row link, as the Try next rows), so no button
// beside the name says the same thing twice. When this load serves no such page, the row stays, as plain text with no
// link: the step is still not done and still counted (hiding it would read as progress), and nothing pretends to go
// there.
function MilestoneRow({ step }: { step: Step }) {
  const t = useStrings(strings);
  const target = usePageTarget(MILESTONE_PAGE[step.id].page, MILESTONE_PAGE[step.id].path);
  const open = !step.done && !step.unknown;
  // asPage (a classic link, which no load gives) would name the row as the page.
  const label = open && target?.asPage ? t(step.id === 'key' ? 'actions.keys.page' : 'actions.computer.page') : t(step.done ? `steps.${step.id}.done` : `steps.${step.id}`);
  return (
    <WidgetRow
      icon={step.done ? 'check-circle' : MILESTONE_ICON[step.id]}
      tone={step.done ? 'ok' : undefined}
      label={label}
      href={open ? target?.href : undefined}
      // A step whose fact is unread says so visibly, never "not done"; one whose read failed is never "Checking".
      meta={step.unknown ? t(step.failed ? 'steps.unread' : 'steps.checking') : undefined}
      pill={step.done ? { tone: 'ok', text: t('steps.status.done') } : undefined}
    />
  );
}

type Target = { href: string; asPage: boolean } | null;

/** Where each suggestion goes, or null when this load serves no such page (the suggestion is then not offered). */
function useTryTargets(computer?: { name: string; handle: string }): Record<TryId, Target> {
  const open = usePageTarget('computers', computer ? computers.item(computer.handle) : computers.list);
  const bot = usePageTarget('bots', bots.newBot());
  return { open, bot };
}

function TryRow({ id, target, computer }: { id: TryId; target: NonNullable<Target>; computer?: { name: string; handle: string } }) {
  const t = useStrings(strings);
  // asPage (a classic link, which no load gives) would name the suggestion as the
  // page, with no promise of what it opens.
  const label =
    id === 'open' ? (target.asPage ? t('intro.openPage') : t('steps.try.open', { name: computer?.name ?? '' })) : target.asPage ? t('actions.bot.page') : t('steps.try.bot');
  return <WidgetRow icon={TRY_ICON[id]} href={target.href} label={label} />;
}

interface Props {
  steps: readonly Step[];
  tries: readonly TryId[];
  computer?: { name: string; handle: string };
}

/** The lists alone (inside the Welcome panel): the kit widget list, as the kit's own Start widget. */
export function FirstStepsBody({ steps, tries, computer, titled = true }: Props & { titled?: boolean }) {
  const t = useStrings(strings);
  const progress = progressOf(steps);
  const targets = useTryTargets(computer);
  // Only suggestions with somewhere to go; with none, no Try next heading over an empty list.
  const shown = tries.flatMap((id) => {
    const target = targets[id];
    return target ? [{ id, target }] : [];
  });
  return (
    <div className={s.firstSteps}>
      <div className={s.stepsGroup}>
        {/* The kit progress bar prints its own "{done} of {total}". */}
        {titled && (
          <div className={s.stepsHead}>
            <h3 className={s.stepsTitle}>{t('steps.title')}</h3>
          </div>
        )}
        {progress && <WidgetProgress done={progress.done} total={progress.total} />}
        <WidgetList label={t('steps.title')}>
          {steps.map((step) => (
            <MilestoneRow key={step.id} step={step} />
          ))}
        </WidgetList>
      </div>
      {shown.length > 0 && (
        <div className={s.stepsGroup}>
          <h3 className={s.tryTitle}>{t('steps.try')}</h3>
          <WidgetList label={t('steps.try')}>
            {shown.map(({ id, target }) => (
              <TryRow key={id} id={id} target={target} computer={computer} />
            ))}
          </WidgetList>
        </div>
      )}
    </div>
  );
}

/** The card of its own, with Hide in its menu. */
export function FirstStepsCard(props: Props & { onHide: () => void }) {
  const t = useStrings(strings);
  const { onHide, ...rest } = props;
  return (
    <Widget size="s" title={t('steps.title')} menu={[{ id: 'hide', label: t('steps.hide'), icon: 'eye-off', onAction: onHide }]}>
      <div className={s.stepsCardBody}>
        <FirstStepsBody {...rest} titled={false} />
        {/* For a newcomer the Welcome missed (setup seen in another browser): no nagging, the card goes away. */}
        <p className={s.stepsFoot}>
          <Link variant="nav" className={s.touchLink} href={home.intro} iconEnd="arrow-right">
            {t('steps.newToHoody')}
          </Link>
        </p>
      </div>
    </Widget>
  );
}
