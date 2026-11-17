// The other-page links of a computer: Logs and Bots name it by its handle, never its full id; the pages that act on
// the current computer make it current first. (links.spec.ts follows each link to its page.)
import { describe, expect, it } from 'vitest';
import { placesOf } from './parts/Elsewhere';

const c = { id: 'a'.repeat(20) + '00c3', name: 'cedar', status: 'running', project_id: 'p'.repeat(24) };

describe('computers: links to the other pages', () => {
  it('Logs and Bots are filtered to the computer by its handle, never its id', () => {
    for (const p of placesOf(c).filter((x) => x.id === 'logs' || x.id === 'bots')) {
      const q = new URL(p.href, 'http://x').searchParams;
      expect(q.get('computer')).toBe('cedar.00c3');
      expect(p.href).not.toContain(c.id);
    }
  });
  it('the pages that act on the current computer make this one current first', () => {
    expect(placesOf(c).filter((p) => p.current).map((p) => p.id)).toEqual(['schedules', 'board', 'keys']);
  });
});
