// The plate at the top of Get a computer: what you get, in one sentence, with the facts the form does not ask for
// (the size the server gives it, the system, the software). When something is missing it names that one thing (the
// only coloured phrase) and where to fix it, so a Get computer that cannot send is never unexplained. For a copy it
// names the computer copied and where the copy goes.
import { Facts, formatStorage, useStrings, Verdict, VerdictMark, type Fact } from '@kit';
import strings from '../../strings.en.json';
import type { Server } from '../../types';

/** What keeps Get computer from sending: a read still out or failed, or the one thing to pick or make. A server is
 *  missing in three ways: there is none ('noServer'), every one is full ('room'), or none is picked ('server'). */
export type Missing = 'loading' | 'serversUnread' | 'projectsUnread' | 'noServer' | 'room' | 'server' | 'project' | 'projectGone';

type Props =
  | {
      /** The computer copied; '' while none is picked. */
      copyOf: string;
      /** Where the copy goes, as its form has it now. */
      server?: Server | undefined;
      project?: string | undefined;
      realm?: string | undefined;
    }
  | {
      copyOf?: undefined;
      missing: Missing | null;
      server: Server | undefined;
      /** The software switches that are on, by name. */
      software: readonly string[];
      autostart: boolean;
      /** The Server row offers more room (a plan step this session may take): the plate points there when all are full. */
      canGrow?: boolean;
      /** The Server list offers a new server: the plate points there when there is none, or none can grow. */
      canRent?: boolean;
    };

export function Summary(p: Props) {
  const t = useStrings(strings);
  const { server } = p;
  const specs = !server || server.cpu === null ? null : server.ram === null ? t('size.cores', { count: server.cpu }) : t('server.specs', { cpu: server.cpu, ram: formatStorage(server.ram) });
  // A size not known yet says so in words.
  const size: Fact = { label: t('create.sum.size'), value: specs ? t('create.sum.shared', { size: specs }) : t('create.sum.sizeUnknown') };
  const place = server ? [server.name, server.place ? server.place.split(',')[0] : null].filter(Boolean).join(', ') : '';
  if (p.copyOf !== undefined) {
    if (p.copyOf === '') {
      return (
        <Verdict label={t('create.sum.label')} next={t('create.sum.copyPick')}>
          {t('create.sum.copyAny')}
        </Verdict>
      );
    }
    const facts: Fact[] = [
      size,
      { label: t('create.sum.files'), value: t('create.sum.filesSame', { name: p.copyOf }) },
      ...(p.project ? [{ label: t('field.project'), value: p.project }] : []),
      ...(p.realm ? [{ label: t('create.realm'), value: p.realm }] : []),
    ];
    return (
      <Verdict label={t('create.sum.label')} facts={<Facts columns={2} label={t('create.sum.label')} items={facts} />}>
        {place ? t('create.sum.copyOn', { name: p.copyOf, server: place }) : t('create.sum.copy', { name: p.copyOf })}
      </Verdict>
    );
  }
  const { missing } = p;
  const facts: Fact[] = [
    size,
    { label: t('create.image'), value: t('create.imageFixed') },
    { label: t('create.g.software'), value: p.software.length ? p.software.join(', ') : t('create.sum.noSoftware') },
  ];
  // Ready, the plate needs no next line; it says so only when the computer will not start by itself.
  const next = missing === null ? (p.autostart ? undefined : t('create.sum.stays'))
    : missing === 'server' ? t('create.sum.fixServer')
    : missing === 'room' ? (p.canGrow ? t('create.sum.fixRoom') : p.canRent ? t('create.sum.fixRent') : t('create.sum.fixFull'))
    : missing === 'noServer' ? (p.canRent ? t('create.sum.fixRent') : undefined)
    : missing === 'project' ? t('create.sum.fixProject')
    : missing === 'projectGone' ? t('create.sum.fixProjectGone')
    : missing === 'projectsUnread' ? t('create.sum.fixUnread')
    : undefined;
  return (
    <Verdict label={t('create.sum.label')} facts={<Facts columns={2} label={t('create.sum.label')} items={facts} />} {...(next ? { next } : {})}>
      {missing === null ? (
        t('create.sum.new', { server: place })
      ) : missing === 'loading' ? (
        t('create.sum.loading')
      ) : missing === 'serversUnread' ? (
        t('create.sum.serversUnread')
      ) : missing === 'projectsUnread' ? (
        t('create.sum.projectsUnread')
      ) : (
        <>
          {t('create.sum.notReady')} <VerdictMark tone="warn">{t(missing === 'noServer' ? 'create.sum.noneServer' : missing === 'room' ? 'create.sum.noServer' : missing === 'server' ? 'create.sum.serverUnpicked' : missing === 'project' ? 'create.sum.noProject' : 'create.sum.projectGone')}</VerdictMark>
        </>
      )}
    </Verdict>
  );
}
