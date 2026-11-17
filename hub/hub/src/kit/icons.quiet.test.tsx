// Vitest: the two quiet severity tones: `dangerQuiet` and `warnQuiet` draw the tone's quiet ink
// (`--hx-danger-quiet`, `--hx-warn-quiet`, held at 3:1 on the card by the kit tokens), as a class like every tone.
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Icon } from './icons';
import s from './icons.module.css';

const css = readFileSync(join(import.meta.dirname, 'icons.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (cls: string) => new RegExp(`(?:^|\\})\\s*\\.${cls}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('Icon quiet tones', () => {
  it('dangerQuiet and warnQuiet take their own class', () => {
    const { container } = render(
      <>
        <Icon name="warn" tone="dangerQuiet" />
        <Icon name="warn" tone="warnQuiet" />
      </>,
    );
    const [a, b] = container.querySelectorAll('svg');
    expect(a).toHaveClass(s.toneDangerQuiet!);
    expect(b).toHaveClass(s.toneWarnQuiet!);
  });

  it('read the quiet tokens', () => {
    expect(body('toneDangerQuiet')).toMatch(/color:\s*var\(--hx-danger-quiet\)/);
    expect(body('toneWarnQuiet')).toMatch(/color:\s*var\(--hx-warn-quiet\)/);
  });
});
