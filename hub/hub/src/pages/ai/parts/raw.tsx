// The AI pages' few plain HTML elements, in one place: a bullet list, a code leaf, a bidi-isolated text, a labelled group
// and a plain block. A page part uses these names; the terminal draws its own (raw.term.tsx), so no
// page part hands the terminal an HTML tag for them. Classes come from the caller's own CSS module.
import type { ReactNode } from 'react';

interface Kids { children?: ReactNode }
interface Classed extends Kids { className?: string }

/** A bullet list; its children are `Point`s. */
export function Points({ className, children }: Classed) {
  return <ul className={className}>{children}</ul>;
}

/** One line of a `Points` list. */
export function Point({ children }: Kids) {
  return <li>{children}</li>;
}

/** A data leaf shown as code (a model's name). */
export function CodeLeaf({ className, children }: Classed) {
  return <code className={className}>{children}</code>;
}

/** Text a person wrote, isolated from the direction of the text around it. */
export function Bidi({ className, children }: Classed) {
  return <bdi className={className}>{children}</bdi>;
}

/** A labelled group of controls. */
export function GroupBox({ label, children }: Kids & { label: string }) {
  return <div role="group" aria-label={label}>{children}</div>;
}

/** A plain block. */
export function Block({ className, children }: Classed) {
  return <div className={className}>{children}</div>;
}

/** A block of form fields, one under the other. */
export function FormBlock({ className, children }: Classed) {
  return <div className={className}>{children}</div>;
}
