// @vitest-environment node
// kit/voice/audio.ts: a failed engine creation (a worklet that does not load) closes the context it made and is
// forgotten, so the next press starts clean and no AudioContext is left open.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('voiceEngine creation', () => {
  it('closes the context of every failed creation and tries again on the next press', async () => {
    const made: { closed: boolean }[] = [];
    vi.stubGlobal('AudioContext', class {
      closed = false;
      sampleRate = 48000;
      state = 'running';
      audioWorklet = { addModule: () => Promise.reject(new Error('blocked')) };
      constructor() { made.push(this); }
      close() { this.closed = true; return Promise.resolve(); }
    });
    const { voiceEngine } = await import('./audio');
    for (let i = 0; i < 3; i++) await expect(voiceEngine()).rejects.toThrow('blocked');
    expect(made.length).toBe(3);
    expect(made.every((c) => c.closed)).toBe(true);
  });
});
