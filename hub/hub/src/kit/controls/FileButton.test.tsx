import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileButton } from './FileButton';

const inputOf = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (input: HTMLInputElement, files: File[]) => {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
};

describe('FileButton', () => {
  it('forwards accept and multiple to the hidden input, and hides it from assistive tech and the tab order', () => {
    const { container } = render(<FileButton label="Import" accept="application/json,.json" multiple onFiles={() => undefined} />);
    const input = inputOf(container);
    expect(input).toHaveAttribute('accept', 'application/json,.json');
    expect(input.multiple).toBe(true);
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input.tabIndex).toBe(-1);
    expect(inputOf(render(<FileButton label="One" onFiles={() => undefined} />).container).multiple).toBe(false);
  });

  it('pressing the button opens the picker (clicks the input)', () => {
    const { container } = render(<FileButton label="Import" onFiles={() => undefined} />);
    const click = vi.spyOn(inputOf(container), 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('passes the picked files and clears the input so the same file can be chosen again', () => {
    const onFiles = vi.fn();
    const { container } = render(<FileButton label="Import" onFiles={onFiles} />);
    const input = inputOf(container);
    const f = new File(['a'], 'a.json');
    pick(input, [f]);
    expect(onFiles).toHaveBeenCalledWith([f]);
    expect(input.value).toBe('');
    // happy-dom keeps a file input's value empty anyway: watch the write itself
    const writes: string[] = [];
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: (v: string) => { writes.push(v); } });
    pick(input, [f]);
    expect(writes).toEqual(['']);
  });

  it('calls nothing for an empty pick', () => {
    const onFiles = vi.fn();
    const { container } = render(<FileButton label="Import" onFiles={onFiles} />);
    pick(inputOf(container), []);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('disabled opens nothing and disables the input', () => {
    const { container } = render(<FileButton label="Upload" isDisabled onFiles={() => undefined} />);
    const btn = screen.getByRole('button', { name: 'Upload' });
    expect(btn).toBeDisabled();
    expect(inputOf(container).disabled).toBe(true);
    const click = vi.spyOn(inputOf(container), 'click');
    fireEvent.click(btn);
    expect(click).not.toHaveBeenCalled();
  });
});
