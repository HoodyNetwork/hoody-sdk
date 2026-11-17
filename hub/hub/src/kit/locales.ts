// The languages Hoody's sign-in pages are written in, each under its own name. The Hub itself is in English: a
// LanguageMenu lists these and offers only the ones its caller marks available.
export interface HubLocale {
  /** The code the sign-in pages use ('zht', 'br'). */
  code: string;
  /** The language's own name, shown as written in every language. */
  name: string;
  /** The BCP 47 tag the sign-in pages give the code (the code itself, but zh-TW for 'zht' and pt-BR for 'br'). */
  tag: string;
}

export const HUB_LOCALES: readonly HubLocale[] = [
  { code: 'en', name: 'English', tag: 'en' },
  { code: 'ar', name: 'العربية', tag: 'ar' },
  { code: 'br', name: 'Português (Brasil)', tag: 'pt-BR' },
  { code: 'bs', name: 'Bosanski', tag: 'bs' },
  { code: 'da', name: 'Dansk', tag: 'da' },
  { code: 'de', name: 'Deutsch', tag: 'de' },
  { code: 'es', name: 'Español', tag: 'es' },
  { code: 'fr', name: 'Français', tag: 'fr' },
  { code: 'ja', name: '日本語', tag: 'ja' },
  { code: 'ko', name: '한국어', tag: 'ko' },
  { code: 'no', name: 'Norsk', tag: 'no' },
  { code: 'pl', name: 'Polski', tag: 'pl' },
  { code: 'ru', name: 'Русский', tag: 'ru' },
  { code: 'th', name: 'ไทย', tag: 'th' },
  { code: 'zh', name: '简体中文', tag: 'zh' },
  { code: 'zht', name: '繁體中文', tag: 'zh-TW' },
];

/** The language the Hub is written in. */
export const HUB_LOCALE = 'en';

/** A language's own name; the code itself for one the list does not hold. */
export const localeName = (code: string): string => HUB_LOCALES.find((l) => l.code === code)?.name ?? code;
