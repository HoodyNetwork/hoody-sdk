// computerChoiceRev: it moves on every choice a person makes and never on core's or the
// shell's own picks, so a flow that captured it at a press can tell "nobody chose since" from "chose and came back".
import { beforeEach, describe, expect, it } from 'vitest';
import { chooseComputer, chooseNoComputer, computerChoiceRev, dropComputer, noComputerChosen } from './index';
import { snapshot } from './ctx';
import { boot } from './test/env';

const X = { id: 'cx', project_id: 'p1' };
const Y = { id: 'cy', project_id: 'p1' };

describe('computerChoiceRev', () => {
  beforeEach(() => { boot({ target: null }); });

  it('a person\'s pick moves it; an auto pick shows the computer without moving it', () => {
    const r0 = computerChoiceRev();
    expect(chooseComputer(X, { auto: true })).toBe(true);
    expect(snapshot().target?.container.id).toBe('cx');
    expect(computerChoiceRev()).toBe(r0);
    chooseComputer(Y);
    expect(computerChoiceRev()).toBe(r0 + 1);
  });

  it('X then All computers moves it twice: back where it started is still a change', () => {
    const r0 = computerChoiceRev();
    chooseComputer(X);
    chooseNoComputer();
    expect(snapshot().target).toBeNull();
    expect(computerChoiceRev()).toBe(r0 + 2);
  });

  it('a drop is not a choice: it never moves', () => {
    chooseComputer(X, { auto: true });
    const r0 = computerChoiceRev();
    dropComputer();
    expect(computerChoiceRev()).toBe(r0);
  });

  it('noComputerChosen is true only after All computers, until a computer is chosen', () => {
    expect(noComputerChosen()).toBe(false);
    chooseNoComputer();
    expect(noComputerChosen()).toBe(true);
    chooseComputer(X, { auto: true });
    expect(noComputerChosen()).toBe(false);
  });
});
