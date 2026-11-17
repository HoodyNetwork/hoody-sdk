// Agent sign-in lifetime: how many days an agent stays signed in from this browser. Kept in this browser only;
// the page's sticky save bar saves it.
import { TextField, useStrings, SettingRow } from '@kit';
import strings from '../strings.en.json';

export interface AgentSectionProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

export function AgentSection({ value, onChange, error }: AgentSectionProps) {
  const t = useStrings(strings);
  return (
    <SettingRow label={t('ag.row')} help={t('ag.rowHelp')}>
      <TextField
        aria-label={t('ag.days')}
        description={t('ag.help')}
        inputMode="numeric"
        maxLength={3}
        mono
        value={value}
        onChange={onChange}
        errorMessage={error}
      />
    </SettingRow>
  );
}
