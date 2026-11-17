// Vitest: the editor's find selects exactly the text it matched, also after a character whose lower case is longer
// ('İ' lower-cases to two UTF-16 units): a match's place and length are the text's own, never a lower-cased copy's.
// Match case on is the control (it never lower-cased anything).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CodeEditor } from './CodeEditor';
import strings from './forms.strings.en.json';

const CODE = '// İstanbul, İzmir\nconst a = 1;\nconst b = a;\n';
function Ed() {
  const [v, setV] = useState(CODE);
  return <CodeEditor value={v} onChange={setV} />;
}
const area = () => screen.getByRole('textbox', { name: 'Code' }) as HTMLTextAreaElement;
const picked = () => {
  const el = area();
  return { at: el.selectionStart, text: el.value.slice(el.selectionStart, el.selectionEnd) };
};
async function find(text: string) {
  render(<Ed />);
  fireEvent.keyDown(area(), { key: 'f', ctrlKey: true });
  const q = screen.getByRole('searchbox', { name: strings['editor.find'] });
  await act(async () => {
    fireEvent.change(q, { target: { value: text } });
  });
  return q;
}

describe('CodeEditor find after a character whose lower case is longer', () => {
  it('selects each match itself, first and next', async () => {
    const q = await find('const');
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(picked()).toEqual({ at: CODE.indexOf('const a'), text: 'const' });
    fireEvent.keyDown(q, { key: 'Enter' });
    expect(picked()).toEqual({ at: CODE.indexOf('const b'), text: 'const' });
  });

  it('a query in another case selects the text as written', async () => {
    await find('CONST A');
    expect(picked()).toEqual({ at: CODE.indexOf('const a'), text: 'const a' });
  });

  it('control: with Match case on, the match is selected', async () => {
    await find('const');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: strings['editor.matchCase'] }));
    });
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(picked()).toEqual({ at: CODE.indexOf('const a'), text: 'const' });
  });
});
