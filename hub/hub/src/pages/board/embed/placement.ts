// Where each program option lives in its options panel: no gap, without clutter.
//
// Contract, in plain words:
//   - Every user option of every tile program (options.ts programOptions) is named exactly once here: in a panel
//     section the designer placed it in, in the panel's "Advanced", or (until that program's panel is designed) in
//     pendingDesign. embed/options.test.ts fails when the catalogue gains an option nobody placed, names an option twice,
//     or names one that is refused (by the catalogue or options.ts BOARD_REFUSED), Board-owned or gone.
//   - The panels follow the Board options layout (this table is generated from options/model.ts);
//     every program's pendingDesign is empty. Section 'opens' is the fixed Opens block (files, code, sqlite, notes), not an accordion.
import type { TileProgram } from './catalog';

export interface Placement {
  /** Panel sections in order, each a list of option ids. */
  readonly sections: Readonly<Record<string, readonly string[]>>;
  /** Placed on purpose under the panel's "Advanced". */
  readonly advanced: readonly string[];
  /** Not placed yet (empty once every panel has its section). */
  readonly pendingDesign: readonly string[];
}

export const PLACEMENT: Readonly<Record<TileProgram, Placement>> = {
  agent: {
    sections: {
      window: ['title'],
      text: ['fontSize', 'fontFamily', 'lineHeight', 'letterSpacing'],
      colours: ['theme', 'backgroundColor', 'drawBoldTextInBrightColors'],
      cursor: ['cursorStyle', 'cursorBlink', 'cursorWidth', 'cursorInactiveStyle'],
      sidepanel: ['panel', 'panel-visible', 'panel-position', 'panel-width-pct', 'panel-height-pct', 'panel-resizable'],
      scrolling: ['scrollback', 'scrollSensitivity', 'fastScrollSensitivity', 'smoothScrollDuration'],
      accessibility: ['screenReaderMode', 'minimumContrastRatio'],
    },
    advanced: ['fontWeight', 'fontWeightBold', 'panel-width', 'panel-height', 'disableResizeOverlay', 'unicodeVersion', 'rendererType'],
    pendingDesign: [],
  },
  terminal: {
    sections: {
      session: ['cwd', 'readonly'],
      window: ['title', 'hide-toolbar'],
      text: ['fontSize', 'fontFamily', 'lineHeight', 'letterSpacing'],
      colours: ['theme', 'backgroundColor', 'drawBoldTextInBrightColors'],
      cursor: ['cursorStyle', 'cursorBlink', 'cursorWidth', 'cursorInactiveStyle'],
      sidepanel: ['panel', 'panel-visible', 'panel-position', 'panel-width-pct', 'panel-height-pct', 'panel-resizable'],
      scrolling: ['scrollback', 'scrollSensitivity', 'fastScrollSensitivity', 'smoothScrollDuration'],
      accessibility: ['screenReaderMode', 'minimumContrastRatio'],
    },
    advanced: ['fontWeight', 'fontWeightBold', 'panel-width', 'panel-height', 'disableResizeOverlay', 'unicodeVersion', 'rendererType'],
    pendingDesign: [],
  },
  display: {
    sections: {
      quality: ['encoding', 'video', 'bandwidth_limit', 'quality_mode', 'quality'],
      desktop: ['override_width', 'maximize_new_windows', 'decorations', 'dark_mode'],
      look: ['colorScheme', 'theme', 'font'],
      input: ['readonly', 'keyboard', 'swap_keys', 'scroll_reverse_y', 'scroll_reverse_x', 'scroll_speed', 'touchpad_scroll_scale'],
      sharing: ['clipboard', 'file_transfer', 'printing', 'sound'],
      viewer: ['toolbar', 'floating_menu', 'clock', 'display_notifications', 'reconnect', 'title_show_hoody', 'title_show_display_id'],
    },
    advanced: ['vrefresh', 'offscreen', 'suspend_inactive_tab', 'clipboard_preferred_format', 'audio_codec', 'menu', 'clipboard_poll', 'scroll'],
    pendingDesign: [],
  },
  files: {
    sections: {
      opens: ['path', 'directory', 'q'],
      listing: ['sort', 'order'],
      look: ['theme', 'colorScheme', 'font', 'fontSize'],
      parts: ['chromeless', 'hideHeader', 'hideSidebar', 'hidePreview', 'hideFooter', 'borderless'],
    },
    advanced: ['embedBg'],
    pendingDesign: [],
  },
  browser: {
    sections: {
      display: ['maximize_new_windows'],
    },
    advanced: ['iframe_url'],
    pendingDesign: [],
  },
  code: {
    sections: {
      opens: ['folder', 'extension'],
      startup: ['locale', 'disable-walkthroughs', 'page-loader'],
    },
    advanced: ['hoody-code'],
    pendingDesign: [],
  },
  sqlite: {
    sections: {
      opens: ['table'],
      database: ['db'],
      look: ['colorScheme'],
    },
    advanced: ['embed'],
    pendingDesign: [],
  },
  notes: {
    sections: {
      opens: ['userId', 'nodeId', 'alias', 'modalNodeId'],
      look: ['theme', 'colorScheme', 'font'],
      parts: ['sidebar', 'mode'],
    },
    advanced: [],
    pendingDesign: [],
  },
};

/** Every id a program's placement names, with where. */
export function placedIds(p: Placement): Array<[string, string]> {
  return [
    ...Object.entries(p.sections).flatMap(([s, ids]) => ids.map((id) => [id, 'section ' + s] as [string, string])),
    ...p.advanced.map((id) => [id, 'advanced'] as [string, string]),
    ...p.pendingDesign.map((id) => [id, 'pendingDesign'] as [string, string]),
  ];
}
