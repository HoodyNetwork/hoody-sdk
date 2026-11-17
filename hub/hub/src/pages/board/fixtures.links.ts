// Test-only entry of the Board page: its Tile host and what a test needs to draw one tile in it, for the Bots page's
// frame test (pages/bots/frame.pin.test.tsx: a Board's Bot tile draws the Bot from the agent API, never framed).
// hub/page-boundaries allows this file only from a page's fixtures.ts and test/spec files.
export type { Catalog } from './embed/catalog';
export { default as catalog } from './embed/catalog.ui.json';
export { computerOf } from './computers';
export type { BotTile as BoardBotTile } from './model/boards';
export { default as boardStrings } from './strings.en.json';
export type { FrameHandle } from './parts/Frame';
export { Tile, type TileProps } from './parts/Tile';
export { infoFor, type InfoCtx } from './parts/tileInfo';
