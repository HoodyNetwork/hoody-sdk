// A custom endpoint's key step and its definition revision. The step reads the
// endpoint's revision when it opens; until it has a non-empty one, Save stays off and the step says why. A send
// goes only with that revision and only under `guard()`: the step's read attempt is still the open one (Back, a
// new read or leaving ends it) and the Hub context captured when the step opened (account, realm, generation and
// the computer shown then: core's step scope, which stays dead once any of them changed) still holds. The same
// guard decides whether a save's answer may still be shown. A changed endpoint (409) asks to read it again before a
// new key can go. The KeySetup kit step and the AI page's KeyStep share this, so the rule has one home.
import { providers } from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { Spinner } from '../states/States';
import { useStrings } from '../strings';
import strings from './ProviderSetup.strings.en.json';
import s from './ProviderSetup.module.css';

export type EndpointRevState = { s: 'off' } | { s: 'reading' } | { s: 'ok'; rev: string } | { s: 'failed' } | { s: 'changed' };

export interface EndpointRev {
  state: EndpointRevState;
  /** Reads the revision again (Try again, Read again); ends any read or send guard taken before. */
  read: () => void;
  /** The guard for one send, taken when the send starts; also asked before its answer is shown. */
  guard: () => () => boolean;
  /** The endpoint answered definition_changed: Save stays off until a new read. */
  changed: () => void;
}

/** `on` false (a built-in provider): nothing is read and the state stays "off". */
export function useEndpointRev(api: providers.ProvidersApi, providerId: string, on: boolean): EndpointRev {
  const [state, setState] = useState<EndpointRevState>(on ? { s: 'reading' } : { s: 'off' });
  const [scope] = useState(() => providers.stepScope());
  const attempt = useRef(0);
  const open = useRef(true);

  const read = useCallback(() => {
    const at = ++attempt.current;
    setState({ s: 'reading' });
    void providers.readEndpointRev(api, providerId).then((r) => {
      if (!open.current || attempt.current !== at) return;
      setState(r.state === 'ok' ? { s: 'ok', rev: r.rev } : { s: 'failed' });
    });
  }, [api, providerId]);

  useEffect(() => providers.watchStepScope(scope), [scope]);
  useEffect(() => {
    open.current = true;
    if (on) read();
    return () => {
      open.current = false;
      attempt.current += 1;
    };
  }, [on, read]);

  const guard = useCallback(() => {
    const at = attempt.current;
    return () => open.current && attempt.current === at && providers.stepScopeLive(scope);
  }, [scope]);

  const changed = useCallback(() => {
    attempt.current += 1;
    setState({ s: 'changed' });
  }, []);

  return { state, read, guard, changed };
}

/** What the step says about the revision: reading, a failed read with Try again, a changed endpoint with Read again. */
export function EndpointRevNote({ rev, endpoint }: { rev: EndpointRev; endpoint: string }) {
  const t = useStrings(strings);
  const st = rev.state;
  if (st.s === 'reading') {
    return (
      <p className={`${s.muted} ${s.actions}`} role="status">
        <Spinner />
        {t('ep.reading', { endpoint })}
      </p>
    );
  }
  if (st.s !== 'failed' && st.s !== 'changed') return null;
  return (
    <div className={s.actions}>
      <p role="alert">{t(st.s === 'failed' ? 'ep.readFailed' : 'ep.changed', { endpoint })}</p>
      <Button variant="secondary" size="sm" onPress={rev.read}>
        {t(st.s === 'failed' ? 'ep.tryAgain' : 'ep.readAgain')}
      </Button>
    </div>
  );
}
