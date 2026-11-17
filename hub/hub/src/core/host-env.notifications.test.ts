// notifications.ts registers its document and window listeners as one group: where the first cannot attach (no
// document), the rest are skipped, and that is its own catch's business, never an error thrown at the env's resolve.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetHostEnvForTests } from './host-env';
import { notificationSummary } from './notifications';
import { boot, onFetch, R1 } from './test/env';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetHostEnvForTests(); });

describe('notifications registrations in the load window', () => {
  it('no document: the visibility registration fails, the storage and pageshow ones are skipped, nothing is thrown', () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: { unread_count: 0, is_capped: false, latest_id: null, latest_created_at: null } } }));
    resetHostEnvForTests({ unresolved: true });
    const add = vi.spyOn(window, 'addEventListener');
    vi.stubGlobal('document', undefined);
    expect(() => notificationSummary()).not.toThrow();
    vi.unstubAllGlobals();
    expect(add.mock.calls.filter(([n]) => n === 'storage' || n === 'pageshow')).toHaveLength(0);
  });
});
