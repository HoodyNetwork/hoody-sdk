// Board scroll mode: the pieces BoardView, the model and persist mount.
export { boardHeight, layoutFits, presetFitsIn, scrollHeight, scrollSlot } from './geom';
export { scrollTopFor, useFollowActive, type Follow } from './follow';
export { parseMode, setBoardMode, withMode, type BoardMode } from './mode';
export { useScrollEntry } from './Toggle';
export { default as scrollStyles } from './scroll.module.css';
