// Popover `anchor`, the gallery's specimen: a slot-sized region whose popover opens from its button
// but is placed against the region's top edge, centred (placement bottom), as the Board's empty slot places its picker.
// Kit-internal on purpose, like ToolbarScopeSpecimen: the gallery passes the words; kit/overlays/popanchor.spec.ts
// measures it.
import { useRef } from 'react';
import { Button } from '../controls/Button';
import { Popover } from './Popover';
import s from './PopoverAnchorSpecimen.module.css';

export interface PopoverAnchorLabels {
  region: string;
  open: string;
  title: string;
  body: string;
}

export function PopoverAnchorSpecimen({ labels }: { labels: PopoverAnchorLabels }) {
  const edge = useRef<HTMLSpanElement>(null);
  return (
    <div role="group" aria-label={labels.region} className={s.region}>
      <span ref={edge} className={s.edge} aria-hidden="true" />
      <Popover anchor={edge} placement="bottom" trigger={<Button icon="plus" literal>{labels.open}</Button>} label={labels.title} title={labels.title} width="sm">
        <p className={s.body}>{labels.body}</p>
      </Popover>
    </div>
  );
}
