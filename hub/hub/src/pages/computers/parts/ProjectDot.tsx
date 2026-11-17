// A project's colour mark in the Projects list: the kit's colour mark (the kit owns the --computer property, so no
// inline style here). Its own part so the terminal (ProjectDot.term.tsx) draws a swatch of the colour instead.
import type { ReactElement } from 'react';
import { ComputerMark } from '@kit';

// `| null`: the terminal sibling is typed by this function and draws nothing for a project with no valid colour.
export function ProjectDot({ color }: { color: string | undefined }): ReactElement | null {
  return <ComputerMark color={color} />;
}
