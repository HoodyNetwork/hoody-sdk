// AttachPicture in the terminal: a terminal draws no picture (an <img> draws nothing here), so its place says what it
// is: the picture's name when it has one, else the picture glyph a chip without a thumbnail shows. The bytes are not used.
import type * as Web from './AttachPicture';
import { Text } from '@term/prim';
import { Icon } from '../icons';

export const AttachPicture: typeof Web.AttachPicture = ({ alt }) => (alt ? <Text colour="muted">{alt}</Text> : <Icon name="display" />);
