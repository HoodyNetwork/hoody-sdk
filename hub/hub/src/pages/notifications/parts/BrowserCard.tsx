// Browser alerts: a small state machine over the permission. Permission is asked only from the "Turn on" click,
// never on load. Blocked and unsupported say why and how to undo it, per browser. Results of the prompt, the
// test and the toggles are written into one polite live region. Every claim is true of the platform: there is
// no web-push sender, so an alert exists only while the Hub is open in a tab.
import { alertStatus, disableAlerts, enableAlerts, firstHelp, getChoice, isBroken, readEnv, showAlert } from '@core';
import { Button, Disclosure, FaqLink, Icon, StatusPill, useStrings } from '@kit';
import { useRef, useState } from 'react';
import type { BrowserOverride } from '../data';
import { pageFaq } from '../faq';
import strings from '../strings.en.json';
import s from './Learn.module.css';

const HELPS = ['chrome', 'firefox', 'safari', 'ios', 'android'] as const;

export function BrowserCard({ uid, override }: { uid: string; override: BrowserOverride | null }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const [env, setEnv] = useState(() => override?.env ?? readEnv());
  const [alerts, setAlerts] = useState(() => (override ? override.alerts : getChoice(uid, 'alerts')));
  const [broken, setBroken] = useState(() => (override ? override.broken : isBroken()));
  const [say, setSay] = useState('');
  const busy = useRef(false);

  const status = alertStatus(env, { alerts, broken });
  const sync = (permission?: string) => {
    setEnv((e) => (override ? { ...e, permission: permission ?? e.permission } : readEnv()));
    setAlerts(getChoice(uid, 'alerts'));
    setBroken(isBroken());
  };

  const enable = async () => {
    if (busy.current) return;
    busy.current = true;
    setSay('');
    const r = await enableAlerts(uid, env);
    busy.current = false;
    sync(r.answer === 'granted' || r.answer === 'denied' ? r.answer : undefined);
    if (r.answer === 'granted') setSay(t(r.remembered ? 'h.result.enabled' : 'h.result.enabledTemp'));
    else if (r.answer === 'denied') setSay(t('h.result.denied'));
    else setSay(t('h.result.noanswer'));
  };

  const disable = () => {
    const r = disableAlerts(uid);
    sync();
    setSay(t(r.remembered ? 'h.result.disabled' : 'h.result.disabledTemp'));
  };

  const test = async () => {
    setSay('');
    const r = await showAlert({ title: t('h.test.title'), body: t('h.test.body'), tag: 'hub-test' }, env);
    if (r.ok) setSay(t('h.test.sent'));
    else {
      sync();
      setSay(t(r.reason === 'ctor' ? 'h.test.ctor' : r.reason === 'denied' ? 'h.test.denied' : 'h.test.unsupported'));
    }
  };

  const tone = status.state === 'on' ? 'ok' : status.state === 'blocked' || status.state === 'broken' ? 'warn' : 'neutral';
  const first = firstHelp(status.platform);
  const ordered = [first, ...HELPS.filter((h) => h !== first)];

  return (
    <div className={s.card}>
      <div className={s.row}>
        <StatusPill tone={tone} dot>
          {t(`h.status.${status.state}`)}
        </StatusPill>
      </div>
      {status.state === 'ask' ? (
        <>
          <p>{t('h.browser.explain')}</p>
          <div className={s.row}>
            <Button variant="primary" icon="bell" onPress={() => void enable()}>
              {t('h.act.enable')}
            </Button>
          </div>
        </>
      ) : status.state === 'off' ? (
        <>
          <p>{t('h.browser.off')}</p>
          <div className={s.row}>
            <Button variant="primary" onPress={() => void enable()}>
              {t('h.act.turnOn')}
            </Button>
            <Button onPress={() => void test()}>{t('h.act.test')}</Button>
          </div>
        </>
      ) : status.state === 'on' ? (
        <>
          <p>{t('h.browser.on')}</p>
          <div className={s.row}>
            <Button onPress={() => void test()}>{t('h.act.test')}</Button>
            <Button variant="ghost" onPress={disable}>
              {t('h.act.disable')}
            </Button>
          </div>
        </>
      ) : status.state === 'blocked' ? (
        <div className={s.hows}>
          <p>{t('h.blocked.text')}</p>
          {ordered.map((k) => (
            <Disclosure key={k} title={t(`h.reenable.${k}.h`)} defaultExpanded={k === first}>
              <p>{t(`h.reenable.${k}`)}</p>
            </Disclosure>
          ))}
          <p className={s.help}>{t('h.blocked.after')}</p>
        </div>
      ) : status.state === 'broken' ? (
        <p>
          <Icon name="warn" size="sm" /> {t('h.broken.text')}
        </p>
      ) : status.state === 'unsupported' ? (
        <p>
          <Icon name="warn" size="sm" /> {status.why ? t(`h.why.${status.why === 'ctor' ? 'no_api' : status.why}`) : ''}
        </p>
      ) : null}
      <p className={s.live} role="status" aria-live="polite"> {/* reason: one polite line saying what the browser answered (a prompt, a test alert), not a change outcome */}
        {say}
      </p>
      <p className={s.help}>
        <FaqLink item={byId.timing}>{t('h.timing.more')}</FaqLink> · <FaqLink item={byId.email}>{t('h.closed.more')}</FaqLink>
      </p>
    </div>
  );
}
