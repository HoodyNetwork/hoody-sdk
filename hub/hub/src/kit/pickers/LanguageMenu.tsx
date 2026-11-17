// The language choice: a menu of the languages Hoody is written in (kit/locales.ts), each under its own name, the
// current one checked. A language the caller does not mark available stays in the list and in the arrow-key order,
// says why once at the top of the menu, and choosing it does nothing. Its own trigger is a button showing the current
// language; a host with its own row (the account menu) passes `trigger={null}`, an anchor and the open state.
import type { ReactElement, RefObject } from 'react';
import { Button, type ButtonProps } from '../controls/Button';
import { HUB_LOCALES, localeName } from '../locales';
import { ActionMenu } from '../overlays/Menu';
import { useIsPhone } from '../overlays/shared';
import { useStrings } from '../strings';
import strings from './LanguageMenu.strings.en.json';

export interface LanguageMenuProps {
  /** The codes that can be chosen (kit/locales.ts); every other language shows as coming soon. */
  available: readonly string[];
  /** The code of the language in use. */
  current: string;
  /** Called with the code of an available language other than the current one. */
  onChange?: (code: string) => void;
  /** `null` with `anchor` and `isOpen`: no button of its own (ActionMenu `trigger`). */
  trigger?: ReactElement | null;
  anchor?: RefObject<Element | null>;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: 'bottom start' | 'bottom end' | 'top start' | 'top end';
}

export function LanguageMenu({ available, current, onChange, trigger, anchor, isOpen, onOpenChange, placement = 'bottom start' }: LanguageMenuProps) {
  const t = useStrings(strings);
  const open = (code: string) => code === current || available.includes(code);
  const waiting = HUB_LOCALES.some((l) => !open(l.code));
  // The phone tray carries the menu's name as its title: the list is named, with no second "Language" heading under it.
  const tray = useIsPhone();
  return (
    <ActionMenu
      label={t('language.title')}
      placement={placement}
      trigger={trigger === undefined ? <LanguageButton current={current} /> : trigger}
      {...(anchor ? { anchor } : {})}
      {...(isOpen !== undefined ? { isOpen } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      items={[
        {
          id: 'language',
          ...(tray ? { name: t('language.title') } : { label: t('language.title') }),
          select: 'one',
          current,
          ...(waiting ? { note: t('language.note') } : {}),
          items: HUB_LOCALES.map((l) => ({
            id: l.code,
            label: l.name,
            isDisabled: !open(l.code),
            onAction: () => {
              if (l.code !== current) onChange?.(l.code);
            },
          })),
        },
      ]}
    />
  );
}

/** The menu's own trigger: the current language under its own name, named "Language: English". What the menu gives
 *  its trigger (the terminal menu hands it the opener as `onPress`) goes on to the button. */
function LanguageButton({ current, ...rest }: { current: string; onPress?: ButtonProps['onPress'] }) {
  const t = useStrings(strings);
  const name = localeName(current);
  return (
    <Button {...rest} iconEnd="chevron-down" literal aria-label={t('language.named', { name })}>
      {name}
    </Button>
  );
}
