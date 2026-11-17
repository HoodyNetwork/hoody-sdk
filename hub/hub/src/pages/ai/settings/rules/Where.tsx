// AI → Settings → Rules & hooks → Folder path rules: read
// only, from the settings that apply in one folder of one realm (GET /settings/where-agents-work): the places the settings
// add to where agents work without asking, the paths they may never touch, and how many of those inside the agent's own
// folder are not listed. No folder (the This realm place): nothing is read, since the agent would answer for the folder it
// was started in. Mounted by Settings.tsx inside the page's one PlaceProvider, so the folder is the place bar's; All realms
// has no place bar and does not mount it (the settings belong to one realm). A failed or malformed read shows neither list.
// This view only reads, so nothing here sends. Its states ride the section's state=.
import { isRealmOrGlobal, type Target } from '@core';
import { AnatomySection, CodeBlock, SettingGroup, SettingRow, useStrings, type SectionState } from '@kit';
import { useMemo } from 'react';
import { useWhere } from './features.data';
import strings from './strings.en.json';

export default function WhereAgentsWork({ target, realm, folder }: { target: Target; realm: string; folder: string | null }) {
  const t = useStrings(strings);
  const one = isRealmOrGlobal(realm);
  const at = useMemo(() => (folder && one ? { target, realm, folder } : null), [target, realm, folder, one]);
  const q = useWhere(at);
  const reload = () => void q.refetch();
  const state: SectionState = !one
    ? { kind: 'notHere', icon: 'realm', title: t('where.allRealms.title'), body: t('where.allRealms.body') }
    : !at
    ? { kind: 'notHere', icon: 'files', title: t('where.noFolder.title'), body: t('where.noFolder.body') }
    : q.isError
      ? { kind: 'failed', error: q.error, onRetry: reload, busy: q.isFetching }
      : q.isPending
        ? { kind: 'loading', rows: 2 }
        : { kind: 'ready' };
  return (
    <AnatomySection id="ai-where" title={t('where.title')} description={t('where.body')} state={state} note={state.kind === 'ready' ? t('where.readOnly') : undefined}>
      {at && q.data && (
        <SettingGroup label={t('where.title')}>
          <SettingRow label={t('where.allowed')} help={t('where.allowed.help')}>
            <Paths list={q.data.allowed} label={t('where.allowed')} />
          </SettingRow>
          <SettingRow label={t('where.deny')} help={q.data.hidden > 0 ? `${t('where.deny.help')} ${t('where.hidden', { count: q.data.hidden })}` : t('where.deny.help')}>
            <Paths list={q.data.deny} label={t('where.deny')} />
          </SettingRow>
        </SettingGroup>
      )}
    </AnatomySection>
  );
}

function Paths({ list, label }: { list: readonly string[]; label: string }) {
  const t = useStrings(strings);
  if (list.length === 0) return <>{t('where.none')}</>;
  return <CodeBlock label={label} lines={list.map((p) => ({ code: p }))} wrap lang="plain" // reason: folder paths, data not code
  />;
}
