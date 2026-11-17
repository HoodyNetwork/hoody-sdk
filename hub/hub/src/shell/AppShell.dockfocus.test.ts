// The shell moves focus into the Ask dock only through kit/ask focusAskDock(), the one dock focus (its
// selector skips disabled controls, tabindex ones included); AppShell keeps no copy of that selector.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'AppShell.tsx'), 'utf8');

describe('AppShell dock focus', () => {
  it('calls kit/ask focusAskDock for every move into the dock, and holds no dock selector of its own', () => {
    expect(src).toMatch(/import \{[^}]*\bfocusAskDock\b[^}]*\} from '@kit\/ask';/);
    expect(src).not.toMatch(/function focusDock\b/);
    expect(src).not.toMatch(/\bfocusDock\(/);
    // A dock control selector (the copy that let a disabled tabindex control take focus).
    expect(src).not.toMatch(/\[tabindex\]:not\(\[tabindex="-1"\]\)/);
    expect(src).not.toMatch(/button:not\(/);
    expect(src.match(/\bfocusAskDock\(\)/g)?.length).toBe(3);
  });
});
