// Vitest (New script): each step says a thing once and its head matches where the step is. Where it answers says what
// the address is for in its lead only, not again under the address; Build it reads "Building your script" with its lead
// only while a build runs, and once the build has ended the step keeps its own name with the outcome in the plate. Make it
// live lists what goes live with values next to their labels, as Check it does.
import { render, screen } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type * as Record_ from './record';

vi.mock('./record', async (orig) => {
  const real = await orig<typeof Record_>();
  return { ...real, useBuildRun: () => null };
});

import strings from '../strings.en.json';
import { StepBuild, type Build, type UseBuild } from './StepBuild';
import { StepLive, type UseLive } from './StepLive';
import { StepWhere, type StepWhereProps } from './StepWhere';

const where: StepWhereProps = {
  computers: [], compId: 'c1', computerName: 'atlas', onComputer: () => undefined, origin: 'https://exec-1.example',
  route: '/hello', onRoute: () => undefined, check: { state: 'idle' }, onUseFree: () => undefined,
  schedule: null, onSchedule: () => undefined, link: false, onLink: () => undefined, onSubmit: () => undefined,
};
const api = (build: Build) => ({ build, run: async () => undefined, stop: async () => undefined, checkAgain: async () => undefined, askReplace: false, confirmReplace: async () => undefined, cancelReplace: () => undefined, builtWith: null, keep: () => undefined }) as unknown as UseBuild;
const step = (build: Build) => <StepBuild b={null} draftId="dddddddddd" computer="atlas" description="d" api={api(build)} code="" codeEdited={false} onWriteMyself={() => undefined} />;
const lead = strings['flow.built.lead'].replace('{{computer}}', 'atlas');

describe('New script, Where it answers', () => {
  it('says once what the address is for, with a usable address shown', () => {
    render(<StepWhere {...where} />);
    expect(screen.getByText(strings['flow.where.lead'])).toBeInTheDocument();
    expect(screen.queryByText(strings['address.what'])).toBeNull();
  });
});

describe('New script, Build it: the step head follows the build', () => {
  it('while it runs: "Building your script" and its lead', () => {
    render(step({ k: 'running', n: 1 }));
    expect(screen.getByRole('heading', { name: strings['flow.built.title'] })).toBeInTheDocument();
    expect(screen.getByText(lead)).toBeInTheDocument();
  });

  it.each([
    ['written', { k: 'ready', n: 1, code: 'x', summary: '' }, strings['flow.built.ready']],
    ['failed', { k: 'failed', n: 1, code: '' }, strings['flow.built.failed']],
    ['stopped', { k: 'stopped', n: 1 }, strings['flow.built.stopped']],
  ] as const)('once %s: the step\'s own name, no "Building" and no lead above the outcome', (_w, build, outcome) => {
    render(step(build as Build));
    expect(screen.getByRole('heading', { name: strings['flow.step.build'] })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: strings['flow.built.title'] })).toBeNull();
    expect(screen.queryByText(lead)).toBeNull();
    expect(screen.getByText(outcome)).toBeInTheDocument();
  });
});

describe('New script, Make it live: what goes live', () => {
  it('draws its facts like Check it: values next to their labels, not the spec layout', () => {
    const api = { live: { k: 'confirm' }, link: { k: 'none' }, send: async () => undefined, checkAgain: async () => undefined, discard: async () => false, discardNote: false, canSend: true, op: null, again: () => undefined } as unknown as UseLive;
    const { container } = render(<StepLive api={api} route="/hello" computer="atlas" schedule={null} link={false} onAction={() => undefined} onTry={() => undefined} onOpen={() => undefined} onAnother={() => undefined} onDiscarded={() => undefined} />);
    expect(screen.getByText('/hello')).toBeInTheDocument();
    const wraps = container.querySelectorAll('.factsWrap');
    expect(wraps.length).toBeGreaterThan(0);
    wraps.forEach((w) => expect(w.classList.contains('spec')).toBe(false));
  });
});
