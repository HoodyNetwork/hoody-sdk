// Vitest: where Show and a closed sheet put focus on a gate's card.
import { describe, expect, it } from 'vitest';
import { focusCard } from './focusCard';

function card(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<section data-ask-gate>${html}</section>`;
  document.body.appendChild(wrap);
  return wrap;
}

describe('focusCard', () => {
  it('control: the first enabled control outside a code block, not the code Copy button', () => {
    const w = card('<figure><button id="copy">Copy code</button></figure><button id="send" disabled>Send answer</button><button id="allow">Allow once</button>');
    focusCard(w);
    expect(document.activeElement?.id).toBe('allow');
  });
  it('control: a question input comes before its disabled Send', () => {
    const w = card('<input id="q"><button id="send" disabled>Send answer</button>');
    focusCard(w);
    expect(document.activeElement?.id).toBe('q');
  });
  it('control: a card with only a link (a helper gate) focuses the link', () => {
    const w = card('<p>Open the agent</p><a id="agent" href="https://example.invalid/">Agent</a>');
    focusCard(w);
    expect(document.activeElement?.id).toBe('agent');
  });
  it('control: nothing enabled in it: the card itself takes focus', () => {
    const w = card('<button disabled>Allow once</button>');
    focusCard(w);
    expect(document.activeElement?.hasAttribute('data-ask-gate')).toBe(true);
  });
  it('card: the card itself even when it has controls', () => {
    const w = card('<button id="allow">Allow once</button>');
    focusCard(w, 'card');
    expect(document.activeElement?.hasAttribute('data-ask-gate')).toBe(true);
  });
});
