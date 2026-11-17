// A program's mark in From GitHub: the kit Monogram on its category's tint, or, where the host asks for plain marks
// (a dialog whose tiles carry ink marks), the same letter in ink on the card's own ground, in the same slot.
import { Monogram, type RealmColor } from '@kit';
import { createContext, useContext } from 'react';
import s from './library.module.css';

/** True under a host whose tiles carry ink marks: no tint and no plate. */
export const PlainMarks = createContext(false);

export function ProgramMark({ name, size, tint }: { name: string; size: 'lg' | 'xl'; tint?: RealmColor | undefined }) {
  const plain = useContext(PlainMarks);
  return <Monogram name={name} size={size} tint={plain ? undefined : tint} {...(plain ? { className: s.plainMark } : {})} />;
}
