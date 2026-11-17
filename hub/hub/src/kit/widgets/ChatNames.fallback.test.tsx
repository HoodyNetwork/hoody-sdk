// Vitest: when an app's mark cannot draw, the name still shows as plain text with no empty gap
// before it (the gap belongs to the mark), and the sentence reads the same.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { interpolate } from '../strings';

vi.mock('../icons', () => ({ Icon: () => null }));

describe('ChatNames without a mark', () => {
  it('shows each name plainly, first in its span, and the sentence unchanged', async () => {
    const { CHAT_SLOTS, ChatNames } = await import('./ChatNames');
    const box = render(<p><ChatNames text={interpolate('In {{telegram}}, {{slack}} or {{discord}}.', CHAT_SLOTS)} /></p>).container;
    expect(box.textContent).toBe('In Telegram, Slack or Discord.');
    expect(box.querySelector('svg')).toBeNull();
    const apps = box.querySelectorAll('[data-chat-app]');
    expect(apps).toHaveLength(3);
    for (const a of apps) {
      expect(a.childNodes).toHaveLength(1);
      expect(a.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    }
  });
});
