// ModelPickBody focus: a control that leaves under the focus (Clear filters once the list is back) does not drop the
// focus to the page body; it goes to the view heading, as in the other model pickers.
import { providers } from '@core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidence7k } from './fixtures/evidence7k';
import { ModelPickBody } from './ModelPickBody';
import { NO_MODEL_PREFS, type ModelPrefs } from './modelPickLogic';

function Host({ prefs0 }: { prefs0: ModelPrefs }) {
  const [prefs, setPrefs] = useState<ModelPrefs>(prefs0);
  return (
    <ModelPickBody
      evidence={evidence7k('threeReady')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      pick={{ prefs, onPrefs: (fn) => setPrefs((x) => fn(x)) }}
    />
  );
}
const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});
afterEach(() => vi.restoreAllMocks());

describe('ModelPickBody focus when a control leaves', () => {
  it('Search all providers, pressed from the keyboard: the focus goes to the heading, never the page body', async () => {
    const user = userEvent.setup();
    render(<Host prefs0={{ ...NO_MODEL_PREFS, readiness: 'ready', providers: ['anthropic'] }} />);
    await flush();
    screen.getByRole('button', { name: 'Search all providers' }).focus();
    await user.keyboard('{Enter}');
    await flush();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3 }));
  });
});
