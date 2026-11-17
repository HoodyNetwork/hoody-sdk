// The shell's copy of the Notifications page routes matches the page's own (the drift guard for paths.ts).
import { describe, expect, it } from 'vitest';
import { SECTIONS } from '@core/shell';
import { links } from '../../pages/notifications/links';
import { notifyPaths } from './paths';

describe('notifyPaths', () => {
  it('match the Notifications page links', () => {
    expect(notifyPaths.inbox).toBe(links.inbox);
    for (const id of SECTIONS) expect(notifyPaths.learnSection(id)).toBe(links.learnSection(id));
  });
});
