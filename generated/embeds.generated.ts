/* eslint-disable */
// Generated from the Hoody embeds map. Do not edit: change the map and regenerate.

/** Every kit slug that has at least one buildable view. */
export type EmbedKit = "terminal" | "desktop" | "agent" | "display" | "browser" | "code" | "files" | "notes" | "sqlite" | "notifications" | "pipe" | "cron" | "bot" | "run" | "watch" | "exec" | "http" | "https";

/** Every buildable view, as `<kit>.<view>`. */
export type EmbedViewId = "terminal.session" | "desktop.session" | "agent.webui" | "display.client" | "browser.status" | "browser.display" | "code.root" | "code.editor" | "code.extension" | "files.root" | "files.folder" | "files.editor" | "files.search" | "notes.home" | "notes.create" | "notes.notebook" | "notes.notebookHome" | "notes.node" | "notes.modal" | "notes.alias" | "notes.files" | "notes.uploads" | "notes.downloads" | "notes.users" | "notes.settings" | "notes.account" | "sqlite.overview" | "sqlite.tables" | "sqlite.query" | "sqlite.kvStore" | "sqlite.history" | "sqlite.pragmas" | "notifications.landing" | "pipe.send" | "pipe.noscript" | "pipe.progress" | "pipe.video" | "pipe.share" | "pipe.receive" | "cron.manager" | "bot.index" | "bot.detail" | "bot.confirmDelete" | "run.results" | "watch.index" | "exec.script" | "http.content" | "https.content";

/** Typed params per view (path params included; required ones are not optional). */
export interface EmbedViewParams {
  "terminal.session": {
    cwd?: string;
    readonly?: boolean;
    title?: string;
    fontSize?: number;
    backgroundColor?: string;
    panel?: string;
    "panel-visible"?: boolean;
    "panel-position"?: "left" | "right" | "top" | "bottom";
    "panel-width"?: string;
    "panel-height"?: string;
    "panel-resizable"?: boolean;
    "panel-width-pct"?: number;
    "panel-height-pct"?: number;
    "hide-toolbar"?: boolean;
    fontFamily?: string;
    fontWeight?: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
    fontWeightBold?: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
    lineHeight?: number;
    letterSpacing?: number;
    cursorBlink?: boolean;
    cursorStyle?: "block" | "underline" | "bar";
    cursorWidth?: number;
    cursorInactiveStyle?: "outline" | "block" | "bar" | "underline" | "none";
    theme?: Record<string, unknown>;
    minimumContrastRatio?: number;
    drawBoldTextInBrightColors?: boolean;
    scrollback?: number;
    scrollSensitivity?: number;
    fastScrollSensitivity?: number;
    smoothScrollDuration?: number;
    screenReaderMode?: boolean;
    disableResizeOverlay?: boolean;
    unicodeVersion?: "graphemes" | "11";
    rendererType?: "dom" | "canvas" | "webgl";
  };
  "desktop.session": {
    desktop_env?: "xfce" | "mate";
    redirect_delay?: number;
    wait_timeout?: number;
  };
  "agent.webui": {
    title?: string;
    fontSize?: number;
    backgroundColor?: string;
    panel?: string;
    "panel-visible"?: boolean;
    "panel-position"?: "left" | "right" | "top" | "bottom";
    "panel-width"?: string;
    "panel-height"?: string;
    "panel-resizable"?: boolean;
    "panel-width-pct"?: number;
    "panel-height-pct"?: number;
    fontFamily?: string;
    fontWeight?: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
    fontWeightBold?: "normal" | "bold" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
    lineHeight?: number;
    letterSpacing?: number;
    cursorBlink?: boolean;
    cursorStyle?: "block" | "underline" | "bar";
    cursorWidth?: number;
    cursorInactiveStyle?: "outline" | "block" | "bar" | "underline" | "none";
    theme?: Record<string, unknown>;
    minimumContrastRatio?: number;
    drawBoldTextInBrightColors?: boolean;
    scrollback?: number;
    scrollSensitivity?: number;
    fastScrollSensitivity?: number;
    smoothScrollDuration?: number;
    screenReaderMode?: boolean;
    disableResizeOverlay?: boolean;
    unicodeVersion?: "graphemes" | "11";
    rendererType?: "dom" | "canvas" | "webgl";
  };
  "display.client": {
    decorations?: boolean;
    toolbar?: boolean;
    menu?: boolean;
    maximize_new_windows?: boolean;
    readonly?: boolean;
    dark_mode?: boolean;
    clipboard?: false;
    printing?: false;
    file_transfer?: false;
    title_show_hoody?: boolean;
    title_show_display_id?: boolean;
  };
  "browser.status": {
    maximize_new_windows?: boolean;
  };
  "browser.display": {
    maximize_new_windows?: boolean;
    iframe_url?: string;
  };
  "code.root": {
    locale?: string;
    "page-loader"?: boolean;
    "disable-walkthroughs"?: boolean;
    "hoody-code"?: boolean;
  };
  "code.editor": {
    folder: string;
    locale?: string;
    "page-loader"?: boolean;
    "disable-walkthroughs"?: boolean;
    "hoody-code"?: boolean;
  };
  "code.extension": {
    folder?: string;
    extension: string;
    locale?: string;
    "page-loader"?: boolean;
    "disable-walkthroughs"?: boolean;
    "hoody-code"?: boolean;
  };
  "files.root": {
    sort?: "name" | "mtime" | "size";
    order?: "asc" | "desc";
    theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono";
    fontSize?: number;
    embedderOrigin?: string;
    chromeless?: boolean;
    borderless?: boolean;
    hideHeader?: boolean;
    hideSidebar?: boolean;
    hidePreview?: boolean;
    hideFooter?: boolean;
    embedBg?: "transparent";
  };
  "files.folder": {
    path: string;
    sort?: "name" | "mtime" | "size";
    order?: "asc" | "desc";
    theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono";
    fontSize?: number;
    embedderOrigin?: string;
    chromeless?: boolean;
    borderless?: boolean;
    hideHeader?: boolean;
    hideSidebar?: boolean;
    hidePreview?: boolean;
    hideFooter?: boolean;
    embedBg?: "transparent";
  };
  "files.editor": {
    path: string;
    theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono";
    fontSize?: number;
    embedderOrigin?: string;
    chromeless?: boolean;
    borderless?: boolean;
    hideHeader?: boolean;
    hideFooter?: boolean;
    embedBg?: "transparent";
  };
  "files.search": {
    directory: string;
    q: string;
    theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono";
    fontSize?: number;
    embedderOrigin?: string;
    chromeless?: boolean;
    borderless?: boolean;
    hideHeader?: boolean;
    hideSidebar?: boolean;
    hidePreview?: boolean;
    hideFooter?: boolean;
    embedBg?: "transparent";
  };
  "notes.home": {
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.create": {
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.notebook": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.notebookHome": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.node": {
    userId: string;
    nodeId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.modal": {
    userId: string;
    nodeId: string;
    modalNodeId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.alias": {
    userId: string;
    alias: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.files": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.uploads": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.downloads": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.users": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.settings": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "notes.account": {
    userId: string;
    mode?: "readonly" | "readwrite";
    sidebar?: "hidden";
    theme?: "oc-1" | "hc-black" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper";
    colorScheme?: "light" | "dark";
    font?: "ibm-plex-mono" | "jetbrains-mono" | "fira-code" | "cascadia-code" | "hack" | "source-code-pro" | "inconsolata" | "roboto-mono" | "ubuntu-mono" | "intel-one-mono" | "meslo-lgs" | "iosevka";
  };
  "sqlite.overview": {
    db?: string;
    colorScheme?: "light" | "dark" | "system";
    embed?: boolean;
  };
  "sqlite.tables": {
    table?: string;
    db?: string;
    colorScheme?: "light" | "dark" | "system";
    embed?: boolean;
  };
  "sqlite.query": {
    db?: string;
    colorScheme?: "light" | "dark" | "system";
    embed?: boolean;
  };
  "sqlite.kvStore": {
    table?: string;
    db?: string;
    colorScheme?: "light" | "dark" | "system";
    embed?: boolean;
  };
  "sqlite.history": {
    db?: string;
    colorScheme?: "light" | "dark" | "system";
    embed?: boolean;
  };
  "sqlite.pragmas": {
    db?: string;
    colorScheme?: "light" | "dark" | "system";
    embed?: boolean;
  };
  "notifications.landing": {
    display?: string;
    displays?: string;
  };
  "pipe.send": {
    name?: string;
    n?: number;
    text?: string;
    mode?: "file" | "text";
    filename?: string;
  };
  "pipe.noscript": {
    noscriptPath?: string;
    mode?: "file" | "text";
    wait?: number;
    sha256?: "1";
  };
  "pipe.progress": {
    path: string;
  };
  "pipe.video": {
    path: string;
    live?: "1";
    wait?: number;
  };
  "pipe.share": {
    path: string;
    source?: "screen" | "camera" | "audio";
    audio?: "1" | "0";
    surface?: "monitor" | "window" | "browser";
    quality?: "low" | "medium" | "high";
    fps?: number;
    n?: number;
    live?: "1";
  };
  "pipe.receive": {
    path: string;
    n?: number;
    filename?: string;
    wait?: number;
    sha256?: "1";
  };
  "cron.manager": Record<string, never>;
  "bot.index": Record<string, never>;
  "bot.detail": {
    registrationId: string;
  };
  "bot.confirmDelete": {
    registrationId: string;
  };
  "run.results": {
    app: string;
    os?: "linux" | "windows" | "any";
    source?: Array<string | number>;
    kind?: "gui" | "cli" | "any";
    arch?: "amd64" | "arm64" | "any";
    profile?: string;
    version?: string;
    repo?: string;
    release?: string;
    asset?: string;
    limit?: number;
  };
  "watch.index": Record<string, never>;
  "exec.script": {
    path: string;
  };
  "http.content": {
    path?: string;
  };
  "https.content": {
    path?: string;
  };
}

/** The `query` keys a view accepts: its passthrough params, or any key on a user-content view. */
export interface EmbedViewQuery {
  "terminal.session": Record<string, never>;
  "desktop.session": Record<string, never>;
  "agent.webui": Record<string, never>;
  "display.client": {
    encoding?: "auto" | "webp" | "jpeg" | "png" | "rgb";
    offscreen?: boolean;
    bandwidth_limit?: number;
    override_width?: string;
    override_height?: string;
    vrefresh?: number;
    suspend_inactive_tab?: boolean;
    sound?: boolean;
    audio_codec?: string;
    keyboard?: boolean;
    swap_keys?: boolean;
    clipboard_preferred_format?: "text/plain" | "text/html" | "UTF8_STRING";
    video?: boolean;
    mediasource_video?: boolean;
    web_notifications?: boolean;
    display_notifications?: boolean;
    notification_connection_type?: "websocket" | "polling";
    reconnect?: boolean;
    floating_menu?: boolean;
    clock?: boolean;
    scroll_reverse_y?: "auto" | "true" | "false";
    scroll_reverse_x?: boolean;
  };
  "browser.status": Record<string, never>;
  "browser.display": Record<string, never>;
  "code.root": Record<string, never>;
  "code.editor": Record<string, never>;
  "code.extension": Record<string, never>;
  "files.root": Record<string, never>;
  "files.folder": Record<string, never>;
  "files.editor": Record<string, never>;
  "files.search": Record<string, never>;
  "notes.home": Record<string, never>;
  "notes.create": Record<string, never>;
  "notes.notebook": Record<string, never>;
  "notes.notebookHome": Record<string, never>;
  "notes.node": Record<string, never>;
  "notes.modal": Record<string, never>;
  "notes.alias": Record<string, never>;
  "notes.files": Record<string, never>;
  "notes.uploads": Record<string, never>;
  "notes.downloads": Record<string, never>;
  "notes.users": Record<string, never>;
  "notes.settings": Record<string, never>;
  "notes.account": Record<string, never>;
  "sqlite.overview": Record<string, never>;
  "sqlite.tables": Record<string, never>;
  "sqlite.query": Record<string, never>;
  "sqlite.kvStore": Record<string, never>;
  "sqlite.history": Record<string, never>;
  "sqlite.pragmas": Record<string, never>;
  "notifications.landing": Record<string, never>;
  "pipe.send": Record<string, never>;
  "pipe.noscript": Record<string, never>;
  "pipe.progress": Record<string, never>;
  "pipe.video": Record<string, never>;
  "pipe.share": Record<string, never>;
  "pipe.receive": Record<string, never>;
  "cron.manager": Record<string, never>;
  "bot.index": Record<string, never>;
  "bot.detail": Record<string, never>;
  "bot.confirmDelete": Record<string, never>;
  "run.results": Record<string, never>;
  "watch.index": Record<string, never>;
  "exec.script": Record<string, string | ReadonlyArray<string>>;
  "http.content": Record<string, string | ReadonlyArray<string>>;
  "https.content": Record<string, string | ReadonlyArray<string>>;
}

export interface EmbedWrapperOptions<V extends EmbedViewId> {
  index?: number;
  port?: number;
  params?: EmbedViewParams[V];
  query?: EmbedViewQuery[V];
}

/**
 * The construction catalog, as data. `lib/embeds/runtime.ts` builds every URL from this table; the same
 * object is published as `embeds.catalog.v1.json`.
 */
export const EMBEDS_CATALOG = {
  "catalogVersion": 1,
  "catalogUrl": "https://docs.hoody.com/embeds/catalog.v1.json",
  "host": {
    "template": "https://{projectId}-{containerId}-{segment}.{serverName}.{containersDomain}",
    "inputs": {
      "projectId": "container.project_id",
      "containerId": "container.id",
      "serverName": "container.server_name"
    }
  },
  "domain": {
    "fallback": "containers.hoody.com",
    "branches": [
      {
        "branch": 1,
        "when": {
          "unparseableOrEmpty": true
        },
        "result": {
          "fallback": true
        }
      },
      {
        "branch": 2,
        "when": {
          "any": [
            {
              "regex": {
                "pattern": "^\\d{1,3}(?:\\.\\d{1,3}){3}$"
              }
            },
            {
              "contains": ":"
            },
            {
              "equals": "localhost"
            },
            {
              "endsWith": ".localhost"
            }
          ]
        },
        "result": {
          "host": true
        }
      },
      {
        "branch": 3,
        "when": {
          "startsWith": "containers."
        },
        "result": {
          "host": true
        }
      },
      {
        "branch": 4,
        "when": {
          "regex": {
            "pattern": "^[a-f0-9]{24}\\.api\\.",
            "caseInsensitive": true
          }
        },
        "result": {
          "replaceRegex": {
            "pattern": "^[a-f0-9]{24}\\.api\\.",
            "caseInsensitive": true,
            "with": "containers."
          }
        }
      },
      {
        "branch": 5,
        "when": {
          "startsWith": "api."
        },
        "result": {
          "stripPrefixThenPrepend": {
            "strip": "api.",
            "prepend": "containers."
          }
        }
      },
      {
        "branch": 6,
        "when": {
          "contains": ".api."
        },
        "result": {
          "replaceFirst": {
            "find": ".api.",
            "with": ".containers."
          }
        }
      },
      {
        "branch": 7,
        "when": {
          "always": true
        },
        "result": {
          "prepend": "containers."
        }
      }
    ]
  },
  "serialization": {
    "order": [
      "const",
      "flags",
      "params",
      "query"
    ],
    "paramsOrder": "the order of the view params list",
    "queryOrder": "caller order",
    "boolean": {
      "true": "true",
      "false": "false"
    },
    "number": "decimal, as JavaScript String(n)",
    "flag": "key=",
    "repeat": "one key=value pair per item, in caller order",
    "json": "JSON.stringify of the value",
    "percentEncoding": "UTF-8, then every byte except A-Z a-z 0-9 - _ . ! ~ * ' ( ) is percent-encoded (encodeURIComponent); applied to keys and values. A key or value with a lone surrogate (an unpaired UTF-16 code unit, which has no UTF-8 form) is refused: VALUE_INVALID, PATH_INVALID in a path; a JSON-serialized value is not refused: JSON.stringify writes a lone surrogate as a \\uXXXX escape",
    "separator": "&",
    "emptyQuery": "no ? is emitted",
    "aliasSelector": "on a ProxyAlias target, a view with alias \"selector\" gets aliasSelector=<index> when the caller did not set it; its position is the selector param position in the params list"
  },
  "encoders": {
    "path-segments": {
      "input": "an absolute path starting with /",
      "refuse": "a relative path, a NUL character, a lone surrogate, or a . or .. segment",
      "output": "the path split on /, each segment percent-encoded as in serialization.percentEncoding, joined with /; the leading / of the value replaces the / before the path template variable; a trailing / is kept"
    },
    "pipe-path": {
      "input": "a relative path matching the param pattern and wirePattern",
      "output": "the value split on /, each segment percent-encoded as in serialization.percentEncoding, joined with /",
      "refuse": "a NUL character, a lone surrogate, or an encoded path longer than 1023 characters"
    },
    "default": {
      "output": "a path variable without an encoder is percent-encoded as one segment",
      "refuse": "a NUL character or a lone surrogate"
    }
  },
  "alias": {
    "host": "the origin of the alias url; a null url is refused (ALIAS_URL_MISSING)",
    "match": "the alias program must equal the view program and the alias index must equal the requested index (ALIAS_MISMATCH)",
    "views": "alias \"refused\" views are refused on alias targets (ALIAS_VIEW_UNSUPPORTED)",
    "targetPath": "an alias with a non-null target_path is refused for views whose path is / (ALIAS_TARGET_PATH_CONFLICT)"
  },
  "services": {
    "terminal": {
      "segment": "terminal-{index}",
      "index": {
        "min": 1,
        "max": 65535,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "session number. With 24-character project and container ids, numbers above 9999 make a host label longer than 63 characters, which the SDK refuses (HOST_LABEL_TOO_LONG)."
      }
    },
    "desktop": {
      "segment": "desktop-{index}",
      "index": {
        "min": 1,
        "max": 59935,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "desktop number, 1 or more"
      }
    },
    "agent": {
      "segment": "agent-{index}",
      "index": {
        "min": 1,
        "max": 19999,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "agent number, 1 or more"
      }
    },
    "display": {
      "segment": "display-{index}",
      "index": {
        "min": 1,
        "max": 61535,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "display number"
      }
    },
    "browser": {
      "segment": "browser-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "browser instance number"
      }
    },
    "code": {
      "segment": "code-{index}",
      "index": {
        "min": 1,
        "max": 58535,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "Editor instance number, 1 or more. Each number is a separate editor instance with its own folder and state."
      }
    },
    "files": {
      "segment": "files-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same file manager."
      }
    },
    "notes": {
      "segment": "notes-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same instance."
      }
    },
    "sqlite": {
      "segment": "sqlite-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same instance."
      }
    },
    "n": {
      "segment": "n-{index}",
      "index": {
        "min": 1,
        "max": 61535,
        "default": 1,
        "selects": "instance",
        "publicMeaning": "Display number the page sends its test notification to."
      }
    },
    "pipe": {
      "segment": "pipe-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same pipe service."
      }
    },
    "cron": {
      "segment": "cron-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same instance."
      }
    },
    "bot": {
      "segment": "bot-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same instance."
      }
    },
    "run": {
      "segment": "run-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same service."
      }
    },
    "watch": {
      "segment": "watch-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index opens the same instance."
      }
    },
    "exec": {
      "segment": "exec-{index}",
      "index": {
        "min": 1,
        "max": 9999,
        "default": 1,
        "selects": "none",
        "publicMeaning": "Any index reaches the same script service."
      }
    },
    "http": {
      "segment": "http-{port}",
      "port": {
        "min": 1,
        "max": 65535
      }
    },
    "https": {
      "segment": "https-{port}",
      "port": {
        "min": 1,
        "max": 65535
      }
    }
  },
  "kits": {
    "terminal": {
      "ui": "app",
      "views": [
        "terminal.session"
      ],
      "refused": {
        "terminal_id": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "display": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "cwd_auto_create": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "shell": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "user": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "cmd": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "arg": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "reset": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "pid": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "env": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "startup_script": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "welcome": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "env_inject": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "desktop": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "redirect": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "agent": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "ephemeral": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "desktop_env": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "ssh_host": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_user": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_port": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_password": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_key": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_host": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_port": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_user": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_pass": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "redirect_delay": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "wait_timeout": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        }
      },
      "publicDescription": "Web terminal sessions in the browser.",
      "defaultView": "terminal.session"
    },
    "desktop": {
      "ui": "app",
      "views": [
        "desktop.session"
      ],
      "refused": {
        "terminal_id": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "display": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "desktop": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "view"
        },
        "redirect": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "view"
        },
        "cwd_auto_create": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "shell": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "user": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "cmd": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "arg": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "reset": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "pid": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "env": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "startup_script": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "welcome": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "env_inject": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "agent": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "ssh_host": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_user": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_port": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_password": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_key": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_host": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_port": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_user": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_pass": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "cwd": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "readonly": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "title": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "fontSize": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "backgroundColor": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-visible": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-position": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-width": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-height": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-resizable": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-width-pct": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "panel-height-pct": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "hide-toolbar": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "fontFamily": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "fontWeight": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "fontWeightBold": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "lineHeight": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "letterSpacing": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "cursorBlink": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "cursorStyle": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "cursorWidth": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "cursorInactiveStyle": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "theme": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "minimumContrastRatio": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "drawBoldTextInBrightColors": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "scrollback": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "scrollSensitivity": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "fastScrollSensitivity": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "smoothScrollDuration": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "screenReaderMode": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "disableResizeOverlay": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "unicodeVersion": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "rendererType": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "ephemeral": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "A full graphical desktop environment in the browser.",
      "defaultView": "desktop.session"
    },
    "agent": {
      "ui": "app",
      "views": [
        "agent.webui"
      ],
      "refused": {
        "terminal_id": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "display": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "agent": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "view"
        },
        "cwd_auto_create": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "shell": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "user": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "cmd": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "arg": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "reset": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "pid": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "env": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "startup_script": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "welcome": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "env_inject": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "desktop": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "redirect": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "onboarding": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "desktop_env": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "cwd": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "readonly": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "ssh_host": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_user": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_port": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_password": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "ssh_key": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_host": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_port": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_user": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "socks5_pass": {
          "class": "excluded",
          "reasonCode": "credential"
        },
        "redirect_delay": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "wait_timeout": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "ephemeral": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "The Hoody agent's interactive interface and API reference.",
      "defaultView": "agent.webui"
    },
    "display": {
      "ui": "app",
      "views": [
        "display.client"
      ],
      "refused": {
        "displayId": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "node": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "project_id": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "container_id": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "url_display_id": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "ssl": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "webtransport": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "path": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "action": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "display": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "keyboard_layout": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "clipboard_poll": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "open_url": {
          "class": "dead",
          "reasonCode": "not-supported"
        },
        "notification_server_url": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "sharing": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "steal": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "app": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "remote_logging": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "insecure": {
          "class": "excluded",
          "reasonCode": "auth"
        },
        "debug_main": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_keyboard": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_geometry": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_mouse": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_clipboard": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_draw": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_audio": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_network": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "debug_file": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "Web viewer for one remote display.",
      "defaultView": "display.client"
    },
    "browser": {
      "ui": "app",
      "views": [
        "browser.status",
        "browser.display"
      ],
      "refused": {
        "display": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        }
      },
      "publicDescription": "Status page of the headless or headful browser service, and a full-page view of its display.",
      "defaultView": "browser.status"
    },
    "code": {
      "ui": "app",
      "views": [
        "code.root",
        "code.editor",
        "code.extension"
      ],
      "refused": {
        "id": {
          "class": "forced",
          "reasonCode": "forced",
          "replacement": "serviceIndex"
        },
        "restart": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "welcome-iframe-url": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "page-loader-path": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "proxy-domain": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "app-name": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "A VS Code editor in the browser, opened on a folder of the container, optionally focused on a single extension.",
      "defaultView": "code.editor"
    },
    "files": {
      "ui": "app",
      "views": [
        "files.root",
        "files.folder",
        "files.editor",
        "files.search"
      ],
      "refused": {
        "json": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "simple": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "hash": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "sha256": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "base64": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "view": {
          "class": "excluded",
          "reasonCode": "not-read-only"
        },
        "download": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "content-type": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "history": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "at": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "revision": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "diff": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "from_seq": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "from_ts": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "to_seq": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "to_ts": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "after_id": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "limit": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        }
      },
      "publicDescription": "A file manager for the container: folder listings, search, a code editor and a read-only viewer.",
      "defaultView": "files.folder"
    },
    "notes": {
      "ui": "app",
      "views": [
        "notes.home",
        "notes.create",
        "notes.notebook",
        "notes.notebookHome",
        "notes.node",
        "notes.modal",
        "notes.alias",
        "notes.files",
        "notes.uploads",
        "notes.downloads",
        "notes.users",
        "notes.settings",
        "notes.account"
      ],
      "refused": {
        "widgetId": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "Hoody Notes: notebooks, pages and databases in the browser. Whether a framed Notes page shares its local cache with Notes open in a tab depends on the browser: a frame embedded by another site usually gets separate storage. Separate caches exchange changes, offline edits included, once they sync with the server. Offline edits survive a reload only when the browser gives Notes persistent storage; where it does not, Notes runs from memory and unsynced edits are lost on reload.",
      "defaultView": "notes.home"
    },
    "sqlite": {
      "ui": "app",
      "views": [
        "sqlite.overview",
        "sqlite.tables",
        "sqlite.query",
        "sqlite.kvStore",
        "sqlite.history",
        "sqlite.pragmas"
      ],
      "refused": {
        "sql": {
          "class": "dead",
          "reasonCode": "not-supported"
        }
      },
      "publicDescription": "Hoody SQLite studio: browse tables, run queries and manage key-value data.",
      "defaultView": "sqlite.overview"
    },
    "notifications": {
      "ui": "app",
      "views": [
        "notifications.landing"
      ],
      "refused": {},
      "publicDescription": "Notification landing page: recent notifications and a live feed from all displays, plus a test sender for one display or all of them.",
      "defaultView": "notifications.landing"
    },
    "pipe": {
      "ui": "app",
      "views": [
        "pipe.send",
        "pipe.noscript",
        "pipe.progress",
        "pipe.video",
        "pipe.share",
        "pipe.receive"
      ],
      "refused": {
        "download": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "autostart": {
          "class": "excluded",
          "reasonCode": "mutating"
        },
        "status": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "transfer": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "ws": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "Browser pages for streaming data through a named pipe path: send files or text, receive downloads, share a screen, camera or microphone, watch video, and follow a transfer's progress.",
      "defaultView": "pipe.send"
    },
    "cron": {
      "ui": "app",
      "views": [
        "cron.manager"
      ],
      "refused": {},
      "publicDescription": "Cron manager: browse and edit the crontab entries of each user.",
      "defaultView": "cron.manager"
    },
    "bot": {
      "ui": "app",
      "views": [
        "bot.index",
        "bot.detail",
        "bot.confirmDelete"
      ],
      "refused": {},
      "publicDescription": "Management pages for chat-channel bot registrations.",
      "defaultView": "bot.index"
    },
    "run": {
      "ui": "app",
      "views": [
        "run.results"
      ],
      "refused": {
        "pick": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "pick_index": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "candidate_id": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "set_id": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "terminal_id": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "display": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "dry_run": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "print_curl": {
          "class": "nonUi",
          "reasonCode": "non-ui"
        },
        "origin": {
          "class": "excluded",
          "reasonCode": "mutating"
        }
      },
      "publicDescription": "A results page that lists the applications matching a name, with their versions and the provider each comes from.",
      "defaultView": "run.results"
    },
    "daemon": {
      "ui": "none",
      "views": [],
      "refused": {},
      "publicDescription": "Program and process manager API; it has no browser page."
    },
    "watch": {
      "ui": "info",
      "views": [
        "watch.index"
      ],
      "refused": {},
      "publicDescription": "A short information page about the watch service.",
      "defaultView": "watch.index"
    },
    "exec": {
      "ui": "user-content",
      "views": [
        "exec.script"
      ],
      "refused": {},
      "publicDescription": "Pages served by your own scripts. The address runs the script mapped to the path, and the script decides what is returned.",
      "defaultView": "exec.script"
    },
    "http": {
      "ui": "user-content",
      "views": [
        "http.content"
      ],
      "refused": {},
      "publicDescription": "Whatever the application listening on the chosen port serves.",
      "defaultView": "http.content"
    },
    "https": {
      "ui": "user-content",
      "views": [
        "https.content"
      ],
      "refused": {},
      "publicDescription": "Whatever the application listening on the chosen port serves.",
      "defaultView": "https.content"
    },
    "d-tcp": {
      "ui": "excluded",
      "views": [],
      "refused": {},
      "publicDescription": "Connection endpoint used by the display viewer; open the display service instead."
    },
    "cdp": {
      "ui": "excluded",
      "views": [],
      "refused": {},
      "publicDescription": "Developer-tools protocol endpoint for automation clients; not an embeddable page."
    },
    "curl": {
      "ui": "none",
      "views": [],
      "refused": {},
      "publicDescription": "HTTP request service; it has no browser page."
    },
    "logs": {
      "ui": "none",
      "views": [],
      "refused": {},
      "publicDescription": "Proxy request log API; it has no browser page."
    },
    "tunnel": {
      "ui": "none",
      "views": [],
      "refused": {},
      "publicDescription": "Reverse tunnel service; it has no browser page."
    },
    "ssh": {
      "ui": "none",
      "views": [],
      "refused": {},
      "publicDescription": "SSH endpoint; it has no browser page of its own."
    },
    "egress": {
      "ui": "none",
      "views": [],
      "refused": {},
      "publicDescription": "Egress proxy endpoint; it has no browser page."
    }
  },
  "views": {
    "terminal.session": {
      "kit": "terminal",
      "view": "session",
      "service": "terminal",
      "program": "terminal",
      "ui": "app",
      "default": true,
      "label": "Terminal session",
      "publicDescription": "A browser terminal attached to one session. Opening it starts a shell if the session is not running; a terminal that belongs to a daemon program attaches to that program instead and never starts a shell.",
      "path": "/",
      "params": {
        "cwd": {
          "wire": "cwd",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Starting directory for a new session. The directory must already exist."
        },
        "readonly": {
          "wire": "readonly",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Open the session read-only: output is shown, keyboard input is blocked."
        },
        "title": {
          "wire": "title",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 200,
          "publicDescription": "Browser tab title. HTML tags are removed."
        },
        "fontSize": {
          "wire": "fontSize",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 8,
          "max": 72,
          "publicDescription": "Font size in pixels."
        },
        "backgroundColor": {
          "wire": "backgroundColor",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Background colour: a hex colour (#RGB, #RRGGBB, #RRGGBBAA) or a CSS colour name."
        },
        "panel": {
          "wire": "panel",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "An http(s) URL to show in a side panel next to the terminal."
        },
        "panel-visible": {
          "wire": "panel-visible",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show the side panel on load."
        },
        "panel-position": {
          "wire": "panel-position",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "left",
            "right",
            "top",
            "bottom"
          ],
          "publicDescription": "Where the side panel sits."
        },
        "panel-width": {
          "wire": "panel-width",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Initial side-panel width, in pixels (400px) or percent, for a left or right panel."
        },
        "panel-height": {
          "wire": "panel-height",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Initial side-panel height, in pixels (300px) or percent, for a top or bottom panel."
        },
        "panel-resizable": {
          "wire": "panel-resizable",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Allow resizing the side panel by dragging."
        },
        "panel-width-pct": {
          "wire": "panel-width-pct",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 5,
          "max": 95,
          "publicDescription": "Initial side-panel width as a percentage of the window. Takes precedence over panel-width."
        },
        "panel-height-pct": {
          "wire": "panel-height-pct",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 5,
          "max": 95,
          "publicDescription": "Initial side-panel height as a percentage of the window. Takes precedence over panel-height."
        },
        "hide-toolbar": {
          "wire": "hide-toolbar",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the terminal toolbar."
        },
        "fontFamily": {
          "wire": "fontFamily",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "CSS font-family list for terminal text."
        },
        "fontWeight": {
          "wire": "fontWeight",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "normal",
            "bold",
            "100",
            "200",
            "300",
            "400",
            "500",
            "600",
            "700",
            "800",
            "900"
          ],
          "publicDescription": "Font weight for normal text."
        },
        "fontWeightBold": {
          "wire": "fontWeightBold",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "normal",
            "bold",
            "100",
            "200",
            "300",
            "400",
            "500",
            "600",
            "700",
            "800",
            "900"
          ],
          "publicDescription": "Font weight for bold text."
        },
        "lineHeight": {
          "wire": "lineHeight",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Line height as a multiple of the font size."
        },
        "letterSpacing": {
          "wire": "letterSpacing",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "publicDescription": "Extra spacing between characters, in whole pixels."
        },
        "cursorBlink": {
          "wire": "cursorBlink",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Make the cursor blink."
        },
        "cursorStyle": {
          "wire": "cursorStyle",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "block",
            "underline",
            "bar"
          ],
          "publicDescription": "Cursor shape when the terminal has focus."
        },
        "cursorWidth": {
          "wire": "cursorWidth",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Cursor width in pixels when the cursor style is bar."
        },
        "cursorInactiveStyle": {
          "wire": "cursorInactiveStyle",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "outline",
            "block",
            "bar",
            "underline",
            "none"
          ],
          "publicDescription": "Cursor shape when the terminal does not have focus."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "serialize": "json",
          "publicDescription": "Colour theme as a JSON object (foreground, background, cursor, and the 16 ANSI colours)."
        },
        "minimumContrastRatio": {
          "wire": "minimumContrastRatio",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 21,
          "publicDescription": "Minimum contrast ratio between text and background; colours are adjusted to meet it."
        },
        "drawBoldTextInBrightColors": {
          "wire": "drawBoldTextInBrightColors",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Draw bold text in the bright colour variants."
        },
        "scrollback": {
          "wire": "scrollback",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 0,
          "max": 100000,
          "publicDescription": "Number of lines kept above the visible screen."
        },
        "scrollSensitivity": {
          "wire": "scrollSensitivity",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Scroll speed multiplier."
        },
        "fastScrollSensitivity": {
          "wire": "fastScrollSensitivity",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Scroll speed multiplier while Alt is held."
        },
        "smoothScrollDuration": {
          "wire": "smoothScrollDuration",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 0,
          "publicDescription": "Smooth-scroll duration in milliseconds; 0 scrolls instantly."
        },
        "screenReaderMode": {
          "wire": "screenReaderMode",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Enable screen-reader support."
        },
        "disableResizeOverlay": {
          "wire": "disableResizeOverlay",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Do not show the size overlay while the window is resized."
        },
        "unicodeVersion": {
          "wire": "unicodeVersion",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "graphemes",
            "11"
          ],
          "publicDescription": "Character-width rules: graphemes (default, emoji-aware) or 11."
        },
        "rendererType": {
          "wire": "rendererType",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "dom",
            "canvas",
            "webgl"
          ],
          "publicDescription": "Renderer used to draw the terminal: webgl (the default; Firefox uses dom), dom, or canvas (drawn with WebGL). Phones, tablets and other touch-screen devices use dom even when webgl or canvas is asked for. Try dom if text renders wrongly with WebGL on a particular browser or GPU."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": false,
      "forwardsQuery": true
    },
    "desktop.session": {
      "kit": "desktop",
      "view": "session",
      "service": "desktop",
      "program": "desktop",
      "ui": "app",
      "default": true,
      "label": "Desktop",
      "publicDescription": "A full graphical desktop. Opening it starts the desktop if needed, then shows it once it is ready.",
      "path": "/",
      "params": {
        "desktop_env": {
          "wire": "desktop_env",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "xfce",
            "mate"
          ],
          "publicDescription": "Desktop environment to start."
        },
        "redirect_delay": {
          "wire": "redirect_delay",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 0,
          "max": 30,
          "publicDescription": "Extra seconds to wait after the desktop is ready before it opens."
        },
        "wait_timeout": {
          "wire": "wait_timeout",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 300,
          "publicDescription": "Seconds to wait for the desktop to become ready."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": false,
      "forwardsQuery": false
    },
    "agent.webui": {
      "kit": "agent",
      "view": "webui",
      "service": "agent",
      "program": "agent",
      "ui": "app",
      "default": true,
      "label": "Agent",
      "publicDescription": "The agent's interactive interface in a browser terminal. Opening it starts the agent if it is not running.",
      "path": "/",
      "params": {
        "title": {
          "wire": "title",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 200,
          "publicDescription": "Browser tab title. HTML tags are removed."
        },
        "fontSize": {
          "wire": "fontSize",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 8,
          "max": 72,
          "publicDescription": "Font size in pixels."
        },
        "backgroundColor": {
          "wire": "backgroundColor",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Background colour: a hex colour (#RGB, #RRGGBB, #RRGGBBAA) or a CSS colour name."
        },
        "panel": {
          "wire": "panel",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "An http(s) URL to show in a side panel next to the terminal."
        },
        "panel-visible": {
          "wire": "panel-visible",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show the side panel on load."
        },
        "panel-position": {
          "wire": "panel-position",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "left",
            "right",
            "top",
            "bottom"
          ],
          "publicDescription": "Where the side panel sits."
        },
        "panel-width": {
          "wire": "panel-width",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Initial side-panel width, in pixels (400px) or percent, for a left or right panel."
        },
        "panel-height": {
          "wire": "panel-height",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Initial side-panel height, in pixels (300px) or percent, for a top or bottom panel."
        },
        "panel-resizable": {
          "wire": "panel-resizable",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Allow resizing the side panel by dragging."
        },
        "panel-width-pct": {
          "wire": "panel-width-pct",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 5,
          "max": 95,
          "publicDescription": "Initial side-panel width as a percentage of the window. Takes precedence over panel-width."
        },
        "panel-height-pct": {
          "wire": "panel-height-pct",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 5,
          "max": 95,
          "publicDescription": "Initial side-panel height as a percentage of the window. Takes precedence over panel-height."
        },
        "fontFamily": {
          "wire": "fontFamily",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "CSS font-family list for terminal text."
        },
        "fontWeight": {
          "wire": "fontWeight",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "normal",
            "bold",
            "100",
            "200",
            "300",
            "400",
            "500",
            "600",
            "700",
            "800",
            "900"
          ],
          "publicDescription": "Font weight for normal text."
        },
        "fontWeightBold": {
          "wire": "fontWeightBold",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "normal",
            "bold",
            "100",
            "200",
            "300",
            "400",
            "500",
            "600",
            "700",
            "800",
            "900"
          ],
          "publicDescription": "Font weight for bold text."
        },
        "lineHeight": {
          "wire": "lineHeight",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Line height as a multiple of the font size."
        },
        "letterSpacing": {
          "wire": "letterSpacing",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "publicDescription": "Extra spacing between characters, in whole pixels."
        },
        "cursorBlink": {
          "wire": "cursorBlink",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Make the cursor blink."
        },
        "cursorStyle": {
          "wire": "cursorStyle",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "block",
            "underline",
            "bar"
          ],
          "publicDescription": "Cursor shape when the terminal has focus."
        },
        "cursorWidth": {
          "wire": "cursorWidth",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Cursor width in pixels when the cursor style is bar."
        },
        "cursorInactiveStyle": {
          "wire": "cursorInactiveStyle",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "outline",
            "block",
            "bar",
            "underline",
            "none"
          ],
          "publicDescription": "Cursor shape when the terminal does not have focus."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "serialize": "json",
          "publicDescription": "Colour theme as a JSON object (foreground, background, cursor, and the 16 ANSI colours)."
        },
        "minimumContrastRatio": {
          "wire": "minimumContrastRatio",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 21,
          "publicDescription": "Minimum contrast ratio between text and background; colours are adjusted to meet it."
        },
        "drawBoldTextInBrightColors": {
          "wire": "drawBoldTextInBrightColors",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Draw bold text in the bright colour variants."
        },
        "scrollback": {
          "wire": "scrollback",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 0,
          "max": 100000,
          "publicDescription": "Number of lines kept above the visible screen."
        },
        "scrollSensitivity": {
          "wire": "scrollSensitivity",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Scroll speed multiplier."
        },
        "fastScrollSensitivity": {
          "wire": "fastScrollSensitivity",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "publicDescription": "Scroll speed multiplier while Alt is held."
        },
        "smoothScrollDuration": {
          "wire": "smoothScrollDuration",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 0,
          "publicDescription": "Smooth-scroll duration in milliseconds; 0 scrolls instantly."
        },
        "screenReaderMode": {
          "wire": "screenReaderMode",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Enable screen-reader support."
        },
        "disableResizeOverlay": {
          "wire": "disableResizeOverlay",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Do not show the size overlay while the window is resized."
        },
        "unicodeVersion": {
          "wire": "unicodeVersion",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "graphemes",
            "11"
          ],
          "publicDescription": "Character-width rules: graphemes (default, emoji-aware) or 11."
        },
        "rendererType": {
          "wire": "rendererType",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "dom",
            "canvas",
            "webgl"
          ],
          "publicDescription": "Renderer used to draw the terminal: webgl (the default; Firefox uses dom), dom, or canvas (drawn with WebGL). Phones, tablets and other touch-screen devices use dom even when webgl or canvas is asked for. Try dom if text renders wrongly with WebGL on a particular browser or GPU."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": false,
      "forwardsQuery": true
    },
    "display.client": {
      "kit": "display",
      "view": "client",
      "service": "display",
      "program": "display",
      "ui": "app",
      "default": true,
      "label": "Display",
      "publicDescription": "Opens the display in the web viewer.",
      "path": "/",
      "params": {
        "decorations": {
          "wire": "decorations",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show window title bars and buttons. Set false for a frameless look."
        },
        "toolbar": {
          "wire": "toolbar",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show the toolbar. false hides it, exactly as menu=false does."
        },
        "menu": {
          "wire": "menu",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show the menu button. false hides it, exactly as toolbar=false does."
        },
        "maximize_new_windows": {
          "wire": "maximize_new_windows",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Open new application windows maximized. Takes effect only on a desktop of at least 1024x1024; on a smaller desktop new windows already fill the screen."
        },
        "readonly": {
          "wire": "readonly",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "View-only mode: keyboard and mouse input is not sent."
        },
        "dark_mode": {
          "wire": "dark_mode",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Use the dark colour scheme."
        },
        "encoding": {
          "wire": "encoding",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "enum": [
            "auto",
            "webp",
            "jpeg",
            "png",
            "rgb"
          ],
          "publicDescription": "Pre-selects the encoding in the settings dialog; does not change the stream encoding."
        },
        "offscreen": {
          "wire": "offscreen",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Render with an offscreen canvas."
        },
        "bandwidth_limit": {
          "wire": "bandwidth_limit",
          "in": "query",
          "type": "integer",
          "class": "passthrough",
          "min": 0,
          "publicDescription": "Bandwidth limit for this viewer in bits per second; 0 means unlimited."
        },
        "override_width": {
          "wire": "override_width",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "publicDescription": "Requested desktop width: auto or a number."
        },
        "override_height": {
          "wire": "override_height",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "publicDescription": "Requested desktop height: auto or a number."
        },
        "vrefresh": {
          "wire": "vrefresh",
          "in": "query",
          "type": "integer",
          "class": "passthrough",
          "publicDescription": "Refresh rate in Hz; -1 picks it automatically."
        },
        "suspend_inactive_tab": {
          "wire": "suspend_inactive_tab",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Pause updates while the browser tab is hidden."
        },
        "sound": {
          "wire": "sound",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Play the session's audio in the viewer."
        },
        "audio_codec": {
          "wire": "audio_codec",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "publicDescription": "Preferred audio codec."
        },
        "keyboard": {
          "wire": "keyboard",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Show the on-screen keyboard."
        },
        "swap_keys": {
          "wire": "swap_keys",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Swap the Cmd and Ctrl keys."
        },
        "clipboard": {
          "wire": "clipboard",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "enum": [
            false
          ],
          "publicDescription": "Set false to turn clipboard sharing off for this viewer."
        },
        "clipboard_preferred_format": {
          "wire": "clipboard_preferred_format",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "enum": [
            "text/plain",
            "text/html",
            "UTF8_STRING"
          ],
          "publicDescription": "Preferred clipboard format."
        },
        "printing": {
          "wire": "printing",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "enum": [
            false
          ],
          "publicDescription": "Set false to turn print forwarding off."
        },
        "file_transfer": {
          "wire": "file_transfer",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "enum": [
            false
          ],
          "publicDescription": "Set false to turn file transfer off."
        },
        "video": {
          "wire": "video",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Allow video encodings."
        },
        "mediasource_video": {
          "wire": "mediasource_video",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Allow MediaSource video decoding."
        },
        "web_notifications": {
          "wire": "web_notifications",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Pre-set the browser-notifications option in the connection dialog."
        },
        "display_notifications": {
          "wire": "display_notifications",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Show notifications inside the display view."
        },
        "notification_connection_type": {
          "wire": "notification_connection_type",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "enum": [
            "websocket",
            "polling"
          ],
          "publicDescription": "Pre-set the notification connection type in the connection dialog."
        },
        "reconnect": {
          "wire": "reconnect",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Reconnect automatically after a lost connection."
        },
        "floating_menu": {
          "wire": "floating_menu",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Show the floating menu."
        },
        "clock": {
          "wire": "clock",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Show the server clock."
        },
        "scroll_reverse_y": {
          "wire": "scroll_reverse_y",
          "in": "query",
          "type": "string",
          "class": "passthrough",
          "enum": [
            "auto",
            "true",
            "false"
          ],
          "publicDescription": "Reverse vertical scrolling: auto, true or false."
        },
        "scroll_reverse_x": {
          "wire": "scroll_reverse_x",
          "in": "query",
          "type": "boolean",
          "class": "passthrough",
          "publicDescription": "Reverse horizontal scrolling."
        },
        "title_show_hoody": {
          "wire": "title_show_hoody",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show Hoody in the page title."
        },
        "title_show_display_id": {
          "wire": "title_show_display_id",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show the display number in the page title."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "browser.status": {
      "kit": "browser",
      "view": "status",
      "service": "browser",
      "program": "browser",
      "ui": "app",
      "default": true,
      "label": "Status",
      "publicDescription": "Lists the running browser instances with links to their display and developer tools.",
      "path": "/",
      "params": {
        "maximize_new_windows": {
          "wire": "maximize_new_windows",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Open new browser windows maximized in the display. On by default."
        }
      },
      "required": [],
      "const": {
        "start": false
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "browser.display": {
      "kit": "browser",
      "view": "display",
      "service": "browser",
      "program": "browser",
      "ui": "app",
      "default": false,
      "label": "Display",
      "publicDescription": "Shows the browser's display full-page.",
      "path": "/",
      "params": {
        "maximize_new_windows": {
          "wire": "maximize_new_windows",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Open new browser windows maximized in the display. On by default."
        },
        "iframe_url": {
          "wire": "iframe_url",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "Web address shown in the full-page frame instead of the browser's own display. Must start with http:// or https://."
        }
      },
      "required": [],
      "const": {
        "view": "display",
        "start": false
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "code.root": {
      "kit": "code",
      "view": "root",
      "service": "code",
      "program": "code",
      "ui": "app",
      "default": false,
      "label": "Editor (default folder)",
      "publicDescription": "The editor opened on the default workspace folder the platform sets. Opening it starts the editor instance when it is not running yet.",
      "path": "/api/v1/code",
      "params": {
        "locale": {
          "wire": "locale",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$",
          "publicDescription": "Display language of the editor, as a language tag such as en or pt-BR. Applies when the instance starts."
        },
        "page-loader": {
          "wire": "page-loader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show a loading overlay while a newly started editor initialises. Applies when the instance starts."
        },
        "disable-walkthroughs": {
          "wire": "disable-walkthroughs",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the editor's walkthrough pages. Applies when the instance starts."
        },
        "hoody-code": {
          "wire": "hoody-code",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Load the Hoody page integration scripts, such as tab-title sync. Applies when the instance starts."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": false,
      "forwardsQuery": true
    },
    "code.editor": {
      "kit": "code",
      "view": "editor",
      "service": "code",
      "program": "code",
      "ui": "app",
      "default": true,
      "label": "Editor",
      "publicDescription": "The editor opened on a folder. Opening it starts the editor instance when it is not running yet.",
      "path": "/api/v1/code",
      "params": {
        "folder": {
          "wire": "folder",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^/",
          "publicDescription": "Absolute path of the folder to open. It applies when the editor instance starts; a running instance keeps the folder it was started with."
        },
        "locale": {
          "wire": "locale",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$",
          "publicDescription": "Display language of the editor, as a language tag such as en or pt-BR. Applies when the instance starts."
        },
        "page-loader": {
          "wire": "page-loader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show a loading overlay while a newly started editor initialises. Applies when the instance starts."
        },
        "disable-walkthroughs": {
          "wire": "disable-walkthroughs",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the editor's walkthrough pages. Applies when the instance starts."
        },
        "hoody-code": {
          "wire": "hoody-code",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Load the Hoody page integration scripts, such as tab-title sync. Applies when the instance starts."
        }
      },
      "required": [
        "folder"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": false,
      "forwardsQuery": true
    },
    "code.extension": {
      "kit": "code",
      "view": "extension",
      "service": "code",
      "program": "code",
      "ui": "app",
      "default": false,
      "label": "Extension",
      "publicDescription": "The editor in extension-only mode: only the chosen extension's view is shown. Opening it starts the editor instance when it is not running yet.",
      "path": "/api/v1/code",
      "params": {
        "folder": {
          "wire": "folder",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^/",
          "publicDescription": "Absolute path of the folder to open. It applies when the editor instance starts; a running instance keeps the folder it was started with."
        },
        "extension": {
          "wire": "extension",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^[a-zA-Z0-9-]+\\.[a-zA-Z0-9-]+$",
          "publicDescription": "Extension identifier in PUBLISHER.NAME form. Opens the editor in extension-only mode, showing only that extension's view."
        },
        "locale": {
          "wire": "locale",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$",
          "publicDescription": "Display language of the editor, as a language tag such as en or pt-BR. Applies when the instance starts."
        },
        "page-loader": {
          "wire": "page-loader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Show a loading overlay while a newly started editor initialises. Applies when the instance starts."
        },
        "disable-walkthroughs": {
          "wire": "disable-walkthroughs",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the editor's walkthrough pages. Applies when the instance starts."
        },
        "hoody-code": {
          "wire": "hoody-code",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Load the Hoody page integration scripts, such as tab-title sync. Applies when the instance starts."
        }
      },
      "required": [
        "extension"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": false,
      "forwardsQuery": true
    },
    "files.root": {
      "kit": "files",
      "view": "root",
      "service": "files",
      "program": "files",
      "ui": "app",
      "default": false,
      "label": "Root folder",
      "publicDescription": "The listing of the container root folder, with upload, rename and delete controls for the user.",
      "path": "/",
      "params": {
        "sort": {
          "wire": "sort",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "name",
            "mtime",
            "size"
          ],
          "publicDescription": "Sort the listing by name, modification time or size."
        },
        "order": {
          "wire": "order",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "asc",
            "desc"
          ],
          "publicDescription": "Sort direction. Only desc changes the order; asc is the default."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme of the page."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme. Without it the page follows the system setting."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "cascadia-code",
            "fira-code",
            "hack",
            "inconsolata",
            "intel-one-mono",
            "iosevka",
            "jetbrains-mono",
            "meslo-lgs",
            "roboto-mono",
            "source-code-pro",
            "ubuntu-mono"
          ],
          "publicDescription": "Monospace font of the editor and listing."
        },
        "fontSize": {
          "wire": "fontSize",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 8,
          "max": 72,
          "publicDescription": "Editor font size in pixels, 8 to 72."
        },
        "embedderOrigin": {
          "wire": "embedderOrigin",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready."
        },
        "chromeless": {
          "wire": "chromeless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false."
        },
        "borderless": {
          "wire": "borderless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the page borders."
        },
        "hideHeader": {
          "wire": "hideHeader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header bar."
        },
        "hideSidebar": {
          "wire": "hideSidebar",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the sidebar."
        },
        "hidePreview": {
          "wire": "hidePreview",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the preview pane."
        },
        "hideFooter": {
          "wire": "hideFooter",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the footer."
        },
        "embedBg": {
          "wire": "embedBg",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "transparent"
          ],
          "publicDescription": "Set to transparent to let the embedding page's background show through."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "files.folder": {
      "kit": "files",
      "view": "folder",
      "service": "files",
      "program": "files",
      "ui": "app",
      "default": true,
      "label": "Folder",
      "publicDescription": "The listing of a folder, with upload, rename and delete controls for the user.",
      "path": "/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "encoder": "path-segments",
          "publicDescription": "Absolute path inside the container, starting with /. Each segment is percent-encoded; the slashes between segments are kept."
        },
        "sort": {
          "wire": "sort",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "name",
            "mtime",
            "size"
          ],
          "publicDescription": "Sort the listing by name, modification time or size."
        },
        "order": {
          "wire": "order",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "asc",
            "desc"
          ],
          "publicDescription": "Sort direction. Only desc changes the order; asc is the default."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme of the page."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme. Without it the page follows the system setting."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "cascadia-code",
            "fira-code",
            "hack",
            "inconsolata",
            "intel-one-mono",
            "iosevka",
            "jetbrains-mono",
            "meslo-lgs",
            "roboto-mono",
            "source-code-pro",
            "ubuntu-mono"
          ],
          "publicDescription": "Monospace font of the editor and listing."
        },
        "fontSize": {
          "wire": "fontSize",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 8,
          "max": 72,
          "publicDescription": "Editor font size in pixels, 8 to 72."
        },
        "embedderOrigin": {
          "wire": "embedderOrigin",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready."
        },
        "chromeless": {
          "wire": "chromeless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false."
        },
        "borderless": {
          "wire": "borderless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the page borders."
        },
        "hideHeader": {
          "wire": "hideHeader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header bar."
        },
        "hideSidebar": {
          "wire": "hideSidebar",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the sidebar."
        },
        "hidePreview": {
          "wire": "hidePreview",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the preview pane."
        },
        "hideFooter": {
          "wire": "hideFooter",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the footer."
        },
        "embedBg": {
          "wire": "embedBg",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "transparent"
          ],
          "publicDescription": "Set to transparent to let the embedding page's background show through."
        }
      },
      "required": [
        "path"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "files.editor": {
      "kit": "files",
      "view": "editor",
      "service": "files",
      "program": "files",
      "ui": "app",
      "default": false,
      "label": "Editor",
      "publicDescription": "A text file opened in the code editor. Changes are saved only when the user saves.",
      "path": "/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "encoder": "path-segments",
          "publicDescription": "Absolute path inside the container, starting with /. Each segment is percent-encoded; the slashes between segments are kept."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme of the page."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme. Without it the page follows the system setting."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "cascadia-code",
            "fira-code",
            "hack",
            "inconsolata",
            "intel-one-mono",
            "iosevka",
            "jetbrains-mono",
            "meslo-lgs",
            "roboto-mono",
            "source-code-pro",
            "ubuntu-mono"
          ],
          "publicDescription": "Monospace font of the editor and listing."
        },
        "fontSize": {
          "wire": "fontSize",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 8,
          "max": 72,
          "publicDescription": "Editor font size in pixels, 8 to 72."
        },
        "embedderOrigin": {
          "wire": "embedderOrigin",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready."
        },
        "chromeless": {
          "wire": "chromeless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false."
        },
        "borderless": {
          "wire": "borderless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the page borders."
        },
        "hideHeader": {
          "wire": "hideHeader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header bar."
        },
        "hideFooter": {
          "wire": "hideFooter",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the footer."
        },
        "embedBg": {
          "wire": "embedBg",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "transparent"
          ],
          "publicDescription": "Set to transparent to let the embedding page's background show through."
        }
      },
      "required": [
        "path"
      ],
      "const": {},
      "flags": [
        "edit"
      ],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "files.search": {
      "kit": "files",
      "view": "search",
      "service": "files",
      "program": "files",
      "ui": "app",
      "default": false,
      "label": "Search",
      "publicDescription": "Search results for a text inside a folder and its subfolders.",
      "path": "/{directory}",
      "params": {
        "directory": {
          "wire": "directory",
          "in": "path",
          "type": "string",
          "class": "typed",
          "encoder": "path-segments",
          "publicDescription": "Absolute path of the folder to search in, starting with /, encoded like path."
        },
        "q": {
          "wire": "q",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Search text. Lists the entries below the folder whose names match."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme of the page."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme. Without it the page follows the system setting."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "cascadia-code",
            "fira-code",
            "hack",
            "inconsolata",
            "intel-one-mono",
            "iosevka",
            "jetbrains-mono",
            "meslo-lgs",
            "roboto-mono",
            "source-code-pro",
            "ubuntu-mono"
          ],
          "publicDescription": "Monospace font of the editor and listing."
        },
        "fontSize": {
          "wire": "fontSize",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 8,
          "max": 72,
          "publicDescription": "Editor font size in pixels, 8 to 72."
        },
        "embedderOrigin": {
          "wire": "embedderOrigin",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^https?://",
          "format": "uri",
          "publicDescription": "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready."
        },
        "chromeless": {
          "wire": "chromeless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false."
        },
        "borderless": {
          "wire": "borderless",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the page borders."
        },
        "hideHeader": {
          "wire": "hideHeader",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the header bar."
        },
        "hideSidebar": {
          "wire": "hideSidebar",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the sidebar."
        },
        "hidePreview": {
          "wire": "hidePreview",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the preview pane."
        },
        "hideFooter": {
          "wire": "hideFooter",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Hide the footer."
        },
        "embedBg": {
          "wire": "embedBg",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "transparent"
          ],
          "publicDescription": "Set to transparent to let the embedding page's background show through."
        }
      },
      "required": [
        "directory",
        "q"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.home": {
      "kit": "notes",
      "view": "home",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": true,
      "label": "Home",
      "publicDescription": "Opens the last used locally available notebook, or the first available one.",
      "path": "/",
      "params": {
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.create": {
      "kit": "notes",
      "view": "create",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Create notebook",
      "publicDescription": "Opens the form for creating a new notebook; only submitting the form creates one. Like any Notes page, the first visit may set up the default notebook and your user in it.",
      "path": "/create",
      "params": {
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.notebook": {
      "kit": "notes",
      "view": "notebook",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Notebook",
      "publicDescription": "Opens a notebook at its last visited location, or its home page.",
      "path": "/notebook/{userId}",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.notebookHome": {
      "kit": "notes",
      "view": "notebookHome",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Notebook home",
      "publicDescription": "Opens the home page of a notebook.",
      "path": "/notebook/{userId}/home",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.node": {
      "kit": "notes",
      "view": "node",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Page",
      "publicDescription": "Opens one page or node of a notebook.",
      "path": "/notebook/{userId}/{nodeId}",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "nodeId": {
          "wire": "nodeId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Id of the page or node to open. New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId",
        "nodeId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.modal": {
      "kit": "notes",
      "view": "modal",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Page with modal",
      "publicDescription": "Opens a page with another node shown in a modal over it.",
      "path": "/notebook/{userId}/{nodeId}/modal/{modalNodeId}",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "nodeId": {
          "wire": "nodeId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Id of the page or node to open. New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "modalNodeId": {
          "wire": "modalNodeId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Id of the node shown in a modal over the page. New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId",
        "nodeId",
        "modalNodeId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.alias": {
      "kit": "notes",
      "view": "alias",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Page by alias",
      "publicDescription": "Opens the page that has the given alias, or the notebook home when none has it.",
      "path": "/notebook/{userId}/alias/{alias}",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "alias": {
          "wire": "alias",
          "in": "path",
          "type": "string",
          "class": "typed",
          "maxLength": 48,
          "pattern": "^[a-z0-9_-]{1,48}$",
          "publicDescription": "Page alias (lowercase letters, digits, '_' and '-', up to 48 characters). Opens the page with that alias, or the notebook home when no page has it."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId",
        "alias"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.files": {
      "kit": "notes",
      "view": "files",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Files",
      "publicDescription": "Opens the file tree of a notebook.",
      "path": "/notebook/{userId}/files",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.uploads": {
      "kit": "notes",
      "view": "uploads",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Uploads",
      "publicDescription": "Opens the uploads list of a notebook.",
      "path": "/notebook/{userId}/uploads",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.downloads": {
      "kit": "notes",
      "view": "downloads",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Downloads",
      "publicDescription": "Opens the downloads list of a notebook.",
      "path": "/notebook/{userId}/downloads",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.users": {
      "kit": "notes",
      "view": "users",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Users",
      "publicDescription": "Opens the member list of a notebook.",
      "path": "/notebook/{userId}/users",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.settings": {
      "kit": "notes",
      "view": "settings",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Notebook settings",
      "publicDescription": "Opens the settings of a notebook.",
      "path": "/notebook/{userId}/settings",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notes.account": {
      "kit": "notes",
      "view": "account",
      "service": "notes",
      "program": "notes",
      "ui": "app",
      "default": false,
      "label": "Account settings",
      "publicDescription": "Opens the account settings for a notebook's account. The display name and avatar choice are kept in this browser for the signed-in identity and do not sync to other browsers or to a frame with separate storage; the avatar image itself is uploaded to the server.",
      "path": "/notebook/{userId}/account",
      "params": {
        "userId": {
          "wire": "userId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "pattern": "^[0-9a-z]{24,28}$",
          "publicDescription": "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "readonly",
            "readwrite"
          ],
          "publicDescription": "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions."
        },
        "sidebar": {
          "wire": "sidebar",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "hidden"
          ],
          "publicDescription": "Set to hidden to hide the notebook sidebar."
        },
        "theme": {
          "wire": "theme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "oc-1",
            "hc-black",
            "aura",
            "ayu",
            "carbonfox",
            "catppuccin",
            "dracula",
            "gruvbox",
            "monokai",
            "nightowl",
            "nord",
            "onedarkpro",
            "shadesofpurple",
            "solarized",
            "tokyonight",
            "vesper"
          ],
          "publicDescription": "Colour theme id."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark"
          ],
          "publicDescription": "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it."
        },
        "font": {
          "wire": "font",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "ibm-plex-mono",
            "jetbrains-mono",
            "fira-code",
            "cascadia-code",
            "hack",
            "source-code-pro",
            "inconsolata",
            "roboto-mono",
            "ubuntu-mono",
            "intel-one-mono",
            "meslo-lgs",
            "iosevka"
          ],
          "publicDescription": "Monospace font id."
        }
      },
      "required": [
        "userId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "sqlite.overview": {
      "kit": "sqlite",
      "view": "overview",
      "service": "sqlite",
      "program": "sqlite",
      "ui": "app",
      "default": true,
      "label": "Overview",
      "publicDescription": "Opens the database overview.",
      "path": "/",
      "params": {
        "db": {
          "wire": "db",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Path of the database file to open. A missing file is reported as an error, never created."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark",
            "system"
          ],
          "publicDescription": "Force the light or dark colour scheme, or follow the system."
        },
        "embed": {
          "wire": "embed",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Compact chrome for embedding: a thin navigation bar instead of the full header."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "sqlite.tables": {
      "kit": "sqlite",
      "view": "tables",
      "service": "sqlite",
      "program": "sqlite",
      "ui": "app",
      "default": false,
      "label": "Tables",
      "publicDescription": "Opens the table browser, optionally with one table selected.",
      "path": "/tables",
      "params": {
        "table": {
          "wire": "table",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Table to select. On the key-value view it names the key-value table (default kv_store)."
        },
        "db": {
          "wire": "db",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Path of the database file to open. A missing file is reported as an error, never created."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark",
            "system"
          ],
          "publicDescription": "Force the light or dark colour scheme, or follow the system."
        },
        "embed": {
          "wire": "embed",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Compact chrome for embedding: a thin navigation bar instead of the full header."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "sqlite.query": {
      "kit": "sqlite",
      "view": "query",
      "service": "sqlite",
      "program": "sqlite",
      "ui": "app",
      "default": false,
      "label": "Query editor",
      "publicDescription": "Opens the SQL query editor. Nothing runs until you run a query.",
      "path": "/query",
      "params": {
        "db": {
          "wire": "db",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Path of the database file to open. A missing file is reported as an error, never created."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark",
            "system"
          ],
          "publicDescription": "Force the light or dark colour scheme, or follow the system."
        },
        "embed": {
          "wire": "embed",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Compact chrome for embedding: a thin navigation bar instead of the full header."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "sqlite.kvStore": {
      "kit": "sqlite",
      "view": "kvStore",
      "service": "sqlite",
      "program": "sqlite",
      "ui": "app",
      "default": false,
      "label": "Key-value store",
      "publicDescription": "Opens the key-value store browser.",
      "path": "/kv-store",
      "params": {
        "table": {
          "wire": "table",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Table to select. On the key-value view it names the key-value table (default kv_store)."
        },
        "db": {
          "wire": "db",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Path of the database file to open. A missing file is reported as an error, never created."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark",
            "system"
          ],
          "publicDescription": "Force the light or dark colour scheme, or follow the system."
        },
        "embed": {
          "wire": "embed",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Compact chrome for embedding: a thin navigation bar instead of the full header."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "sqlite.history": {
      "kit": "sqlite",
      "view": "history",
      "service": "sqlite",
      "program": "sqlite",
      "ui": "app",
      "default": false,
      "label": "History",
      "publicDescription": "Opens the query history.",
      "path": "/history",
      "params": {
        "db": {
          "wire": "db",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Path of the database file to open. A missing file is reported as an error, never created."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark",
            "system"
          ],
          "publicDescription": "Force the light or dark colour scheme, or follow the system."
        },
        "embed": {
          "wire": "embed",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Compact chrome for embedding: a thin navigation bar instead of the full header."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "sqlite.pragmas": {
      "kit": "sqlite",
      "view": "pragmas",
      "service": "sqlite",
      "program": "sqlite",
      "ui": "app",
      "default": false,
      "label": "Pragmas",
      "publicDescription": "Opens the database pragma settings. Nothing changes until you save.",
      "path": "/pragmas",
      "params": {
        "db": {
          "wire": "db",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Path of the database file to open. A missing file is reported as an error, never created."
        },
        "colorScheme": {
          "wire": "colorScheme",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "light",
            "dark",
            "system"
          ],
          "publicDescription": "Force the light or dark colour scheme, or follow the system."
        },
        "embed": {
          "wire": "embed",
          "in": "query",
          "type": "boolean",
          "class": "typed",
          "publicDescription": "Compact chrome for embedding: a thin navigation bar instead of the full header."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "notifications.landing": {
      "kit": "notifications",
      "view": "landing",
      "service": "n",
      "program": "notifications",
      "ui": "app",
      "default": true,
      "label": "Notifications",
      "publicDescription": "Recent and live notifications from every display, with a button to send a test notification to one display.",
      "path": "/",
      "params": {
        "display": {
          "wire": "display",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^(\\d{1,5}|all|\\*)$",
          "publicDescription": "Display number to send the test notification to, or all (also *) to send it to every display the page has seen notifications from. Takes precedence over the display named by the host. The feed always shows every display."
        },
        "displays": {
          "wire": "displays",
          "in": "query",
          "type": "string",
          "class": "typed",
          "pattern": "^(\\d{1,5}|all|\\*)$",
          "publicDescription": "Alternative name for display; read only when display is absent."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "selector",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true,
      "aliasSelector": "display"
    },
    "pipe.send": {
      "kit": "pipe",
      "view": "send",
      "service": "pipe",
      "program": "pipe",
      "ui": "app",
      "default": true,
      "label": "Send",
      "publicDescription": "The page for sending a file or text to a pipe path. Its fields can be pre-filled, except the file itself, which the user picks; nothing is sent until the user confirms.",
      "path": "/api/v1/pipe/",
      "params": {
        "name": {
          "wire": "name",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 1023,
          "pattern": "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$",
          "publicDescription": "Pipe name to pre-fill on the send page, without a leading slash. The values . and .. as a segment, control characters, backslashes and the reserved names help, noscript, health, metrics, favicon.ico and robots.txt are refused. Absent: the page picks a random name."
        },
        "n": {
          "wire": "n",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 256,
          "publicDescription": "How many receivers the transfer waits for, from 1 to 256. It pre-fills the receivers field; nothing is sent or received until the user confirms on the page."
        },
        "text": {
          "wire": "text",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 100000,
          "publicDescription": "Text to pre-fill on the send page; it selects text mode unless mode says otherwise."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "file",
            "text"
          ],
          "publicDescription": "Whether the form sends a file or typed text. Defaults to file, or on the send page to text when text is given."
        },
        "filename": {
          "wire": "filename",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 255,
          "publicDescription": "A file name to pre-fill: on the send page the name given to a text or pasted send, on the receive page the download name."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "pipe.noscript": {
      "kit": "pipe",
      "view": "noscript",
      "service": "pipe",
      "program": "pipe",
      "ui": "app",
      "default": false,
      "label": "Send without JavaScript",
      "publicDescription": "A plain HTML form for sending a file or text to a pipe path, for browsers without JavaScript.",
      "path": "/api/v1/pipe/noscript",
      "params": {
        "noscriptPath": {
          "wire": "path",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 1024,
          "pattern": "^(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:\\.|%2[Ee]){1,2}$)[a-zA-Z0-9._~:@!$&'()*+,;=%-]+$",
          "publicDescription": "Pipe path to prefill in the form, without a leading slash. Letters, digits and the characters . _ ~ : @ ! $ & ' ( ) * + , ; = % - only. The values . and .., and the reserved names help, noscript, health, metrics, favicon.ico and robots.txt are refused."
        },
        "mode": {
          "wire": "mode",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "file",
            "text"
          ],
          "publicDescription": "Whether the form sends a file or typed text. Defaults to file, or on the send page to text when text is given."
        },
        "wait": {
          "wire": "wait",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 3600,
          "publicDescription": "Seconds the page's own transfer waits for the other side, from 1 to 3600 (default 300): on the receive page how long the download waits for the sender, on the video player how long the player waits for the stream, on the send page without JavaScript how long the send waits for the receivers. It changes no other participant's wait."
        },
        "sha256": {
          "wire": "sha256",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "1"
          ],
          "publicDescription": "1 to have the kit compute a SHA-256 digest of the transfer the page starts: the receive page's download or the send of the page without JavaScript. Leave it out for none. The page without JavaScript shows the digest in its send result; the receive page shows none (the digest goes to the sender's status)."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "pipe.progress": {
      "kit": "pipe",
      "view": "progress",
      "service": "pipe",
      "program": "pipe",
      "ui": "app",
      "default": false,
      "label": "Progress",
      "publicDescription": "A live view of a transfer's progress on a pipe path. It only observes; it does not receive the data.",
      "path": "/api/v1/pipe/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "maxLength": 1023,
          "pattern": "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$",
          "wirePattern": "^[^\\x00-\\x1F\\x7F\\\\]+$",
          "encoder": "pipe-path",
          "publicDescription": "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded."
        }
      },
      "required": [
        "path"
      ],
      "const": {
        "progress": "true"
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "pipe.video": {
      "kit": "pipe",
      "view": "video",
      "service": "pipe",
      "program": "pipe",
      "ui": "app",
      "default": false,
      "label": "Video player",
      "publicDescription": "A video player for a video streamed to a pipe path. Opening it starts receiving: the player takes the stream as one of the transfer's receivers or, with live, joins a live stream from now on.",
      "path": "/api/v1/pipe/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "maxLength": 1023,
          "pattern": "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$",
          "wirePattern": "^[^\\x00-\\x1F\\x7F\\\\]+$",
          "encoder": "pipe-path",
          "publicDescription": "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded."
        },
        "live": {
          "wire": "live",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "1"
          ],
          "publicDescription": "1 for a live stream. On the share page it pre-ticks Live: once the user starts, viewers join and leave at any time, and the receivers count is hidden and not used. On the video player the player joins a live stream from now on and keeps up with the newest data. Any n is then ignored."
        },
        "wait": {
          "wire": "wait",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 3600,
          "publicDescription": "Seconds the page's own transfer waits for the other side, from 1 to 3600 (default 300): on the receive page how long the download waits for the sender, on the video player how long the player waits for the stream, on the send page without JavaScript how long the send waits for the receivers. It changes no other participant's wait."
        }
      },
      "required": [
        "path"
      ],
      "const": {
        "video": "true"
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": true,
      "forwardsQuery": true
    },
    "pipe.share": {
      "kit": "pipe",
      "view": "share",
      "service": "pipe",
      "program": "pipe",
      "ui": "app",
      "default": false,
      "label": "Share screen, camera or audio",
      "publicDescription": "A page that streams the user's screen, camera or microphone live to a pipe path, for viewers on the video view. Capture starts only on the user's click. In an iframe, give the frame allow=\"display-capture; camera; microphone; autoplay\".",
      "path": "/api/v1/pipe/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "maxLength": 1023,
          "pattern": "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$",
          "wirePattern": "^[^\\x00-\\x1F\\x7F\\\\]+$",
          "encoder": "pipe-path",
          "publicDescription": "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded."
        },
        "source": {
          "wire": "source",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "screen",
            "camera",
            "audio"
          ],
          "publicDescription": "What the share page captures: screen (default), camera or audio (microphone only)."
        },
        "audio": {
          "wire": "audio",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "1",
            "0"
          ],
          "publicDescription": "1 to also capture audio when sharing a screen, 0 (default) for none."
        },
        "surface": {
          "wire": "surface",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "monitor",
            "window",
            "browser"
          ],
          "publicDescription": "Which kind of surface the browser's screen picker offers first: monitor, window or browser (tab). A hint; the user still picks."
        },
        "quality": {
          "wire": "quality",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "low",
            "medium",
            "high"
          ],
          "publicDescription": "Video quality of the share: low, medium (default) or high."
        },
        "fps": {
          "wire": "fps",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 60,
          "publicDescription": "Frames per second of the share, from 1 to 60 (default 30)."
        },
        "n": {
          "wire": "n",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 256,
          "publicDescription": "How many receivers the transfer waits for, from 1 to 256. It pre-fills the receivers field; nothing is sent or received until the user confirms on the page."
        },
        "live": {
          "wire": "live",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "1"
          ],
          "publicDescription": "1 for a live stream. On the share page it pre-ticks Live: once the user starts, viewers join and leave at any time, and the receivers count is hidden and not used. On the video player the player joins a live stream from now on and keeps up with the newest data. Any n is then ignored."
        }
      },
      "required": [
        "path"
      ],
      "const": {
        "share": "true"
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "pipe.receive": {
      "kit": "pipe",
      "view": "receive",
      "service": "pipe",
      "program": "pipe",
      "ui": "app",
      "default": false,
      "label": "Receive",
      "publicDescription": "A page for receiving what is sent to a pipe path as a download. It shows the transfer state and starts the download only on the user's click.",
      "path": "/api/v1/pipe/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "maxLength": 1023,
          "pattern": "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$",
          "wirePattern": "^[^\\x00-\\x1F\\x7F\\\\]+$",
          "encoder": "pipe-path",
          "publicDescription": "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded."
        },
        "n": {
          "wire": "n",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 256,
          "publicDescription": "How many receivers the transfer waits for, from 1 to 256. It pre-fills the receivers field; nothing is sent or received until the user confirms on the page."
        },
        "filename": {
          "wire": "filename",
          "in": "query",
          "type": "string",
          "class": "typed",
          "maxLength": 255,
          "publicDescription": "A file name to pre-fill: on the send page the name given to a text or pasted send, on the receive page the download name."
        },
        "wait": {
          "wire": "wait",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 3600,
          "publicDescription": "Seconds the page's own transfer waits for the other side, from 1 to 3600 (default 300): on the receive page how long the download waits for the sender, on the video player how long the player waits for the stream, on the send page without JavaScript how long the send waits for the receivers. It changes no other participant's wait."
        },
        "sha256": {
          "wire": "sha256",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "1"
          ],
          "publicDescription": "1 to have the kit compute a SHA-256 digest of the transfer the page starts: the receive page's download or the send of the page without JavaScript. Leave it out for none. The page without JavaScript shows the digest in its send result; the receive page shows none (the digest goes to the sender's status)."
        }
      },
      "required": [
        "path"
      ],
      "const": {
        "receive": "true"
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "cron.manager": {
      "kit": "cron",
      "view": "manager",
      "service": "cron",
      "program": "cron",
      "ui": "app",
      "default": true,
      "label": "Cron manager",
      "publicDescription": "Lists users and their cron entries; changes are made only through the page controls.",
      "path": "/",
      "params": {},
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "supported",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "bot.index": {
      "kit": "bot",
      "view": "index",
      "service": "bot",
      "program": "bot",
      "ui": "app",
      "default": true,
      "label": "Bot registrations",
      "publicDescription": "Lists every bot registration of the owner, with a form to register a new one.",
      "path": "/",
      "params": {},
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "bot.detail": {
      "kit": "bot",
      "view": "detail",
      "service": "bot",
      "program": "bot",
      "ui": "app",
      "default": false,
      "label": "Registration",
      "publicDescription": "One bot registration with its state and its start and stop controls.",
      "path": "/api/v1/bot/ui/registrations/{registrationId}",
      "params": {
        "registrationId": {
          "wire": "registrationId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "publicDescription": "Registration id, as returned when the bot was registered or listed."
        }
      },
      "required": [
        "registrationId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "bot.confirmDelete": {
      "kit": "bot",
      "view": "confirmDelete",
      "service": "bot",
      "program": "bot",
      "ui": "app",
      "default": false,
      "label": "Confirm deletion",
      "publicDescription": "Asks for confirmation before a registration is deleted. Opening this page deletes nothing.",
      "path": "/api/v1/bot/ui/registrations/{registrationId}/delete",
      "params": {
        "registrationId": {
          "wire": "registrationId",
          "in": "path",
          "type": "string",
          "class": "typed",
          "publicDescription": "Registration id, as returned when the bot was registered or listed."
        }
      },
      "required": [
        "registrationId"
      ],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "run.results": {
      "kit": "run",
      "view": "results",
      "service": "run",
      "program": "run",
      "ui": "app",
      "default": true,
      "label": "Results",
      "publicDescription": "The list of applications matching a name. It only looks them up; nothing is installed or started.",
      "path": "/api/v1/run/resolve",
      "params": {
        "app": {
          "wire": "app",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Name of the application to look up."
        },
        "os": {
          "wire": "os",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "linux",
            "windows",
            "any"
          ],
          "publicDescription": "Target operating system of the application."
        },
        "source": {
          "wire": "source",
          "in": "query",
          "type": "array",
          "class": "typed",
          "repeat": "ordered",
          "publicDescription": "Source types to search: `nix`, `pkgx`, `appimage`, `oci` (Docker images already on the machine), `registry`, `system` or `any`. Repeat the key for several types."
        },
        "kind": {
          "wire": "kind",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "gui",
            "cli",
            "any"
          ],
          "publicDescription": "Graphical or terminal applications."
        },
        "arch": {
          "wire": "arch",
          "in": "query",
          "type": "string",
          "class": "typed",
          "enum": [
            "amd64",
            "arm64",
            "any"
          ],
          "publicDescription": "Target CPU architecture."
        },
        "profile": {
          "wire": "profile",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Named preference profile to apply to this lookup; without it, the selected profile applies. The results page appears only when the profile leaves `pick` unset or set to `ask`: a profile that picks a result answers with JSON instead."
        },
        "version": {
          "wire": "version",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Package version for pkgx candidates: the listed pkgx entry runs that version. It does not change which applications are listed."
        },
        "repo": {
          "wire": "repo",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Limits the GitHub-release applications to the configured repository with this name."
        },
        "release": {
          "wire": "release",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Release tag to use for GitHub-release applications."
        },
        "asset": {
          "wire": "asset",
          "in": "query",
          "type": "string",
          "class": "typed",
          "publicDescription": "Asset-name filter for GitHub-release applications; with no matching asset the application is not listed."
        },
        "limit": {
          "wire": "limit",
          "in": "query",
          "type": "integer",
          "class": "typed",
          "min": 1,
          "max": 100,
          "publicDescription": "Maximum number of candidates, 1 to 100. The page lists at most 50."
        }
      },
      "required": [
        "app"
      ],
      "const": {
        "format": "html"
      },
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "watch.index": {
      "kit": "watch",
      "view": "index",
      "service": "watch",
      "program": "watch",
      "ui": "info",
      "default": true,
      "label": "About",
      "publicDescription": "A static page describing the watch service and where its API starts.",
      "path": "/",
      "params": {},
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": false,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "exec.script": {
      "kit": "exec",
      "view": "script",
      "service": "exec",
      "program": "exec",
      "ui": "user-content",
      "default": true,
      "label": "Script page",
      "publicDescription": "The response of your script for the given path. Opening it runs the script; any query parameters are passed to it unchanged.",
      "path": "/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "encoder": "path-segments",
          "publicDescription": "Path of the script route to open, without the leading slash. Each segment is percent-encoded; the slashes between segments are kept."
        }
      },
      "required": [
        "path"
      ],
      "const": {},
      "flags": [],
      "freeQuery": true,
      "frameable": "yes",
      "alias": "refused",
      "spawns": true,
      "mutating": true,
      "forwardsQuery": true
    },
    "http.content": {
      "kit": "http",
      "view": "content",
      "service": "http",
      "program": "http",
      "ui": "user-content",
      "default": true,
      "label": "App content",
      "publicDescription": "A path of the application on this port, with any query the caller passes.",
      "path": "/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "encoder": "path-segments",
          "publicDescription": "Path inside the application, encoded segment by segment."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": true,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    },
    "https.content": {
      "kit": "https",
      "view": "content",
      "service": "https",
      "program": "https",
      "ui": "user-content",
      "default": true,
      "label": "App content",
      "publicDescription": "A path of the application on this port, with any query the caller passes.",
      "path": "/{path}",
      "params": {
        "path": {
          "wire": "path",
          "in": "path",
          "type": "string",
          "class": "typed",
          "encoder": "path-segments",
          "publicDescription": "Path inside the application, encoded segment by segment."
        }
      },
      "required": [],
      "const": {},
      "flags": [],
      "freeQuery": true,
      "frameable": "yes",
      "alias": "refused",
      "spawns": false,
      "mutating": false,
      "forwardsQuery": true
    }
  }
} as const;

export type EmbedsCatalog = typeof EMBEDS_CATALOG;

/**
 * Typed wrappers, one function per view, over a build function supplied by the caller (the runtime).
 * Taking the function as an argument keeps this table free of imports.
 */
export function makeEmbedWrappers<TTarget>(
  build: (viewId: EmbedViewId, target: TTarget, opts: EmbedWrapperOptions<EmbedViewId>) => string,
) {
  return {
    terminal: {
      /** Terminal session. */
      session: (target: TTarget, opts?: EmbedWrapperOptions<"terminal.session">): string =>
        build("terminal.session", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    desktop: {
      /** Desktop. */
      session: (target: TTarget, opts?: EmbedWrapperOptions<"desktop.session">): string =>
        build("desktop.session", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    agent: {
      /** Agent. */
      webui: (target: TTarget, opts?: EmbedWrapperOptions<"agent.webui">): string =>
        build("agent.webui", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    display: {
      /** Display. */
      client: (target: TTarget, opts?: EmbedWrapperOptions<"display.client">): string =>
        build("display.client", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    browser: {
      /** Status. */
      status: (target: TTarget, opts?: EmbedWrapperOptions<"browser.status">): string =>
        build("browser.status", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Display. */
      display: (target: TTarget, opts?: EmbedWrapperOptions<"browser.display">): string =>
        build("browser.display", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    code: {
      /** Editor (default folder). */
      root: (target: TTarget, opts?: EmbedWrapperOptions<"code.root">): string =>
        build("code.root", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Editor. */
      editor: (target: TTarget, opts: EmbedWrapperOptions<"code.editor">): string =>
        build("code.editor", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Extension. */
      extension: (target: TTarget, opts: EmbedWrapperOptions<"code.extension">): string =>
        build("code.extension", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    files: {
      /** Root folder. */
      root: (target: TTarget, opts?: EmbedWrapperOptions<"files.root">): string =>
        build("files.root", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Folder. */
      folder: (target: TTarget, opts: EmbedWrapperOptions<"files.folder">): string =>
        build("files.folder", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Editor. */
      editor: (target: TTarget, opts: EmbedWrapperOptions<"files.editor">): string =>
        build("files.editor", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Search. */
      search: (target: TTarget, opts: EmbedWrapperOptions<"files.search">): string =>
        build("files.search", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    notes: {
      /** Home. */
      home: (target: TTarget, opts?: EmbedWrapperOptions<"notes.home">): string =>
        build("notes.home", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Create notebook. */
      create: (target: TTarget, opts?: EmbedWrapperOptions<"notes.create">): string =>
        build("notes.create", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Notebook. */
      notebook: (target: TTarget, opts: EmbedWrapperOptions<"notes.notebook">): string =>
        build("notes.notebook", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Notebook home. */
      notebookHome: (target: TTarget, opts: EmbedWrapperOptions<"notes.notebookHome">): string =>
        build("notes.notebookHome", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Page. */
      node: (target: TTarget, opts: EmbedWrapperOptions<"notes.node">): string =>
        build("notes.node", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Page with modal. */
      modal: (target: TTarget, opts: EmbedWrapperOptions<"notes.modal">): string =>
        build("notes.modal", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Page by alias. */
      alias: (target: TTarget, opts: EmbedWrapperOptions<"notes.alias">): string =>
        build("notes.alias", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Files. */
      files: (target: TTarget, opts: EmbedWrapperOptions<"notes.files">): string =>
        build("notes.files", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Uploads. */
      uploads: (target: TTarget, opts: EmbedWrapperOptions<"notes.uploads">): string =>
        build("notes.uploads", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Downloads. */
      downloads: (target: TTarget, opts: EmbedWrapperOptions<"notes.downloads">): string =>
        build("notes.downloads", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Users. */
      users: (target: TTarget, opts: EmbedWrapperOptions<"notes.users">): string =>
        build("notes.users", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Notebook settings. */
      settings: (target: TTarget, opts: EmbedWrapperOptions<"notes.settings">): string =>
        build("notes.settings", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Account settings. */
      account: (target: TTarget, opts: EmbedWrapperOptions<"notes.account">): string =>
        build("notes.account", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    sqlite: {
      /** Overview. */
      overview: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.overview">): string =>
        build("sqlite.overview", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Tables. */
      tables: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.tables">): string =>
        build("sqlite.tables", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Query editor. */
      query: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.query">): string =>
        build("sqlite.query", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Key-value store. */
      kvStore: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.kvStore">): string =>
        build("sqlite.kvStore", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** History. */
      history: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.history">): string =>
        build("sqlite.history", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Pragmas. */
      pragmas: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.pragmas">): string =>
        build("sqlite.pragmas", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    notifications: {
      /** Notifications. */
      landing: (target: TTarget, opts?: EmbedWrapperOptions<"notifications.landing">): string =>
        build("notifications.landing", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    pipe: {
      /** Send. */
      send: (target: TTarget, opts?: EmbedWrapperOptions<"pipe.send">): string =>
        build("pipe.send", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Send without JavaScript. */
      noscript: (target: TTarget, opts?: EmbedWrapperOptions<"pipe.noscript">): string =>
        build("pipe.noscript", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Progress. */
      progress: (target: TTarget, opts: EmbedWrapperOptions<"pipe.progress">): string =>
        build("pipe.progress", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Video player. */
      video: (target: TTarget, opts: EmbedWrapperOptions<"pipe.video">): string =>
        build("pipe.video", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Share screen, camera or audio. */
      share: (target: TTarget, opts: EmbedWrapperOptions<"pipe.share">): string =>
        build("pipe.share", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Receive. */
      receive: (target: TTarget, opts: EmbedWrapperOptions<"pipe.receive">): string =>
        build("pipe.receive", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    cron: {
      /** Cron manager. */
      manager: (target: TTarget, opts?: EmbedWrapperOptions<"cron.manager">): string =>
        build("cron.manager", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    bot: {
      /** Bot registrations. */
      index: (target: TTarget, opts?: EmbedWrapperOptions<"bot.index">): string =>
        build("bot.index", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Registration. */
      detail: (target: TTarget, opts: EmbedWrapperOptions<"bot.detail">): string =>
        build("bot.detail", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
      /** Confirm deletion. */
      confirmDelete: (target: TTarget, opts: EmbedWrapperOptions<"bot.confirmDelete">): string =>
        build("bot.confirmDelete", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    run: {
      /** Results. */
      results: (target: TTarget, opts: EmbedWrapperOptions<"run.results">): string =>
        build("run.results", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    watch: {
      /** About. */
      index: (target: TTarget, opts?: EmbedWrapperOptions<"watch.index">): string =>
        build("watch.index", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    exec: {
      /** Script page. */
      script: (target: TTarget, opts: EmbedWrapperOptions<"exec.script">): string =>
        build("exec.script", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    http: {
      /** App content. */
      content: (target: TTarget, opts?: EmbedWrapperOptions<"http.content">): string =>
        build("http.content", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
    https: {
      /** App content. */
      content: (target: TTarget, opts?: EmbedWrapperOptions<"https.content">): string =>
        build("https.content", target, (opts ?? {}) as EmbedWrapperOptions<EmbedViewId>),
    },
  };
}

/** The object `makeEmbedWrappers` returns. */
export type EmbedWrappers<TTarget> = ReturnType<typeof makeEmbedWrappers<TTarget>>;
