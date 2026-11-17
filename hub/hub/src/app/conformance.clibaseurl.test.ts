// A hoody CLI command gets --base-url only from kit cliCommand, which adds it only when the
// platform's API is not the CLI's default (on hoody.com never). A hand-written flag naming a Hoody API fails here, in any
// hub/src file but the helper's own test.
// A guard against accidents, not a parser: it reads raw text, so a comment or prose naming the flag
// with a URL trips it too; a flag built from split strings, or a JSON command with a variable URL, is not caught.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const HELPER_TEST = 'kit/widgets/cliCommand.test.ts';
const SELF = 'app/conformance.clibaseurl.test.ts';
const HELPER = 'kit/widgets/platformText.ts';
// Built in two parts so this file does not hold what it bans: the flag with a URL after it, in any spelling a shell takes.
const FLAG_URL = new RegExp(['--base', '-url(?:\\s+|=)[\'"`]?https?:'].join(''), 'i');
const FLAG = ['--base', '-url'].join('');
const isProduct = (f: string) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f);

describe('no hand-written --base-url', () => {
  it('no hub/src file but cliCommand and its test writes the flag with a URL ("--base-url https://…", "=", quoted)', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split(sep).join('/'))
      .filter((f) => /\.(tsx?|json|md|css)$/.test(f) && f !== HELPER && f !== HELPER_TEST && f !== SELF);
    expect(files.length).toBeGreaterThan(500);
    const hits = files.filter((f) => FLAG_URL.test(readFileSync(join(SRC, f), 'utf8')));
    expect(hits, `a command line shown to a person comes from the kit cliCommand() (${HELPER}), which adds the address flag itself: never write the flag with a URL in a string, a fixture or a doc`).toEqual([]);
  });

  it('no product source but kit platformText.ts (cliCommand) writes the flag at all, so no line builds it by hand', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split(sep).join('/'))
      .filter((f) => isProduct(f) && f !== HELPER);
    const hits = files.filter((f) => readFileSync(join(SRC, f), 'utf8').includes(FLAG));
    expect(hits, `build the command with the kit cliCommand() (${HELPER}) and show it in a CodeBlock or CodeLine; no product file writes the flag itself`).toEqual([]);
  });
});
