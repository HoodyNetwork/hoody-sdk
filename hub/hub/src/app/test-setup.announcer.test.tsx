// Vitest: app/test-setup.ts ends React Aria's live announcer after every test. Its first message, made inside a Testing
// Library async step (findBy*, waitFor and userEvent turn IS_REACT_ACT_ENVIRONMENT off), waits 100 ms on a timer; left
// running past a file's last test, that timer reads document after the test environment is gone and fails the whole run
// with an unhandled error although every test passed. The next test (or the end of the file) finds no region, and the
// waiting message writes nothing.
import { announce } from 'react-aria/private/live-announcer/LiveAnnouncer';
import { describe, expect, it } from 'vitest';

const region = () => document.querySelector('[data-live-announcer]');

describe('the live announcer between tests', () => {
  it('a first message made in an async step waits on its timer when the test ends', () => {
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const was = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false; // what Testing Library's async utilities set while they run
    try {
      announce('Saved', 'polite');
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = was;
    }
    // The control: the region is on the page and the message is not written yet.
    expect(region()).not.toBeNull();
    expect(region()?.textContent).toBe('');
  });

  it('is gone in the next test, and the waiting message writes nothing', async () => {
    expect(region()).toBeNull();
    await new Promise((done) => setTimeout(done, 150));
    expect(region()).toBeNull();
    expect(document.body.textContent).not.toContain('Saved');
  });
});
