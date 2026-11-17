// The gallery's shell sample is a command the Hoody CLI takes: output format is `-o json` (`--json` is not a flag).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'view.tsx'), 'utf8');

describe('gallery syntax samples', () => {
  it('the shell sample asks for JSON with -o json', () => {
    const bash = /\['bash', '([^']*)'\]/.exec(src)?.[1] ?? '';
    expect(bash).toContain('hoody computers list');
    expect(bash).toContain('-o json');
    expect(bash).not.toMatch(/--json\b/);
  });
});
