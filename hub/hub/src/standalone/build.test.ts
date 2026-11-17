// build.ts: the one-file Hub's build number against a Hoody's `hub_file_min`.
import { describe, expect, it } from 'vitest';
import { fileTooOld, HUB_FILE_BUILD } from './build';

describe('fileTooOld', () => {
  it('the build number is a whole number from 1', () => {
    expect(Number.isSafeInteger(HUB_FILE_BUILD) && HUB_FILE_BUILD >= 1).toBe(true);
  });

  it('refuses only a floor above this build', () => {
    expect(fileTooOld(HUB_FILE_BUILD + 1)).toBe(true);
    expect(fileTooOld(HUB_FILE_BUILD)).toBe(false);
    expect(fileTooOld(1)).toBe(false);
    expect(fileTooOld(5, 4)).toBe(true);
    expect(fileTooOld(4, 4)).toBe(false);
  });

  it('a Hoody that names no floor (older API, malformed value) never refuses', () => {
    expect(fileTooOld(null)).toBe(false);
  });
});
