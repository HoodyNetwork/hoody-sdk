// Focus that survives forced colours in the chat's own controls. The draft box takes the text-entry focus ring of every kit field
// (fieldBox.module.css) and the "/" and "@" lists mark their active row; forced colours drop box-shadow and backgrounds, so each
// also has a solid Highlight outline there.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
/** The declarations of `sel` inside `@media (forced-colors: active)` blocks ('' when there is none). */
function forced(css: string, sel: string): string {
  const out: string[] = [];
  const re = /@media\s*\(forced-colors:\s*active\)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    const body = css.slice(re.lastIndex, i - 1);
    const at = body.indexOf(sel);
    if (at >= 0) out.push(body.slice(at, body.indexOf('}', at)));
  }
  return out.join('\n');
}

describe('chat focus in forced colours', () => {
  const conv = read('Conversation.module.css');
  it('the draft box shows the kit focus ring while anything in it has focus', () => {
    expect(conv).toMatch(/\.composer:focus-within\s*\{[^}]*box-shadow:\s*var\(--focus-ring\)/);
  });
  it('the draft box has a Highlight outline in forced colours', () => {
    expect(forced(conv, '.composer:focus-within')).toMatch(/outline:\s*var\(--bw-2\)\s*solid\s*Highlight/i);
  });
  it('the "/" and "@" lists mark their active row in forced colours', () => {
    expect(forced(read('SlashMenu.module.css'), '.item[data-focused]')).toMatch(/outline:\s*var\(--bw-2\)\s*solid\s*Highlight/i);
  });
});
