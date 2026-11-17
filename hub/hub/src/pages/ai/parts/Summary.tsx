// "Now using": shown only while a problem stands (view.tsx), with what is in use, how it is paid for, and the fix.
import { Band, Button, Skeleton, Tag, useSearchParam, useStrings } from '@kit';
import { FREE, defaultVia, modelLabel } from '../logic';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import s from './parts.module.css';


export function Summary() {
  const t = useStrings(strings);
  const { m, connect, goto } = useAi();
  const [, setPick] = useSearchParam('pick');
  if (m.firstLoad) return <Skeleton variant="card" rows={3} />;
  const d = m.defaults;
  const via = d ? defaultVia({ ...d, ...(m.claude?.selected ? { helperBackend: 'claude_code' } : {}) }, m.models) : '';
  const p = m.problem;
  const canFree = (p?.kind === 'needs_key' || p?.kind === 'model_gone') && m.models.some((x) => x.spec === FREE) && d?.helper.effective !== FREE;
  return (
    <div className={s.summary}>
      <div>
        <div className={`${s.muted} ${s.small}`}>{t('now.title')}</div>
        <div className={s.summaryName}>{d ? (m.claude?.selected ? t('now.claude') : modelLabel(m.models, d.helper.effective)) : t('now.unknown')}</div>
        {via && <Tag>{via}</Tag>}
      </div>
      {p && (
        <Band
          tone="warn"
          size="page"
          actions={
            <>
              {p.kind === 'needs_key' && (
                <Button size="sm" variant="primary" onPress={() => connect(p.providerId ?? undefined)}>
                  {t('now.connect', { provider: p.provider })}
                </Button>
              )}
              {canFree && (
                <Button size="sm" variant="secondary" onPress={() => setPick('free')}>
                  {t('now.useFree')}
                </Button>
              )}
              {p.kind === 'model_gone' && (
                <Button size="sm" variant="primary" onPress={() => goto('default')}>
                  {t('now.choose')}
                </Button>
              )}
              {p.kind === 'claude' && (
                <Button size="sm" variant="primary" onPress={() => goto('claude')}>
                  {t('now.fixClaude')}
                </Button>
              )}
            </>
          }
        >
          {p.kind === 'needs_key' && t('now.needsKey', { provider: p.provider, model: p.model })}
          {p.kind === 'model_gone' && t('now.modelGone')}
          {p.kind === 'claude' && t('now.claudeNot')}
          {p.kind === 'checker' && t('now.checker')}
        </Band>
      )}
    </div>
  );
}
