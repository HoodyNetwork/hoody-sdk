// Vitest: IntroPanel's states. The text column is always there; the stage is a picture that shows the map alone
// without a computer, the card without a pin when the computer has no place, and the pin with its wires otherwise.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntroPanel, type IntroPanelComputer } from './IntroPanel';
import { phraseLines } from './IntroPanel.pure';
import { worldPath } from './worldDots';

const LEAD = 'Your own computers in the cloud, each with an AI agent. Reach them from anywhere.';
const computer: IntroPanelComputer = {
  name: 'atlas',
  state: <span>Running</span>,
  tiles: [
    { icon: 'agent', label: 'Agent' },
    { icon: 'terminal', label: 'Terminal' },
    { icon: 'display', label: 'Desktop' },
    { icon: 'files', label: 'Files' },
    { icon: 'browser', label: 'Browser' },
  ],
  place: { x: 78.8, y: 57.1 },
};

function draw(c?: IntroPanelComputer) {
  const view = render(
    <IntroPanel labelId="intro-lead" eyebrow="What is Hoody?" lead={LEAD} actions={<button type="button">Open</button>} hide={<button type="button">Hide</button>} computer={c} ways={['terminal', 'display', 'agent']} />,
  );
  const stage = view.container.querySelector('[data-intro-stage]') as HTMLElement;
  return { ...view, stage, pins: stage.querySelectorAll('circle'), paths: stage.querySelectorAll('svg[preserveAspectRatio] > path') };
}

describe('phraseLines', () => {
  it('cuts the line after each comma and full stop', () => {
    expect(phraseLines(LEAD)).toEqual(['Your own computers in the cloud,', 'each with an AI agent.', 'Reach them from anywhere.']);
  });

  it('a line with no such mark is one phrase; an empty line is none', () => {
    expect(phraseLines('Hello there')).toEqual(['Hello there']);
    expect(phraseLines('   ')).toEqual([]);
    // A mark inside a word (a version, a number) does not break.
    expect(phraseLines('Version 1.5 is out')).toEqual(['Version 1.5 is out']);
  });
});

describe('worldPath', () => {
  it('is a few thousand squares and stays small', () => {
    const d = worldPath();
    expect(d.match(/M/g)!.length).toBeGreaterThan(1500);
    expect(d.match(/M/g)!.length).toBeLessThan(2600);
  });
});

describe('IntroPanel', () => {
  it('names itself by its line, read as one text, with the eyebrow, the actions and Hide', () => {
    const { container } = draw(computer);
    const panel = container.querySelector('[aria-labelledby="intro-lead"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(screen.getByText(LEAD).id).toBe('intro-lead');
    expect(screen.getByText('What is Hoody?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
  });

  it('no computer: the map alone, no card, no pin, no way in', () => {
    const { stage, pins, paths } = draw(undefined);
    expect(paths.length).toBe(2); // the world, twice (it turns without a seam)
    expect(pins.length).toBe(0);
    expect(stage.textContent).toBe('');
  });

  it('a computer with a place: its card with the name, the state word and the tiles, the pin and three wires', () => {
    const { stage, pins, paths } = draw(computer);
    expect(stage.textContent).toContain('atlas');
    expect(stage.textContent).toContain('Running');
    expect(['Agent', 'Terminal', 'Desktop', 'Files', 'Browser'].every((name) => stage.textContent!.includes(name))).toBe(true);
    expect(pins.length).toBe(2); // the dot and its halo
    expect(paths.length).toBe(2 + 3 + 1); // the world twice, three wires, the card's line
  });

  it('the pin stays at one spot and the world turns under it: two places differ in the map offset and the pin height only', () => {
    const sg = draw(computer);
    const sgShift = sg.paths[1]!.getAttribute('transform');
    const sgPin = [sg.pins[1]!.getAttribute('cx'), sg.pins[1]!.getAttribute('cy')];
    sg.unmount();
    const us = draw({ ...computer, place: { x: 28.5, y: 31.5 } });
    expect(us.pins[1]!.getAttribute('cx')).toBe(sgPin[0]);
    expect(us.pins[1]!.getAttribute('cy')).not.toBe(sgPin[1]);
    expect(us.paths[1]!.getAttribute('transform')).not.toBe(sgShift);
  });

  it('a computer with no place: the card is shown, with no pin and no wire', () => {
    const { stage, pins, paths } = draw({ ...computer, place: undefined });
    expect(stage.textContent).toContain('atlas');
    expect(pins.length).toBe(0);
    expect(paths.length).toBe(2);
  });

  it('the stage is a picture: nothing in it can be focused or pressed', () => {
    const { stage } = draw(computer);
    expect(stage.querySelector('a, button, [tabindex]')).toBeNull();
  });
});
