// ConfirmDialog and Dialog take `consequences` and a `faq` descriptor: the kit renders the consequences as the
// list DangerConfirm always drew, and the descriptor as a FaqLink right after the body, inside the dialog's scroll box. A press on that link inside the dialog opens
// the answer in a peek (never a navigation); Escape closes only the peek.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, useRouter } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode, useState } from 'react';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubHref, hubNavigate } from '../../app/hrefs';
import type { FaqItem } from '../layouts/Faq';
import { ConfirmDialog, DangerConfirm, Dialog } from './Overlays';

afterEach(() => vi.restoreAllMocks());

const ITEM: FaqItem = { id: 'rate', q: 'What is the rate?', a: 'Five percent of what a referral pays.', action: { label: 'Program rules', href: '/guide' } };
const CONSEQUENCES = ['Credit only, no cash.', 'You can leave any time.'];

function Bridge({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AriaRouterProvider navigate={(to) => hubNavigate(to, (href) => void router.navigate({ href } as never))} useHref={hubHref}>
      {children}
    </AriaRouterProvider>
  );
}

async function mount(path: string, el: () => ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Bridge>{el()}</Bridge> }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const settle = (ms = 5) =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, ms));
  });

const NONE = () => {};

describe('ConfirmDialog consequences', () => {
  it('renders the list after the body, with the classes DangerConfirm always used', async () => {
    await mount('/', () => <ConfirmDialog isOpen onOpenChange={NONE} title="Join" body="Join the program." consequences={CONSEQUENCES} confirmLabel="Join" onConfirm={NONE} />);
    await settle();
    const dialog = screen.getByRole('alertdialog');
    const list = within(dialog).getByRole('list');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(CONSEQUENCES);
    expect(list.tagName).toBe('UL');
    // after the body, before the buttons
    const body = within(dialog).getByText('Join the program.');
    expect(body.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(within(dialog).getByRole('button', { name: 'Join' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.parentElement?.hasAttribute('data-dialog-body')).toBe(true);
  });

  it('without consequences or children there is no extra block at all (as before)', async () => {
    await mount('/', () => <ConfirmDialog isOpen onOpenChange={NONE} title="Restart" body="Restart it." confirmLabel="Restart" onConfirm={NONE} />);
    await settle();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.querySelector('[data-dialog-body]')).toBeNull();
    expect(within(dialog).queryByRole('list')).toBeNull();
  });

  it('an empty list draws nothing', async () => {
    await mount('/', () => <ConfirmDialog isOpen onOpenChange={NONE} title="Restart" consequences={[]} confirmLabel="Restart" onConfirm={NONE} />);
    await settle();
    expect(screen.getByRole('alertdialog').querySelector('[data-dialog-body]')).toBeNull();
  });

  it('children still follow the list in the same block', async () => {
    await mount('/', () => (
      <ConfirmDialog isOpen onOpenChange={NONE} title="Rename" consequences={CONSEQUENCES} confirmLabel="Go" onConfirm={NONE}>
        <input aria-label="Name" />
      </ConfirmDialog>
    ));
    await settle();
    const block = screen.getByRole('alertdialog').querySelector('[data-dialog-body]')!;
    expect(Array.from(block.children).map((c) => c.tagName)).toEqual(['UL', 'INPUT']);
  });
});

describe('DangerConfirm keeps its DOM', () => {
  it('draws the consequences list, then the type-to-confirm field, in one block with the same classes', async () => {
    await mount('/', () => (
      <DangerConfirm isOpen onOpenChange={NONE} title="Delete atlas" confirmText="atlas" consequences={CONSEQUENCES} confirmLabel="Delete" onConfirm={NONE} />
    ));
    await settle();
    const dialog = screen.getByRole('alertdialog');
    const block = dialog.querySelector('[data-dialog-body]')!;
    expect(Array.from(block.children).map((c) => c.tagName)).toEqual(['UL', 'DIV']);
    const ul = block.firstElementChild!;
    expect(ul.className).toMatch(/consequences/);
    expect(Array.from(ul.children).map((c) => c.textContent)).toEqual(CONSEQUENCES);
    expect(within(dialog).getByRole('textbox')).toBeInTheDocument();
  });

  it('with no consequences the block holds only the field', async () => {
    await mount('/', () => <DangerConfirm isOpen onOpenChange={NONE} title="Delete atlas" confirmText="atlas" confirmLabel="Delete" onConfirm={NONE} />);
    await settle();
    const block = screen.getByRole('alertdialog').querySelector('[data-dialog-body]')!;
    expect(Array.from(block.children).map((c) => c.tagName)).toEqual(['DIV']);
  });

  it('passes a faq through to the dialog', async () => {
    await mount('/', () => (
      <DangerConfirm isOpen onOpenChange={NONE} title="Delete atlas" confirmText="atlas" confirmLabel="Delete" onConfirm={NONE} faq={{ item: ITEM, label: 'How is it counted' }} />
    ));
    await settle();
    expect(within(screen.getByRole('alertdialog')).getByRole('link', { name: 'How is it counted' })).toBeInTheDocument();
  });
});

describe('the faq descriptor', () => {
  function Host({ kind }: { kind: 'confirm' | 'dialog' }) {
    const [open, setOpen] = useState(true);
    const faq = { item: ITEM, label: 'How is it counted' };
    return kind === 'confirm' ? (
      <ConfirmDialog isOpen={open} onOpenChange={setOpen} title="Join the program" body="Join now." consequences={CONSEQUENCES} faq={faq} confirmLabel="Join" onConfirm={NONE} />
    ) : (
      <Dialog isOpen={open} onOpenChange={setOpen} title="Rename" body="Pick a name." faq={faq} primaryLabel="Save">
        <input aria-label="Name" />
      </Dialog>
    );
  }

  for (const kind of ['confirm', 'dialog'] as const) {
    const role = kind === 'confirm' ? 'alertdialog' : 'dialog';
    describe(kind === 'confirm' ? 'ConfirmDialog' : 'Dialog', () => {
      it('renders a FaqLink with the label right after the body (before the consequences and fields)', async () => {
        await mount('/p', () => <Host kind={kind} />);
        await settle();
        const dialog = screen.getByRole(role);
        const link = within(dialog).getByRole('link', { name: 'How is it counted' });
        expect(link.closest('[data-dialog-faq]')).not.toBeNull();
        const before = kind === 'confirm' ? within(dialog).getByRole('list') : within(dialog).getByRole('textbox');
        expect(link.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(dialog).getByText(kind === 'confirm' ? 'Join now.' : 'Pick a name.').compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(dialog.querySelector('[data-dialog-scroll]')?.contains(link)).toBe(true);
        expect(link.compareDocumentPosition(within(dialog).getByRole('button', { name: kind === 'confirm' ? 'Join' : 'Save' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });

      it('a press opens the peek with the whole answer and no action; nothing navigates', async () => {
        const router = await mount('/p', () => <Host kind={kind} />);
        await settle();
        await act(async () => fireEvent.click(within(screen.getByRole(role)).getByRole('link', { name: 'How is it counted' })));
        await settle();
        const peek = screen.getByRole('dialog', { name: 'Answer' });
        expect(within(peek).getByText('Five percent of what a referral pays.')).toBeInTheDocument();
        expect(within(peek).queryByRole('link')).toBeNull();
        expect(router.state.location.pathname).toBe('/p');
        expect(router.state.location.hash).toBe('');
      });

      it('Escape closes only the peek: the dialog stays open and focus is back on the link', async () => {
        const user = userEvent.setup();
        await mount('/p', () => <Host kind={kind} />);
        await settle();
        const link = within(screen.getByRole(role)).getByRole('link', { name: 'How is it counted' });
        await user.click(link);
        await settle();
        expect(screen.getByRole('dialog', { name: 'Answer' })).toBeInTheDocument();
        await user.keyboard('{Escape}');
        await settle(30);
        expect(screen.queryByRole('dialog', { name: 'Answer' })).toBeNull();
        expect(screen.getByRole(role)).toBeInTheDocument();
        expect(document.activeElement).toBe(link);
      });
    });
  }

  it('without a faq no link and no extra block is drawn', async () => {
    await mount('/', () => <Dialog isOpen onOpenChange={NONE} title="Rename" body="Pick." primaryLabel="Save" />);
    await settle();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-dialog-faq]')).toBeNull();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });
});
