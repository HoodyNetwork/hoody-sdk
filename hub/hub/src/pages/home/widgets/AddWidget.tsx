// The "Add a web widget" section of Customize: an address and an optional name. A refusal says why on its field;
// nothing is stored for it. While nothing can be added, the section's description says why.
import { AnatomySection, Button, Form, TextField, useStrings } from '@kit';
import { useState } from 'react';
import { URL_MAX } from './url';
import { NAME_MAX } from './model';
import type { AddResult } from './store';
import strings from './strings.en.json';

interface Props {
  onAdd: (url: string, name: string) => AddResult;
  full: boolean;
  realmKnown: boolean;
}

type UrlKey = 'add.refused.empty' | 'add.refused.scheme' | 'add.refused.bad' | 'add.refused.long' | 'add.refused.credentials' | 'add.refused.hub';

export function AddWidget({ onAdd, full, realmKnown }: Props) {
  const t = useStrings(strings);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [urlError, setUrlError] = useState<UrlKey | null>(null);
  const [nameError, setNameError] = useState(false);
  const blocked = !realmKnown ? t('add.noRealm') : full ? t('add.full') : null;
  const submit = () => {
    const r = onAdd(url, name);
    setUrlError(null);
    setNameError(false);
    // Added: the widget shows on Home in place, and the form empties (no toast: on a phone it covered the drag grip).
    if ('ok' in r) {
      setUrl('');
      setName('');
      return;
    }
    if (r.refused === 'name') setNameError(true);
    else if (r.refused !== 'full' && r.refused !== 'no-realm' && r.refused !== 'unsaved') setUrlError(`add.refused.${r.refused}`);
  };
  return (
    <AnatomySection id="home-web-add" title={t('add.title')} description={blocked ?? t('add.body')}>
      <Form onSubmit={submit} locked={blocked !== null}>
        <TextField
          label={t('add.url')}
          placeholder={t('add.urlPlaceholder')}
          inputMode="url"
          autoComplete="off"
          spellCheck="false"
          value={url}
          onChange={(v) => { setUrl(v); setUrlError(null); }}
          maxLength={URL_MAX + 64}
          errorMessage={urlError ? t(urlError) : undefined}
          focusOnError
        />
        <TextField label={t('add.name')} value={name} onChange={(v) => { setName(v); setNameError(false); }} maxLength={NAME_MAX + 20} errorMessage={nameError ? t('add.nameBad') : undefined} />
        <Button type="submit" variant="secondary" icon="plus" isDisabled={blocked !== null}>
          {t('add.submit')}
        </Button>
      </Form>
    </AnatomySection>
  );
}
