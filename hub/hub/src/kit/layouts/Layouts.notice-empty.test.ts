// Vitest (source): an empty notice stack takes no place. A page passes `notice={<Bands … />}` and the band component
// may render nothing; the stack's own padding must not then stand between the header and the body.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

it('.noticeStack:empty is not displayed, after the stack rule', () => {
  const css = readFileSync(path.join(__dirname, 'Layouts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(css).toMatch(/\.noticeStack:empty\s*\{\s*display:\s*none;\s*\}/);
  expect(css.indexOf('.noticeStack:empty')).toBeGreaterThan(css.indexOf('.noticeStack {'));
});
