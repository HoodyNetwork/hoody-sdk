// One Home web widget: a kit Widget holding the page in a sandboxed frame, or, for an address the Hub page may not
// frame, the "can't be shown here" note with Open in a new tab.
//
// Contract, in plain words:
//   - The frame's attributes are fixed (FRAME_SANDBOX, allow="" , referrerpolicy no-referrer, loading lazy): scripts,
//     forms and popups run inside the framed page's own origin; it can never navigate the Hub (no top navigation of
//     any kind), and gets no camera, microphone, clipboard or fullscreen. No message from a widget is ever read.
//   - The address shows only through the kit AddressText (ids masked, isolated as left-to-right text); the name only as
//     text inside Hub strings. Open uses window.open with noopener and noreferrer.
//   - "Still loading" shows when a frame that is on screen has not loaded in SLOW_MS (a site that refuses to be framed
//     cannot be told apart from a slow one: both keep Open in a new tab).
import { AddressText, Button, ConfirmDialog, Dialog, EmptyState, TextField, Widget, WidgetTitle, useStrings, type MenuEntry, openOutside } from '@kit';
import { useState } from 'react';
import { cleanName, NAME_MAX, type WidgetSize } from './model';
import type { UrlCard, UrlWidgets } from './store';
import strings from './strings.en.json';
import { Frame } from './UrlFrame';
import s from './widgets.module.css';

export { FRAME_SANDBOX, SLOW_MS } from './UrlFrame';

const openTab = (url: string) => {
  openOutside(url);
};

interface Props {
  card: UrlCard;
  web: Pick<UrlWidgets, 'rename' | 'resize' | 'remove'>;
  onHide: (key: string) => void;
}

export function UrlWidgetCard({ card, web, onHide }: Props) {
  const t = useStrings(strings);
  const [generation, setGeneration] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const name = card.title;
  const sizes: readonly [WidgetSize, 'menu.small' | 'menu.medium' | 'menu.large'][] = [['s', 'menu.small'], ['m', 'menu.medium'], ['l', 'menu.large']];
  const menu: MenuEntry[] = [
    { id: 'open', label: t('menu.open', { name }), icon: 'external', onAction: () => openTab(card.url) },
    ...(card.frame ? [{ id: 'reload', label: t('menu.reload', { name }), icon: 'reload' as const, onAction: () => setGeneration((g) => g + 1) }] : []),
    { id: 'rename', label: t('menu.rename', { name }), icon: 'pen', onAction: () => setRenaming(card.name) },
    '-',
    ...sizes.map(([size, key]) => ({ id: `size-${size}`, label: t(key), checked: card.size === size, onAction: () => web.resize(card.id, size) })),
    '-',
    { id: 'hide', label: t('menu.hide', { name }), icon: 'eye-off', onAction: () => onHide(card.key) },
    { id: 'remove', label: t('menu.remove', { name }), icon: 'trash', onAction: () => setRemoving(true) },
  ];
  const nameBad = renaming !== null && cleanName(renaming) === null;
  return (
    <Widget size={card.size} className={s.card} title={<WidgetTitle><bdi>{name}</bdi></WidgetTitle>} menu={menu} flush={card.frame}>
      <div className={s.body} data-size={card.size} data-frame={card.frame || undefined}>
        {card.frame ? (
          <Frame key={generation} url={card.url} name={name} />
        ) : (
          <EmptyState
            size="sm"
            icon="globe"
            title={t('card.blocked')}
            body={t('card.blockedBody')}
            action={
              <Button variant="secondary" icon="external" onPress={() => openTab(card.url)}>
                {t('card.open')}
              </Button>
            }
          />
        )}
        <p className={s.address}>
          <AddressText url={card.url} />
        </p>
      </div>
      <Dialog
        overlayId="home-widget-rename"
        isOpen={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={t('rename.title')}
        primaryLabel={t('rename.save')}
        primaryDisabled={nameBad}
        onPrimary={() => {
          if (renaming !== null && web.rename(card.id, renaming)) setRenaming(null);
        }}
      >
        <TextField label={t('rename.label')} description={t('rename.hint')} value={renaming ?? ''} onChange={setRenaming} maxLength={NAME_MAX + 20} errorMessage={nameBad ? t('add.nameBad') : undefined} />
      </Dialog>
      <ConfirmDialog
        overlayId="home-widget-remove"
        isOpen={removing}
        onOpenChange={setRemoving}
        tone="danger"
        title={t('remove.title')}
        body={t('remove.body', { name })}
        confirmLabel={t('remove.confirm')}
        onConfirm={() => {
          web.remove(card.id);
          setRemoving(false);
        }}
      />
    </Widget>
  );
}
