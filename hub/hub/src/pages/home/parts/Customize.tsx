// The Customize Home drawer: the "Cards on Home" section (which cards show and in what order) first, then the section
// that adds a web widget (`add`). Reorder by dragging a row's grip, with the move buttons, or Alt+Up/Down on a row
// (widgets/OrderList).
import { AnatomySection, Button, Drawer, EmptyState, useStrings } from '@kit';
import type { ReactNode } from 'react';
import { OrderList } from '../widgets';
import { LAYOUT_IN_MEMORY } from './customizeWords';
import strings from '../strings.en.json';
import s from './home.module.css';

interface Props {
  all: readonly { key: string; title: string }[];
  hiddenKeys: ReadonlySet<string>;
  onToggle: (key: string, show: boolean) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onMoveTo: (key: string, to: number) => void;
  /** The Add a web widget section, under the list. */
  add?: ReactNode;
  onReset: () => void;
  onDone: () => void;
}

export function Customize({ all, hiddenKeys, onToggle, onMove, onMoveTo, add, onReset, onDone }: Props) {
  const t = useStrings(strings);
  return (
    <Drawer overlayId="home-customize-drawer" resizeKey="home-customize"
      isOpen
      onOpenChange={(open) => !open && onDone()}
      size="sm"
      title={t('customize.title')}
      subtitle={LAYOUT_IN_MEMORY ? t('customize.body.term') : t('customize.body')}
      footer={
        <>
          <Button variant="ghost" onPress={onReset}>
            {t('customize.reset')}
          </Button>
          <Button variant="primary" onPress={onDone}>
            {t('customize.done')}
          </Button>
        </>
      }
    >
      <div className={s.customizeBody}>
        <AnatomySection id="home-cards" title={t('customize.cards')}>
          {all.length === 0 ? (
            <EmptyState size="sm" icon="sliders" title={t('customize.none')} />
          ) : (
            <OrderList all={all} hiddenKeys={hiddenKeys} onToggle={onToggle} onMove={onMove} onMoveTo={onMoveTo} />
          )}
        </AnatomySection>
        {add}
      </div>
    </Drawer>
  );
}
