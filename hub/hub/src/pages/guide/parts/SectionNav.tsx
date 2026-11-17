// The sticky section index on the left (a strip above the content on a narrow page), in the kit's section-menu look
// (a dashed rail, the current item an ink bar and semibold text); the strip sets its own look through the menu's hooks (guide.module.css).
import { Kbd, SectionMenuItem, useStrings } from '@kit';
import { useEffect, useRef } from 'react';
import { links } from '../links';
import strings from '../strings.en.json';
import type { SectionId } from '../logic';
import { IndexList } from './IndexList';
import s from './guide.module.css';

interface Props {
  sections: readonly SectionId[];
  current: SectionId | undefined;
  onPick: (id: SectionId) => void;
}

export function SectionNav({ sections, current, onPick }: Props) {
  const t = useStrings(strings);
  const nav = useRef<HTMLElement>(null);

  // On a phone the index is a strip: keep the current tab in view.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="location"]');
    if (el && nav.current && nav.current.scrollWidth > nav.current.clientWidth) {
      nav.current.scrollTo({ left: el.offsetLeft - 24, behavior: 'auto' });
    }
  }, [current]);

  return (
    <nav className={s.index} aria-label={t('sections.label')} ref={nav}>
      <IndexList>
      {sections.map((id) => (
        <SectionMenuItem
          key={id}
          href={`#${links.section(id)}`}
          current={id === current}
          aria-current={id === current ? 'location' : undefined}
          onClick={(e) => {
            // A new tab, copy-link or modified click keeps the real URL.
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onPick(id);
          }}
        >
          {t(`ix.${id}`)}
        </SectionMenuItem>
      ))}
      </IndexList>
      <p className={s.hint}>
        <Kbd>{t('ix.key.j')}</Kbd> <Kbd>{t('ix.key.k')}</Kbd> {t('ix.hintAfter')}
      </p>
    </nav>
  );
}
