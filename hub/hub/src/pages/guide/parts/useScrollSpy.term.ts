// Terminal: the Guide's sections are drawn in one prim Scroll; there are no element tops to measure, so "the section
// the reader is in" is the one last jumped to (index pick, J / K, a #hash link), starting at the first. A jump marks it
// current and brings its card into view in the page's scroll (kit focusSection: the section's anchor `guide-<id>`, as
// the web scrolls to its heading); a deep link's jump on arrival is held there while the sections above it load (the
// scroll owner's own anchoring). The focus stays where it was (the web moves it to the heading, which a terminal does
// not focus). Not here: the web's read line and hold, so scrolling by hand does not move the mark.
import { focusSection } from '@kit';
import { useCallback, useEffect, useState } from 'react';
import type * as Web from './useScrollSpy';
import type { SectionId } from '../logic';

export const useScrollSpy: typeof Web.useScrollSpy = (order) => {
  const [current, setCurrent] = useState<SectionId | undefined>(order[0]);
  // A current section that left the list falls back to the first, as the web spy marks only sections on the page.
  const shown = current !== undefined && order.includes(current) ? current : order[0];
  const jump = useCallback((id: SectionId) => {
    setCurrent(id);
    focusSection(`guide-${id}`);
  }, []);
  return [shown, jump];
};

export const useFollowSection: typeof Web.useFollowSection = (id, ready, followed, jump, visible) => {
  useEffect(() => {
    if (id === followed.current) return;
    followed.current = null;
    if (!id || !ready || !visible.includes(id)) return;
    followed.current = id;
    jump(id, false);
  }, [id, ready, followed, jump, visible]);
};
