// The composer's controls are one line at every width, read from source (the pictures show the drawn page): New chat's
// chips never wrap; they shrink (labels cut with an ellipsis) and Send stays at the end of the same row; the kit
// composer gives its start part the width Send leaves whenever it holds chips.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const newCss = src('NewChat.module.css');
const kitCss = src('../../../kit/agent/Conversation.module.css');
/** The declarations of the first rule whose selector is exactly `sel`. */
function rule(css: string, sel: string): string {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if ((m[1] as string).trim() === sel) return m[2] as string;
  return '';
}
describe('composer controls on one line', () => {
  it('New chat chips: one non-wrapping row that takes the room left beside + and /', () => {
    const chips = rule(newCss, '.chips');
    expect(chips).toContain('display: flex');
    expect(chips).toContain('flex: 1 1 0');
    expect(chips).toContain('min-width: 0');
    expect(chips).not.toMatch(/flex-wrap/);
  });
  it('each chip may shrink, its label cut with an ellipsis, rather than wrap', () => {
    const tsx = src('NewChat.tsx');
    expect(tsx.match(/<Button variant="ghost" size="sm" icon=[^>]*literal shrink/g)?.length).toBe(3);
  });
  it('Allow everything stays visible on the Options chip as its warning icon, in the neutral chip look', () => {
    expect(src('NewChat.tsx')).toMatch(/icon=\{approvalsNow === 'everything' \? 'warn' : 'sliders'\} literal shrink/);
    expect(src('NewChat.tsx')).not.toMatch(/tone: 'danger'/);
  });
  it('the agent chip shows the short agent name (General); the full choice stays its accessible name', () => {
    const tsx = src('NewChat.tsx');
    expect(tsx).toMatch(/aria-label=\{t\('agent\.chip', \{ name: agentChip \}\)\}>\s*\{choices\.agent\.kind === 'general' \? t\('agent\.generalShort'\) : agentChip\}/);
  });
  it('the Options chip shows the short word; its summary is in the accessible name, not cut in the label', () => {
    const tsx = src('NewChat.tsx');
    expect(tsx).toMatch(/aria-label=\{summary \? t\('options\.chipSummary', \{ summary \}\) : t\('options\.chip'\)\}>\s*\{t\('options\.chip'\)\}/);
  });
  it('kit composer: with chips the start part takes only what the end part (Send) leaves, so Send stays on the row', () => {
    expect(rule(kitCss, '.actionFit')).toContain('flex: 1 1 0');
    expect(src('../../../kit/agent/Composer.tsx')).toContain('cx(s.actionStart, p.tools !== undefined && !p.auto && s.actionFit)');
    expect(rule(kitCss, '.actionEnd')).toContain('flex: none');
  });
  it('the conversation approval chip may be cut, its warning icon kept, in the neutral chip look', () => {
    const tsx = src('../../../kit/agent/ApprovalMode.tsx');
    expect(tsx).toMatch(/icon=\{state === 'everything' \? 'warn' : 'lock'\} literal shrink/);
    expect(tsx).not.toMatch(/state === 'everything' \? \{ tone: 'danger'/);
  });
});
