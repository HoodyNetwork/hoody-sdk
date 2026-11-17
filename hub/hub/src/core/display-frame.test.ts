// The frame a display viewer is drawn in (a computer's desktop, a VM's screen): one set of constants in core, read by
// every page that embeds one.
import { describe, expect, it } from 'vitest';
import * as core from './index';
import { DISPLAY_FRAME_FEATURES, DISPLAY_FRAME_SANDBOX, DISPLAY_FRAME_SLOW_MS, displayFrameAllow } from './display-frame';

const DESK = 'https://p1-c1-display-7001.sv1.computers.example/';
const grants = (origin: string) => DISPLAY_FRAME_FEATURES.map((f) => `${f} ${origin}`).join('; ');

describe('display frame constants', () => {
  it('the sandbox lets the viewer run and never lets it move or prompt the Hub', () => {
    expect(DISPLAY_FRAME_SANDBOX).toBe('allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock');
    for (const w of ['allow-top-navigation', 'allow-modals', 'allow-downloads']) expect(DISPLAY_FRAME_SANDBOX).not.toContain(w);
  });
  it('the features are clipboard, fullscreen and keyboard-map, nothing else', () => {
    expect(DISPLAY_FRAME_FEATURES).toEqual(['clipboard-read', 'clipboard-write', 'fullscreen', 'keyboard-map']);
  });
  it('the slow line is 20 s', () => {
    expect(DISPLAY_FRAME_SLOW_MS).toBe(20_000);
  });
  it('the barrel exports the very values', () => {
    expect(core.DISPLAY_FRAME_SANDBOX).toBe(DISPLAY_FRAME_SANDBOX);
    expect(core.DISPLAY_FRAME_FEATURES).toBe(DISPLAY_FRAME_FEATURES);
    expect(core.DISPLAY_FRAME_SLOW_MS).toBe(DISPLAY_FRAME_SLOW_MS);
    expect(core.displayFrameAllow).toBe(displayFrameAllow);
  });
});

describe('displayFrameAllow', () => {
  it('grants each feature to exactly the given https origins, each once', () => {
    expect(displayFrameAllow([DESK, DESK])).toBe(grants(new URL(DESK).origin));
  });
  it('keeps no plain-http, script, user-info, IP, wildcard or unparsable address', () => {
    expect(displayFrameAllow(['', 'http://plain.example', 'javascript:alert(1)', 'not a url', 'https://user@host.example/', 'https://@host.example/', 'https://127.0.0.1/', 'https://127.1/', 'https://[::1]/', 'https://*.example.com/'])).toBe('');
    expect(displayFrameAllow(['https://*.example.com/', DESK, 'https://127.1/'])).toBe(grants(new URL(DESK).origin));
  });
});
