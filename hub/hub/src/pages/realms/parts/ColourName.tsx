// A realm colour as the summary shows it: the colour's name in a Tag. Its own part so the terminal (ColourName.term.tsx)
// draws a swatch of the colour beside the name: there the colour is the point, and a name alone does not show it.
import { Tag } from '@kit';
import type { RealmColor } from '@core';

export function ColourName({ label }: { /** Read by the terminal's swatch; the web Tag names the colour only, as before. */ color: RealmColor; label: string }) {
  return <Tag>{label}</Tag>;
}
