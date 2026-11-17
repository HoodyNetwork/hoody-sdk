// The language in This browser: the same list as the account menu's Language row (kit LanguageMenu). The Hub is in
// English; the other languages show as coming soon, and nothing is kept or sent.
import { HUB_LOCALE, LanguageMenu, SettingRow, useStrings } from '@kit';
import strings from '../strings.en.json';

export function LanguageRow() {
  const t = useStrings(strings);
  return (
    <SettingRow label={t('lang.label')} help={t('lang.help')}>
      <LanguageMenu available={[HUB_LOCALE]} current={HUB_LOCALE} />
    </SettingRow>
  );
}
