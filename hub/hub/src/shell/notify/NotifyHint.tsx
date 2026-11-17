// NotifyHint: the one-line "Get notified" callout a page drops
// where a person waits for something (kinds in core/alerts.ts HINT_KINDS).
//
// Contract:
//   - A line, not a banner. It shows until dismissed or acted on, per browser and account, never while
//     alerts are already on, never without a shown account, and never twice on one screen: the first
//     hint mounted owns the screen and the others draw nothing until it goes.
//   - Account kinds (inbox, bell, computer, purchase, rental) are backed by a notice the platform really
//     writes, so their line may add "You can add a browser alert"; local kinds (bot, script, schedule)
//     promise only a browser alert and stay away from a browser that cannot alert.
//   - "Set up" opens Get notified at the part that explains the kind (or runs onGo when the caller is
//     that page); a browser that cannot alert gets "How it works" pointing at "Where you see them". With
//     neither onGo nor a served Notifications page there is nowhere to go, so no hint at all.
//     Acting dismisses the hint, like ×.
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Button, IconButton, cx } from '@kit/controls/Button';
import { Icon } from '@kit/icons';
import { useGo } from '@kit/nav';
import { useStrings } from '@kit/strings';
import { currentStatus, HINT_KINDS, hintSection, hintWanted, isHintKind, readList, setChoice, type HintKind, type SectionId } from '@core/shell';
import strings from '../strings.en.json';
import { followPagePath, usePageLink } from '../pageLinks';
import { notifyPaths } from './paths';
import { useShownUid } from './uid';
import s from './NotifyHint.module.css';

// One hint per screen: the first claimant owns it.
let owner: string | null = null;
const listeners = new Set<() => void>();
function setOwner(next: string | null): void {
  owner = next;
  for (const l of [...listeners]) l();
}
function useOwner(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => owner,
    () => owner,
  );
}

const LINE: Record<HintKind, `hint.${HintKind}`> = {
  inbox: 'hint.inbox',
  bell: 'hint.bell',
  computer: 'hint.computer',
  purchase: 'hint.purchase',
  rental: 'hint.rental',
  bot: 'hint.bot',
  script: 'hint.script',
  schedule: 'hint.schedule',
};

export interface NotifyHintProps {
  kind: HintKind;
  /** The caller is the notifications page: open the section there instead of navigating. */
  onGo?: (section: SectionId) => void;
  className?: string;
}

export function NotifyHint({ kind, onGo, className }: NotifyHintProps) {
  const t = useStrings(strings);
  const go = useGo();
  const page = usePageLink('notifications');
  const uid = useShownUid();
  const me = useId();
  const current = useOwner();
  const [dismissed, setDismissed] = useState(false);
  const status = uid ? currentStatus(uid) : null;
  // A hint needs somewhere to send the person: the caller's own section, else the Notifications page (hidden: no hint,
  // never a Set up that only dismisses itself).
  const wanted = (!!onGo || !!page) && !!uid && !!status && !dismissed && isHintKind(kind) && hintWanted(kind, readList(uid, 'hints'), status.state);

  useEffect(() => {
    if (!wanted) return;
    if (owner === null) setOwner(me);
    return () => {
      if (owner === me) setOwner(null);
    };
  }, [wanted, me]);
  // Another hint left: claim the screen if this one still wants it. The live owner is read, not this render's `current`: every
  // hint drawn in one commit saw no owner, and the first one's claim must stand (the last would otherwise take the screen).
  useEffect(() => {
    if (wanted && owner === null) setOwner(me);
  }, [wanted, current, me]);

  if (!wanted || !uid || !status || current !== me) return null;
  const plain = status.state === 'unsupported' || status.state === 'broken';
  const section = hintSection(kind, status.state);
  const done = () => {
    setChoice(uid, 'hints', JSON.stringify([...readList(uid, 'hints').filter((k) => k !== kind), kind]));
    setDismissed(true);
  };
  const act = () => {
    done();
    if (onGo) onGo(section);
    else followPagePath(page, notifyPaths.learnSection(section), go);
  };
  return (
    <div className={cx(s.hint, className)} role="note" data-hub-notify-hint={kind}>
      <Icon name="bell" size="sm" className={s.icon} />
      <span className={s.text}>
        {t(LINE[kind])}
        {!plain && HINT_KINDS[kind].account && ` ${t('hint.alertsToo')}`}
      </span>
      <Button variant="ghost" size="sm" onPress={act}>
        {t(plain ? 'hint.how' : 'hint.setup')}
      </Button>
      <IconButton icon="x" size="sm" label={t('hint.dismiss')} onPress={done} />
    </div>
  );
}
