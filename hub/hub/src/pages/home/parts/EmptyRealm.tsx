// A realm with no computers: what a computer is, Get a computer, and Show all realms (how Hoody fits together is
// the Welcome's job, reopened from the header).
import { Button, EmptyState, LinkButton, useShellData, useStrings } from '@kit';
import { links as computers } from '../../computers/links';
import strings from '../strings.en.json';
import type { Overview } from '../data';
import { usePageTarget } from './usePageTarget';
import s from './parts.module.css';

export function EmptyRealm({ realm }: { realm: Overview['realm'] }) {
  const t = useStrings(strings);
  // Get a computer opens the create form when this load serves Computers; usePageTarget gives nothing otherwise.
  const get = usePageTarget('computers', computers.create);
  const setRealm = useShellData().setRealm;
  return (
    <section className={s.canvas}>
      <EmptyState
        icon="computer"
        title={realm.all ? t('empty.titleAll') : t('empty.title', { realm: realm.name })}
        body={realm.all ? t('empty.bodyAll') : t('empty.body')}
        action={
          get && (
            <LinkButton variant="primary" icon={get.asPage ? undefined : 'plus'} iconEnd={get.asPage ? 'arrow-right' : undefined} href={get.href}>
              {get.asPage ? t('intro.openPage') : t('action.getComputer')}
            </LinkButton>
          )
        }
        secondary={
          setRealm && !realm.all ? (
            <Button variant="ghost" onPress={() => setRealm('all')}>
              {t('action.showAllRealms')}
            </Button>
          ) : undefined
        }
      />
    </section>
  );
}
