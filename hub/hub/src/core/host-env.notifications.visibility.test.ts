// notifications.ts at a visibility event: the callback reads visibility inside its own hidden() catch, exactly as when
// it was attached to the document directly. (Its own file: notifications wires its listeners once per module.)
import { afterEach, describe, expect, it } from 'vitest';
import { onNotificationSummary } from './notifications';
import { boot, calls, onFetch, settle } from './test/env';

afterEach(() => { Reflect.deleteProperty(document, 'visibilityState'); });

describe('notifications at a visibility event', () => {
  it('a visibility getter that throws reads as not hidden (its own hidden() catch): the poller still checks', async () => {
    boot();
    const get = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    get('hidden');
    onFetch(() => ({ status: 200, body: { data: { unread_count: 1, is_capped: false, latest_id: 'n1', latest_created_at: '2026-10-23T08:00:00Z' } } }));
    onNotificationSummary(() => {});
    for (let i = 0; i < 20; i++) await settle();
    const polled = () => calls.filter((c) => c.url.includes('/notifications/summary')).length;
    expect(polled()).toBe(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => { throw new Error('getter'); } });
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 20; i++) await settle();
    expect(polled()).toBe(1);
  });
});
