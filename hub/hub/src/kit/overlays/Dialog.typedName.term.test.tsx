// DangerConfirm's typed field in the terminal is named by its label, as the web's field is ("Type atlas to confirm"):
// a reader landing on the field (the dialog opens there) hears what to type, not an unnamed text box.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { DangerConfirm } from './Dialog';

function Page() {
  const [open, setOpen] = useState(true);
  return <DangerConfirm isOpen={open} onOpenChange={setOpen} title="Delete computer atlas?" confirmText="atlas" confirmLabel="Delete computer" onConfirm={() => {}} />;
}

test('the typed field is named by its label and has the focus when the dialog opens', async () => {
  const t = await drawTest(<FocusRoot><OverlayHost><Page /></OverlayHost></FocusRoot>, { width: 80, height: 24 });
  try {
    const frame = await t.settle();
    expect(frame).toContain('Type atlas to confirm');
    const tree = semanticsOf(t.renderer as never);
    const fields = queryAllByRole(tree, 'textbox');
    expect(fields.map((f) => f.name)).toEqual(['Type atlas to confirm']);
    expect(focusedNode(tree)).toMatchObject({ role: 'textbox', name: 'Type atlas to confirm' });
  } finally { t.renderer.destroy(); }
});
