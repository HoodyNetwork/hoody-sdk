// Set by PageHeader around its subtitle, a two-line clamp that clips anything grown past its line box. A kit
// ContextLine reads it while it renders, so one placed in the subtitle (directly, or by any descendant, at any later
// render) throws in a dev build; the header's `context` row is its place.
import { createContext } from 'react';

export const InClampedSubtitle = createContext(false);
