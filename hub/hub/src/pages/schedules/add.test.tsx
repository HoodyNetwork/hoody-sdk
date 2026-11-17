// Vitest: adding a schedule is always possible, by hand or by asking
// the agent, and a source that was not read says why in plain words.
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import { ASK_ENABLED, setAskForFixtures, useAskDock } from '@kit';
import page from './page';
import strings from './strings.en.json';

afterEach(() => { setAskForFixtures(false); });

const newButtons = () => screen.queryAllByRole('button', { name: strings['action.new'] });
// Two different computers, so a link that names the wrong one (or always the first) fails.
const twoComputers = fixtureWorld.computers.slice(0, 2);
const computerIn = (router: { state: { location: { search: unknown } } }) => (router.state.location.search as Record<string, unknown>).computer;

describe('schedules: adding one', () => {
  it('has two different computers to choose from', () => {
    expect(twoComputers).toHaveLength(2);
    expect(twoComputers[0]!.id).not.toBe(twoComputers[1]!.id);
  });

  it('offers New schedule when nothing is listed and a source did not answer', async () => {
    await renderPage(page, { state: 'partial-empty' });
    await screen.findByText(strings['st.incomplete']);
    // Nothing found so far: the count line drops the number ("At least 0" read broken).
    expect(screen.getByText(/No schedules found so far on atlas/)).toBeTruthy();
    expect(screen.queryByText(/At least 0/)).toBeNull();
    // The empty state's own button and the header's.
    expect(newButtons().length).toBeGreaterThanOrEqual(2);
  });

  it('keeps New schedule in the header when the list is empty', async () => {
    await renderPage(page, { state: 'empty' });
    await screen.findByText('No schedules on atlas yet');
    // The empty state's own button and the header's.
    expect(newButtons().length).toBeGreaterThanOrEqual(2);
  });

  // The Ask-off fallback: only reachable in a build whose switch is off. ASK_ENABLED is on by default, and
  // setAskForFixtures(false) cannot turn it off, so this runs only if the switch goes off again.
  it.skipIf(ASK_ENABLED).each(twoComputers.map((c) => [c.name, c] as const))('with Ask off, the agent way opens the Bots of the selected computer (%s)', async (_n, c) => {
    const { router } = await renderPage(page, { path: '/schedules?edit=new' });
    await act(async () => { chooseComputer(c); });
    expect(await screen.findByText(strings['new.agentGoBots'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['new.agent']) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/bots'));
    expect(computerIn(router)).toBe(c.id);
    expect(renderHook(() => useAskDock()).result.current.isOpen).toBe(false);
  });

  it.each(['private', 'error'] as const)('offers no New schedule on the %s screen, where no editor can open', async (state) => {
    await renderPage(page, { state });
    await screen.findByText(strings[state === 'private' ? 'st.title.private' : 'st.title.failed']);
    expect(newButtons()).toHaveLength(0);
  });

  // The step itself (words, examples, Send, Back) is agentstep.test.tsx; Ask off with the switch on is agentstep.askoff.test.tsx.
  it('with Ask on, the agent way is a step of the drawer: it leaves neither the page nor opens the panel by itself', async () => {
    setAskForFixtures(true);
    const { router } = await renderPage(page, { path: '/schedules?edit=new' });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.agent']) }));
    expect(await screen.findByRole('dialog', { name: strings['new.agentTitle'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['new.pick'])).toBeNull();
    expect(router.state.location.pathname).toBe('/schedules');
    expect(renderHook(() => useAskDock()).result.current.isOpen).toBe(false);
  });
});

describe('schedules: sources that were not read', () => {
  it('says the agent is signed out, never that loops can\'t be read right now', async () => {
    await renderPage(page, { state: 'signed-out' });
    expect(await screen.findByText(strings['n.agentSignedOut'])).toBeInTheDocument();
    expect(screen.queryByText(strings['n.loopFailed'])).toBeNull();
  });

  // Item 33: the sign-in is here (signin.test.tsx), through core, never a trip to Bots.
  it.each(twoComputers.map((c) => [c.name, c] as const))('offers the sign-in here on the selected computer (%s), never a link to Bots', async (_n, c) => {
    const { router } = await renderPage(page, { state: 'signed-out' });
    await act(async () => { chooseComputer(c); });
    await screen.findByTestId('agent-signin');
    expect(screen.queryByRole('button', { name: /from Bots/ })).toBeNull();
    expect(router.state.location.pathname).toBe('/schedules');
  });

  // A stopped Curl is never named here. Adding a web-request schedule starts Curl by itself, so the
  // web request choice keeps its plain text (it opens Programs), and the page of a computer that may have no web-request
  // schedule never blames Curl.
  it('keeps the plain web request choice while Curl is stopped, and names Curl nowhere', async () => {
    const { router } = await renderPage(page, { state: 'partial-empty' });
    await screen.findByText(strings['st.incomplete']);
    expect(screen.queryByText(strings['line.curl_stopped'])).toBeNull();
    expect(screen.queryByRole('button', { name: /Start it in Programs/ })).toBeNull();
    await userEvent.click(newButtons()[0]!);
    const web = await screen.findByRole('button', { name: new RegExp(strings['new.web']) });
    expect(web).toHaveTextContent(strings['new.webBody']);
    expect(screen.queryByText(/Curl is stopped/)).toBeNull();
    await userEvent.click(web);
    await waitFor(() => expect(router.state.location.pathname).toBe('/programs'));
  });

  it('keeps the plain web request choice while Curl runs', async () => {
    await renderPage(page, { state: 'empty' });
    await screen.findByText('No schedules on atlas yet');
    await userEvent.click(newButtons()[0]!);
    const web = await screen.findByRole('button', { name: new RegExp(strings['new.web']) });
    expect(web).toHaveTextContent(strings['new.webBody']);
    expect(screen.queryByText(/Curl is stopped/)).toBeNull();
  });
});
