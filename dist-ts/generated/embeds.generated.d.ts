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
export declare const EMBEDS_CATALOG: {
    readonly catalogVersion: 1;
    readonly catalogUrl: "https://docs.hoody.com/embeds/catalog.v1.json";
    readonly host: {
        readonly template: "https://{projectId}-{containerId}-{segment}.{serverName}.{containersDomain}";
        readonly inputs: {
            readonly projectId: "container.project_id";
            readonly containerId: "container.id";
            readonly serverName: "container.server_name";
        };
    };
    readonly domain: {
        readonly fallback: "containers.hoody.com";
        readonly branches: readonly [{
            readonly branch: 1;
            readonly when: {
                readonly unparseableOrEmpty: true;
            };
            readonly result: {
                readonly fallback: true;
            };
        }, {
            readonly branch: 2;
            readonly when: {
                readonly any: readonly [{
                    readonly regex: {
                        readonly pattern: "^\\d{1,3}(?:\\.\\d{1,3}){3}$";
                    };
                }, {
                    readonly contains: ":";
                }, {
                    readonly equals: "localhost";
                }, {
                    readonly endsWith: ".localhost";
                }];
            };
            readonly result: {
                readonly host: true;
            };
        }, {
            readonly branch: 3;
            readonly when: {
                readonly startsWith: "containers.";
            };
            readonly result: {
                readonly host: true;
            };
        }, {
            readonly branch: 4;
            readonly when: {
                readonly regex: {
                    readonly pattern: "^[a-f0-9]{24}\\.api\\.";
                    readonly caseInsensitive: true;
                };
            };
            readonly result: {
                readonly replaceRegex: {
                    readonly pattern: "^[a-f0-9]{24}\\.api\\.";
                    readonly caseInsensitive: true;
                    readonly with: "containers.";
                };
            };
        }, {
            readonly branch: 5;
            readonly when: {
                readonly startsWith: "api.";
            };
            readonly result: {
                readonly stripPrefixThenPrepend: {
                    readonly strip: "api.";
                    readonly prepend: "containers.";
                };
            };
        }, {
            readonly branch: 6;
            readonly when: {
                readonly contains: ".api.";
            };
            readonly result: {
                readonly replaceFirst: {
                    readonly find: ".api.";
                    readonly with: ".containers.";
                };
            };
        }, {
            readonly branch: 7;
            readonly when: {
                readonly always: true;
            };
            readonly result: {
                readonly prepend: "containers.";
            };
        }];
    };
    readonly serialization: {
        readonly order: readonly ["const", "flags", "params", "query"];
        readonly paramsOrder: "the order of the view params list";
        readonly queryOrder: "caller order";
        readonly boolean: {
            readonly true: "true";
            readonly false: "false";
        };
        readonly number: "decimal, as JavaScript String(n)";
        readonly flag: "key=";
        readonly repeat: "one key=value pair per item, in caller order";
        readonly json: "JSON.stringify of the value";
        readonly percentEncoding: "UTF-8, then every byte except A-Z a-z 0-9 - _ . ! ~ * ' ( ) is percent-encoded (encodeURIComponent); applied to keys and values. A key or value with a lone surrogate (an unpaired UTF-16 code unit, which has no UTF-8 form) is refused: VALUE_INVALID, PATH_INVALID in a path; a JSON-serialized value is not refused: JSON.stringify writes a lone surrogate as a \\uXXXX escape";
        readonly separator: "&";
        readonly emptyQuery: "no ? is emitted";
        readonly aliasSelector: "on a ProxyAlias target, a view with alias \"selector\" gets aliasSelector=<index> when the caller did not set it; its position is the selector param position in the params list";
    };
    readonly encoders: {
        readonly "path-segments": {
            readonly input: "an absolute path starting with /";
            readonly refuse: "a relative path, a NUL character, a lone surrogate, or a . or .. segment";
            readonly output: "the path split on /, each segment percent-encoded as in serialization.percentEncoding, joined with /; the leading / of the value replaces the / before the path template variable; a trailing / is kept";
        };
        readonly "pipe-path": {
            readonly input: "a relative path matching the param pattern and wirePattern";
            readonly output: "the value split on /, each segment percent-encoded as in serialization.percentEncoding, joined with /";
            readonly refuse: "a NUL character, a lone surrogate, or an encoded path longer than 1023 characters";
        };
        readonly default: {
            readonly output: "a path variable without an encoder is percent-encoded as one segment";
            readonly refuse: "a NUL character or a lone surrogate";
        };
    };
    readonly alias: {
        readonly host: "the origin of the alias url; a null url is refused (ALIAS_URL_MISSING)";
        readonly match: "the alias program must equal the view program and the alias index must equal the requested index (ALIAS_MISMATCH)";
        readonly views: "alias \"refused\" views are refused on alias targets (ALIAS_VIEW_UNSUPPORTED)";
        readonly targetPath: "an alias with a non-null target_path is refused for views whose path is / (ALIAS_TARGET_PATH_CONFLICT)";
    };
    readonly services: {
        readonly terminal: {
            readonly segment: "terminal-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 65535;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "session number. With 24-character project and container ids, numbers above 9999 make a host label longer than 63 characters, which the SDK refuses (HOST_LABEL_TOO_LONG).";
            };
        };
        readonly desktop: {
            readonly segment: "desktop-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 59935;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "desktop number, 1 or more";
            };
        };
        readonly agent: {
            readonly segment: "agent-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 19999;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "agent number, 1 or more";
            };
        };
        readonly display: {
            readonly segment: "display-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 61535;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "display number";
            };
        };
        readonly browser: {
            readonly segment: "browser-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "browser instance number";
            };
        };
        readonly code: {
            readonly segment: "code-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 58535;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "Editor instance number, 1 or more. Each number is a separate editor instance with its own folder and state.";
            };
        };
        readonly files: {
            readonly segment: "files-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same file manager.";
            };
        };
        readonly notes: {
            readonly segment: "notes-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same instance.";
            };
        };
        readonly sqlite: {
            readonly segment: "sqlite-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same instance.";
            };
        };
        readonly n: {
            readonly segment: "n-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 61535;
                readonly default: 1;
                readonly selects: "instance";
                readonly publicMeaning: "Display number the page sends its test notification to.";
            };
        };
        readonly pipe: {
            readonly segment: "pipe-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same pipe service.";
            };
        };
        readonly cron: {
            readonly segment: "cron-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same instance.";
            };
        };
        readonly bot: {
            readonly segment: "bot-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same instance.";
            };
        };
        readonly run: {
            readonly segment: "run-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same service.";
            };
        };
        readonly watch: {
            readonly segment: "watch-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index opens the same instance.";
            };
        };
        readonly exec: {
            readonly segment: "exec-{index}";
            readonly index: {
                readonly min: 1;
                readonly max: 9999;
                readonly default: 1;
                readonly selects: "none";
                readonly publicMeaning: "Any index reaches the same script service.";
            };
        };
        readonly http: {
            readonly segment: "http-{port}";
            readonly port: {
                readonly min: 1;
                readonly max: 65535;
            };
        };
        readonly https: {
            readonly segment: "https-{port}";
            readonly port: {
                readonly min: 1;
                readonly max: 65535;
            };
        };
    };
    readonly kits: {
        readonly terminal: {
            readonly ui: "app";
            readonly views: readonly ["terminal.session"];
            readonly refused: {
                readonly terminal_id: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly display: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly cwd_auto_create: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly shell: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly user: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly cmd: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly arg: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly reset: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly pid: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly env: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly startup_script: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly welcome: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly env_inject: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly desktop: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly redirect: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly agent: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly ephemeral: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly desktop_env: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly ssh_host: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_user: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_port: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_password: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_key: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_host: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_port: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_user: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_pass: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly redirect_delay: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly wait_timeout: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
            };
            readonly publicDescription: "Web terminal sessions in the browser.";
            readonly defaultView: "terminal.session";
        };
        readonly desktop: {
            readonly ui: "app";
            readonly views: readonly ["desktop.session"];
            readonly refused: {
                readonly terminal_id: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly display: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly desktop: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "view";
                };
                readonly redirect: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "view";
                };
                readonly cwd_auto_create: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly shell: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly user: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly cmd: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly arg: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly reset: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly pid: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly env: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly startup_script: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly welcome: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly env_inject: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly agent: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly ssh_host: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_user: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_port: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_password: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_key: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_host: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_port: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_user: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_pass: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly cwd: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly readonly: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly title: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly fontSize: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly backgroundColor: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly panel: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-visible": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-position": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-width": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-height": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-resizable": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-width-pct": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "panel-height-pct": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly "hide-toolbar": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly fontFamily: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly fontWeight: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly fontWeightBold: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly lineHeight: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly letterSpacing: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly cursorBlink: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly cursorStyle: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly cursorWidth: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly cursorInactiveStyle: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly theme: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly minimumContrastRatio: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly drawBoldTextInBrightColors: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly scrollback: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly scrollSensitivity: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly fastScrollSensitivity: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly smoothScrollDuration: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly screenReaderMode: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly disableResizeOverlay: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly unicodeVersion: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly rendererType: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly ephemeral: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "A full graphical desktop environment in the browser.";
            readonly defaultView: "desktop.session";
        };
        readonly agent: {
            readonly ui: "app";
            readonly views: readonly ["agent.webui"];
            readonly refused: {
                readonly terminal_id: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly display: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly agent: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "view";
                };
                readonly cwd_auto_create: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly shell: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly user: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly cmd: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly arg: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly reset: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly pid: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly env: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly startup_script: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly welcome: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly env_inject: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly desktop: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly redirect: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly onboarding: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly desktop_env: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly cwd: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly readonly: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly ssh_host: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_user: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_port: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_password: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly ssh_key: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_host: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_port: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_user: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly socks5_pass: {
                    readonly class: "excluded";
                    readonly reasonCode: "credential";
                };
                readonly redirect_delay: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly wait_timeout: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly ephemeral: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "The Hoody agent's interactive interface and API reference.";
            readonly defaultView: "agent.webui";
        };
        readonly display: {
            readonly ui: "app";
            readonly views: readonly ["display.client"];
            readonly refused: {
                readonly displayId: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly node: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly project_id: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly container_id: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly url_display_id: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly ssl: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly webtransport: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly path: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly action: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly display: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly keyboard_layout: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly clipboard_poll: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly open_url: {
                    readonly class: "dead";
                    readonly reasonCode: "not-supported";
                };
                readonly notification_server_url: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly sharing: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly steal: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly app: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly remote_logging: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly insecure: {
                    readonly class: "excluded";
                    readonly reasonCode: "auth";
                };
                readonly debug_main: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_keyboard: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_geometry: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_mouse: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_clipboard: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_draw: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_audio: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_network: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly debug_file: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "Web viewer for one remote display.";
            readonly defaultView: "display.client";
        };
        readonly browser: {
            readonly ui: "app";
            readonly views: readonly ["browser.status", "browser.display"];
            readonly refused: {
                readonly display: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
            };
            readonly publicDescription: "Status page of the headless or headful browser service, and a full-page view of its display.";
            readonly defaultView: "browser.status";
        };
        readonly code: {
            readonly ui: "app";
            readonly views: readonly ["code.root", "code.editor", "code.extension"];
            readonly refused: {
                readonly id: {
                    readonly class: "forced";
                    readonly reasonCode: "forced";
                    readonly replacement: "serviceIndex";
                };
                readonly restart: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly "welcome-iframe-url": {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly "page-loader-path": {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly "proxy-domain": {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly "app-name": {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "A VS Code editor in the browser, opened on a folder of the container, optionally focused on a single extension.";
            readonly defaultView: "code.editor";
        };
        readonly files: {
            readonly ui: "app";
            readonly views: readonly ["files.root", "files.folder", "files.editor", "files.search"];
            readonly refused: {
                readonly json: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly simple: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly hash: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly sha256: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly base64: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly view: {
                    readonly class: "excluded";
                    readonly reasonCode: "not-read-only";
                };
                readonly download: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly "content-type": {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly history: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly at: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly revision: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly diff: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly from_seq: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly from_ts: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly to_seq: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly to_ts: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly after_id: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly limit: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
            };
            readonly publicDescription: "A file manager for the container: folder listings, search, a code editor and a read-only viewer.";
            readonly defaultView: "files.folder";
        };
        readonly notes: {
            readonly ui: "app";
            readonly views: readonly ["notes.home", "notes.create", "notes.notebook", "notes.notebookHome", "notes.node", "notes.modal", "notes.alias", "notes.files", "notes.uploads", "notes.downloads", "notes.users", "notes.settings", "notes.account"];
            readonly refused: {
                readonly widgetId: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "Hoody Notes: notebooks, pages and databases in the browser. Whether a framed Notes page shares its local cache with Notes open in a tab depends on the browser: a frame embedded by another site usually gets separate storage. Separate caches exchange changes, offline edits included, once they sync with the server. Offline edits survive a reload only when the browser gives Notes persistent storage; where it does not, Notes runs from memory and unsynced edits are lost on reload.";
            readonly defaultView: "notes.home";
        };
        readonly sqlite: {
            readonly ui: "app";
            readonly views: readonly ["sqlite.overview", "sqlite.tables", "sqlite.query", "sqlite.kvStore", "sqlite.history", "sqlite.pragmas"];
            readonly refused: {
                readonly sql: {
                    readonly class: "dead";
                    readonly reasonCode: "not-supported";
                };
            };
            readonly publicDescription: "Hoody SQLite studio: browse tables, run queries and manage key-value data.";
            readonly defaultView: "sqlite.overview";
        };
        readonly notifications: {
            readonly ui: "app";
            readonly views: readonly ["notifications.landing"];
            readonly refused: {};
            readonly publicDescription: "Notification landing page: recent notifications and a live feed from all displays, plus a test sender for one display.";
            readonly defaultView: "notifications.landing";
        };
        readonly pipe: {
            readonly ui: "app";
            readonly views: readonly ["pipe.send", "pipe.noscript", "pipe.progress", "pipe.video", "pipe.share", "pipe.receive"];
            readonly refused: {
                readonly download: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly autostart: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
                readonly status: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly transfer: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly ws: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "Browser pages for streaming data through a named pipe path: send files or text, receive downloads, share a screen, camera or microphone, watch video, and follow a transfer's progress.";
            readonly defaultView: "pipe.send";
        };
        readonly cron: {
            readonly ui: "app";
            readonly views: readonly ["cron.manager"];
            readonly refused: {};
            readonly publicDescription: "Cron manager: browse and edit the crontab entries of each user.";
            readonly defaultView: "cron.manager";
        };
        readonly bot: {
            readonly ui: "app";
            readonly views: readonly ["bot.index", "bot.detail", "bot.confirmDelete"];
            readonly refused: {};
            readonly publicDescription: "Management pages for chat-channel bot registrations.";
            readonly defaultView: "bot.index";
        };
        readonly run: {
            readonly ui: "app";
            readonly views: readonly ["run.results"];
            readonly refused: {
                readonly pick: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly pick_index: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly candidate_id: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly set_id: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly terminal_id: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly display: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly dry_run: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly print_curl: {
                    readonly class: "nonUi";
                    readonly reasonCode: "non-ui";
                };
                readonly origin: {
                    readonly class: "excluded";
                    readonly reasonCode: "mutating";
                };
            };
            readonly publicDescription: "A results page that lists the applications matching a name, with their versions and sources.";
            readonly defaultView: "run.results";
        };
        readonly daemon: {
            readonly ui: "none";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "Program and process manager API; it has no browser page.";
        };
        readonly watch: {
            readonly ui: "info";
            readonly views: readonly ["watch.index"];
            readonly refused: {};
            readonly publicDescription: "A short information page about the watch service.";
            readonly defaultView: "watch.index";
        };
        readonly exec: {
            readonly ui: "user-content";
            readonly views: readonly ["exec.script"];
            readonly refused: {};
            readonly publicDescription: "Pages served by your own scripts. The address runs the script mapped to the path, and the script decides what is returned.";
            readonly defaultView: "exec.script";
        };
        readonly http: {
            readonly ui: "user-content";
            readonly views: readonly ["http.content"];
            readonly refused: {};
            readonly publicDescription: "Whatever the application listening on the chosen port serves.";
            readonly defaultView: "http.content";
        };
        readonly https: {
            readonly ui: "user-content";
            readonly views: readonly ["https.content"];
            readonly refused: {};
            readonly publicDescription: "Whatever the application listening on the chosen port serves.";
            readonly defaultView: "https.content";
        };
        readonly "d-tcp": {
            readonly ui: "excluded";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "Connection endpoint used by the display viewer; open the display service instead.";
        };
        readonly cdp: {
            readonly ui: "excluded";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "Developer-tools protocol endpoint for automation clients; not an embeddable page.";
        };
        readonly curl: {
            readonly ui: "none";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "HTTP request service; it has no browser page.";
        };
        readonly logs: {
            readonly ui: "none";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "Proxy request log API; it has no browser page.";
        };
        readonly tunnel: {
            readonly ui: "none";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "Reverse tunnel service; it has no browser page.";
        };
        readonly ssh: {
            readonly ui: "none";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "SSH endpoint; it has no browser page of its own.";
        };
        readonly egress: {
            readonly ui: "none";
            readonly views: readonly [];
            readonly refused: {};
            readonly publicDescription: "Egress proxy endpoint; it has no browser page.";
        };
    };
    readonly views: {
        readonly "terminal.session": {
            readonly kit: "terminal";
            readonly view: "session";
            readonly service: "terminal";
            readonly program: "terminal";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Terminal session";
            readonly publicDescription: "A browser terminal attached to one session. Opening it starts a shell if the session is not running; a terminal that belongs to a daemon program attaches to that program instead and never starts a shell.";
            readonly path: "/";
            readonly params: {
                readonly cwd: {
                    readonly wire: "cwd";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Starting directory for a new session. The directory must already exist.";
                };
                readonly readonly: {
                    readonly wire: "readonly";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Open the session read-only: output is shown, keyboard input is blocked.";
                };
                readonly title: {
                    readonly wire: "title";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 200;
                    readonly publicDescription: "Browser tab title. HTML tags are removed.";
                };
                readonly fontSize: {
                    readonly wire: "fontSize";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 8;
                    readonly max: 72;
                    readonly publicDescription: "Font size in pixels.";
                };
                readonly backgroundColor: {
                    readonly wire: "backgroundColor";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Background colour: a hex colour (#RGB, #RRGGBB, #RRGGBBAA) or a CSS colour name.";
                };
                readonly panel: {
                    readonly wire: "panel";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "An http(s) URL to show in a side panel next to the terminal.";
                };
                readonly "panel-visible": {
                    readonly wire: "panel-visible";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show the side panel on load.";
                };
                readonly "panel-position": {
                    readonly wire: "panel-position";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["left", "right", "top", "bottom"];
                    readonly publicDescription: "Where the side panel sits.";
                };
                readonly "panel-width": {
                    readonly wire: "panel-width";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Initial side-panel width, in pixels (400px) or percent, for a left or right panel.";
                };
                readonly "panel-height": {
                    readonly wire: "panel-height";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Initial side-panel height, in pixels (300px) or percent, for a top or bottom panel.";
                };
                readonly "panel-resizable": {
                    readonly wire: "panel-resizable";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Allow resizing the side panel by dragging.";
                };
                readonly "panel-width-pct": {
                    readonly wire: "panel-width-pct";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 5;
                    readonly max: 95;
                    readonly publicDescription: "Initial side-panel width as a percentage of the window. Takes precedence over panel-width.";
                };
                readonly "panel-height-pct": {
                    readonly wire: "panel-height-pct";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 5;
                    readonly max: 95;
                    readonly publicDescription: "Initial side-panel height as a percentage of the window. Takes precedence over panel-height.";
                };
                readonly "hide-toolbar": {
                    readonly wire: "hide-toolbar";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the terminal toolbar.";
                };
                readonly fontFamily: {
                    readonly wire: "fontFamily";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "CSS font-family list for terminal text.";
                };
                readonly fontWeight: {
                    readonly wire: "fontWeight";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
                    readonly publicDescription: "Font weight for normal text.";
                };
                readonly fontWeightBold: {
                    readonly wire: "fontWeightBold";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
                    readonly publicDescription: "Font weight for bold text.";
                };
                readonly lineHeight: {
                    readonly wire: "lineHeight";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Line height as a multiple of the font size.";
                };
                readonly letterSpacing: {
                    readonly wire: "letterSpacing";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly publicDescription: "Extra spacing between characters, in whole pixels.";
                };
                readonly cursorBlink: {
                    readonly wire: "cursorBlink";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Make the cursor blink.";
                };
                readonly cursorStyle: {
                    readonly wire: "cursorStyle";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["block", "underline", "bar"];
                    readonly publicDescription: "Cursor shape when the terminal has focus.";
                };
                readonly cursorWidth: {
                    readonly wire: "cursorWidth";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Cursor width in pixels when the cursor style is bar.";
                };
                readonly cursorInactiveStyle: {
                    readonly wire: "cursorInactiveStyle";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["outline", "block", "bar", "underline", "none"];
                    readonly publicDescription: "Cursor shape when the terminal does not have focus.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly serialize: "json";
                    readonly publicDescription: "Colour theme as a JSON object (foreground, background, cursor, and the 16 ANSI colours).";
                };
                readonly minimumContrastRatio: {
                    readonly wire: "minimumContrastRatio";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 21;
                    readonly publicDescription: "Minimum contrast ratio between text and background; colours are adjusted to meet it.";
                };
                readonly drawBoldTextInBrightColors: {
                    readonly wire: "drawBoldTextInBrightColors";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Draw bold text in the bright colour variants.";
                };
                readonly scrollback: {
                    readonly wire: "scrollback";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 0;
                    readonly max: 100000;
                    readonly publicDescription: "Number of lines kept above the visible screen.";
                };
                readonly scrollSensitivity: {
                    readonly wire: "scrollSensitivity";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Scroll speed multiplier.";
                };
                readonly fastScrollSensitivity: {
                    readonly wire: "fastScrollSensitivity";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Scroll speed multiplier while Alt is held.";
                };
                readonly smoothScrollDuration: {
                    readonly wire: "smoothScrollDuration";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 0;
                    readonly publicDescription: "Smooth-scroll duration in milliseconds; 0 scrolls instantly.";
                };
                readonly screenReaderMode: {
                    readonly wire: "screenReaderMode";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Enable screen-reader support.";
                };
                readonly disableResizeOverlay: {
                    readonly wire: "disableResizeOverlay";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Do not show the size overlay while the window is resized.";
                };
                readonly unicodeVersion: {
                    readonly wire: "unicodeVersion";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["graphemes", "11"];
                    readonly publicDescription: "Character-width rules: graphemes (default, emoji-aware) or 11.";
                };
                readonly rendererType: {
                    readonly wire: "rendererType";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["dom", "canvas", "webgl"];
                    readonly publicDescription: "Renderer used to draw the terminal: webgl (the default; Firefox uses dom), dom, or canvas (drawn with WebGL). Phones, tablets and other touch-screen devices use dom even when webgl or canvas is asked for. Try dom if text renders wrongly with WebGL on a particular browser or GPU.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "desktop.session": {
            readonly kit: "desktop";
            readonly view: "session";
            readonly service: "desktop";
            readonly program: "desktop";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Desktop";
            readonly publicDescription: "A full graphical desktop. Opening it starts the desktop if needed, then shows it once it is ready.";
            readonly path: "/";
            readonly params: {
                readonly desktop_env: {
                    readonly wire: "desktop_env";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["xfce", "mate"];
                    readonly publicDescription: "Desktop environment to start.";
                };
                readonly redirect_delay: {
                    readonly wire: "redirect_delay";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 0;
                    readonly max: 30;
                    readonly publicDescription: "Extra seconds to wait after the desktop is ready before it opens.";
                };
                readonly wait_timeout: {
                    readonly wire: "wait_timeout";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 300;
                    readonly publicDescription: "Seconds to wait for the desktop to become ready.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: false;
            readonly forwardsQuery: false;
        };
        readonly "agent.webui": {
            readonly kit: "agent";
            readonly view: "webui";
            readonly service: "agent";
            readonly program: "agent";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Agent";
            readonly publicDescription: "The agent's interactive interface in a browser terminal. Opening it starts the agent if it is not running.";
            readonly path: "/";
            readonly params: {
                readonly title: {
                    readonly wire: "title";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 200;
                    readonly publicDescription: "Browser tab title. HTML tags are removed.";
                };
                readonly fontSize: {
                    readonly wire: "fontSize";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 8;
                    readonly max: 72;
                    readonly publicDescription: "Font size in pixels.";
                };
                readonly backgroundColor: {
                    readonly wire: "backgroundColor";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Background colour: a hex colour (#RGB, #RRGGBB, #RRGGBBAA) or a CSS colour name.";
                };
                readonly panel: {
                    readonly wire: "panel";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "An http(s) URL to show in a side panel next to the terminal.";
                };
                readonly "panel-visible": {
                    readonly wire: "panel-visible";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show the side panel on load.";
                };
                readonly "panel-position": {
                    readonly wire: "panel-position";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["left", "right", "top", "bottom"];
                    readonly publicDescription: "Where the side panel sits.";
                };
                readonly "panel-width": {
                    readonly wire: "panel-width";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Initial side-panel width, in pixels (400px) or percent, for a left or right panel.";
                };
                readonly "panel-height": {
                    readonly wire: "panel-height";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Initial side-panel height, in pixels (300px) or percent, for a top or bottom panel.";
                };
                readonly "panel-resizable": {
                    readonly wire: "panel-resizable";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Allow resizing the side panel by dragging.";
                };
                readonly "panel-width-pct": {
                    readonly wire: "panel-width-pct";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 5;
                    readonly max: 95;
                    readonly publicDescription: "Initial side-panel width as a percentage of the window. Takes precedence over panel-width.";
                };
                readonly "panel-height-pct": {
                    readonly wire: "panel-height-pct";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 5;
                    readonly max: 95;
                    readonly publicDescription: "Initial side-panel height as a percentage of the window. Takes precedence over panel-height.";
                };
                readonly fontFamily: {
                    readonly wire: "fontFamily";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "CSS font-family list for terminal text.";
                };
                readonly fontWeight: {
                    readonly wire: "fontWeight";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
                    readonly publicDescription: "Font weight for normal text.";
                };
                readonly fontWeightBold: {
                    readonly wire: "fontWeightBold";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
                    readonly publicDescription: "Font weight for bold text.";
                };
                readonly lineHeight: {
                    readonly wire: "lineHeight";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Line height as a multiple of the font size.";
                };
                readonly letterSpacing: {
                    readonly wire: "letterSpacing";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly publicDescription: "Extra spacing between characters, in whole pixels.";
                };
                readonly cursorBlink: {
                    readonly wire: "cursorBlink";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Make the cursor blink.";
                };
                readonly cursorStyle: {
                    readonly wire: "cursorStyle";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["block", "underline", "bar"];
                    readonly publicDescription: "Cursor shape when the terminal has focus.";
                };
                readonly cursorWidth: {
                    readonly wire: "cursorWidth";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Cursor width in pixels when the cursor style is bar.";
                };
                readonly cursorInactiveStyle: {
                    readonly wire: "cursorInactiveStyle";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["outline", "block", "bar", "underline", "none"];
                    readonly publicDescription: "Cursor shape when the terminal does not have focus.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly serialize: "json";
                    readonly publicDescription: "Colour theme as a JSON object (foreground, background, cursor, and the 16 ANSI colours).";
                };
                readonly minimumContrastRatio: {
                    readonly wire: "minimumContrastRatio";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 21;
                    readonly publicDescription: "Minimum contrast ratio between text and background; colours are adjusted to meet it.";
                };
                readonly drawBoldTextInBrightColors: {
                    readonly wire: "drawBoldTextInBrightColors";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Draw bold text in the bright colour variants.";
                };
                readonly scrollback: {
                    readonly wire: "scrollback";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 0;
                    readonly max: 100000;
                    readonly publicDescription: "Number of lines kept above the visible screen.";
                };
                readonly scrollSensitivity: {
                    readonly wire: "scrollSensitivity";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Scroll speed multiplier.";
                };
                readonly fastScrollSensitivity: {
                    readonly wire: "fastScrollSensitivity";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly publicDescription: "Scroll speed multiplier while Alt is held.";
                };
                readonly smoothScrollDuration: {
                    readonly wire: "smoothScrollDuration";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 0;
                    readonly publicDescription: "Smooth-scroll duration in milliseconds; 0 scrolls instantly.";
                };
                readonly screenReaderMode: {
                    readonly wire: "screenReaderMode";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Enable screen-reader support.";
                };
                readonly disableResizeOverlay: {
                    readonly wire: "disableResizeOverlay";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Do not show the size overlay while the window is resized.";
                };
                readonly unicodeVersion: {
                    readonly wire: "unicodeVersion";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["graphemes", "11"];
                    readonly publicDescription: "Character-width rules: graphemes (default, emoji-aware) or 11.";
                };
                readonly rendererType: {
                    readonly wire: "rendererType";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["dom", "canvas", "webgl"];
                    readonly publicDescription: "Renderer used to draw the terminal: webgl (the default; Firefox uses dom), dom, or canvas (drawn with WebGL). Phones, tablets and other touch-screen devices use dom even when webgl or canvas is asked for. Try dom if text renders wrongly with WebGL on a particular browser or GPU.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "display.client": {
            readonly kit: "display";
            readonly view: "client";
            readonly service: "display";
            readonly program: "display";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Display";
            readonly publicDescription: "Opens the display in the web viewer.";
            readonly path: "/";
            readonly params: {
                readonly decorations: {
                    readonly wire: "decorations";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show window title bars and buttons. Set false for a frameless look.";
                };
                readonly toolbar: {
                    readonly wire: "toolbar";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show the toolbar. false hides it, exactly as menu=false does.";
                };
                readonly menu: {
                    readonly wire: "menu";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show the menu button. false hides it, exactly as toolbar=false does.";
                };
                readonly maximize_new_windows: {
                    readonly wire: "maximize_new_windows";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Open new application windows maximized. Takes effect only on a desktop of at least 1024x1024; on a smaller desktop new windows already fill the screen.";
                };
                readonly readonly: {
                    readonly wire: "readonly";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "View-only mode: keyboard and mouse input is not sent.";
                };
                readonly dark_mode: {
                    readonly wire: "dark_mode";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Use the dark colour scheme.";
                };
                readonly encoding: {
                    readonly wire: "encoding";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly enum: readonly ["auto", "webp", "jpeg", "png", "rgb"];
                    readonly publicDescription: "Pre-selects the encoding in the settings dialog; does not change the stream encoding.";
                };
                readonly offscreen: {
                    readonly wire: "offscreen";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Render with an offscreen canvas.";
                };
                readonly bandwidth_limit: {
                    readonly wire: "bandwidth_limit";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "passthrough";
                    readonly min: 0;
                    readonly publicDescription: "Bandwidth limit for this viewer in bits per second; 0 means unlimited.";
                };
                readonly override_width: {
                    readonly wire: "override_width";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly publicDescription: "Requested desktop width: auto or a number.";
                };
                readonly override_height: {
                    readonly wire: "override_height";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly publicDescription: "Requested desktop height: auto or a number.";
                };
                readonly vrefresh: {
                    readonly wire: "vrefresh";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "passthrough";
                    readonly publicDescription: "Refresh rate in Hz; -1 picks it automatically.";
                };
                readonly suspend_inactive_tab: {
                    readonly wire: "suspend_inactive_tab";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Pause updates while the browser tab is hidden.";
                };
                readonly sound: {
                    readonly wire: "sound";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Play the session's audio in the viewer.";
                };
                readonly audio_codec: {
                    readonly wire: "audio_codec";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly publicDescription: "Preferred audio codec.";
                };
                readonly keyboard: {
                    readonly wire: "keyboard";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Show the on-screen keyboard.";
                };
                readonly swap_keys: {
                    readonly wire: "swap_keys";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Swap the Cmd and Ctrl keys.";
                };
                readonly clipboard: {
                    readonly wire: "clipboard";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly enum: readonly [false];
                    readonly publicDescription: "Set false to turn clipboard sharing off for this viewer.";
                };
                readonly clipboard_preferred_format: {
                    readonly wire: "clipboard_preferred_format";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly enum: readonly ["text/plain", "text/html", "UTF8_STRING"];
                    readonly publicDescription: "Preferred clipboard format.";
                };
                readonly printing: {
                    readonly wire: "printing";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly enum: readonly [false];
                    readonly publicDescription: "Set false to turn print forwarding off.";
                };
                readonly file_transfer: {
                    readonly wire: "file_transfer";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly enum: readonly [false];
                    readonly publicDescription: "Set false to turn file transfer off.";
                };
                readonly video: {
                    readonly wire: "video";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Allow video encodings.";
                };
                readonly mediasource_video: {
                    readonly wire: "mediasource_video";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Allow MediaSource video decoding.";
                };
                readonly web_notifications: {
                    readonly wire: "web_notifications";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Pre-set the browser-notifications option in the connection dialog.";
                };
                readonly display_notifications: {
                    readonly wire: "display_notifications";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Show notifications inside the display view.";
                };
                readonly notification_connection_type: {
                    readonly wire: "notification_connection_type";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly enum: readonly ["websocket", "polling"];
                    readonly publicDescription: "Pre-set the notification connection type in the connection dialog.";
                };
                readonly reconnect: {
                    readonly wire: "reconnect";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Reconnect automatically after a lost connection.";
                };
                readonly floating_menu: {
                    readonly wire: "floating_menu";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Show the floating menu.";
                };
                readonly clock: {
                    readonly wire: "clock";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Show the server clock.";
                };
                readonly scroll_reverse_y: {
                    readonly wire: "scroll_reverse_y";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "passthrough";
                    readonly enum: readonly ["auto", "true", "false"];
                    readonly publicDescription: "Reverse vertical scrolling: auto, true or false.";
                };
                readonly scroll_reverse_x: {
                    readonly wire: "scroll_reverse_x";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "passthrough";
                    readonly publicDescription: "Reverse horizontal scrolling.";
                };
                readonly title_show_hoody: {
                    readonly wire: "title_show_hoody";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show Hoody in the page title.";
                };
                readonly title_show_display_id: {
                    readonly wire: "title_show_display_id";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show the display number in the page title.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "browser.status": {
            readonly kit: "browser";
            readonly view: "status";
            readonly service: "browser";
            readonly program: "browser";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Status";
            readonly publicDescription: "Lists the running browser instances with links to their display and developer tools.";
            readonly path: "/";
            readonly params: {
                readonly maximize_new_windows: {
                    readonly wire: "maximize_new_windows";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Open new browser windows maximized in the display. On by default.";
                };
            };
            readonly required: readonly [];
            readonly const: {
                readonly start: false;
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "browser.display": {
            readonly kit: "browser";
            readonly view: "display";
            readonly service: "browser";
            readonly program: "browser";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Display";
            readonly publicDescription: "Shows the browser's display full-page.";
            readonly path: "/";
            readonly params: {
                readonly maximize_new_windows: {
                    readonly wire: "maximize_new_windows";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Open new browser windows maximized in the display. On by default.";
                };
                readonly iframe_url: {
                    readonly wire: "iframe_url";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "Web address shown in the full-page frame instead of the browser's own display. Must start with http:// or https://.";
                };
            };
            readonly required: readonly [];
            readonly const: {
                readonly view: "display";
                readonly start: false;
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "code.root": {
            readonly kit: "code";
            readonly view: "root";
            readonly service: "code";
            readonly program: "code";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Editor (default folder)";
            readonly publicDescription: "The editor opened on the default workspace folder the platform sets. Opening it starts the editor instance when it is not running yet.";
            readonly path: "/api/v1/code";
            readonly params: {
                readonly locale: {
                    readonly wire: "locale";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[a-z]{2}(-[A-Z]{2})?$";
                    readonly publicDescription: "Display language of the editor, as a language tag such as en or pt-BR. Applies when the instance starts.";
                };
                readonly "page-loader": {
                    readonly wire: "page-loader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show a loading overlay while a newly started editor initialises. Applies when the instance starts.";
                };
                readonly "disable-walkthroughs": {
                    readonly wire: "disable-walkthroughs";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the editor's walkthrough pages. Applies when the instance starts.";
                };
                readonly "hoody-code": {
                    readonly wire: "hoody-code";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Load the Hoody page integration scripts, such as tab-title sync. Applies when the instance starts.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "code.editor": {
            readonly kit: "code";
            readonly view: "editor";
            readonly service: "code";
            readonly program: "code";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Editor";
            readonly publicDescription: "The editor opened on a folder. Opening it starts the editor instance when it is not running yet.";
            readonly path: "/api/v1/code";
            readonly params: {
                readonly folder: {
                    readonly wire: "folder";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^/";
                    readonly publicDescription: "Absolute path of the folder to open. It applies when the editor instance starts; a running instance keeps the folder it was started with.";
                };
                readonly locale: {
                    readonly wire: "locale";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[a-z]{2}(-[A-Z]{2})?$";
                    readonly publicDescription: "Display language of the editor, as a language tag such as en or pt-BR. Applies when the instance starts.";
                };
                readonly "page-loader": {
                    readonly wire: "page-loader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show a loading overlay while a newly started editor initialises. Applies when the instance starts.";
                };
                readonly "disable-walkthroughs": {
                    readonly wire: "disable-walkthroughs";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the editor's walkthrough pages. Applies when the instance starts.";
                };
                readonly "hoody-code": {
                    readonly wire: "hoody-code";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Load the Hoody page integration scripts, such as tab-title sync. Applies when the instance starts.";
                };
            };
            readonly required: readonly ["folder"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "code.extension": {
            readonly kit: "code";
            readonly view: "extension";
            readonly service: "code";
            readonly program: "code";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Extension";
            readonly publicDescription: "The editor in extension-only mode: only the chosen extension's view is shown. Opening it starts the editor instance when it is not running yet.";
            readonly path: "/api/v1/code";
            readonly params: {
                readonly folder: {
                    readonly wire: "folder";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^/";
                    readonly publicDescription: "Absolute path of the folder to open. It applies when the editor instance starts; a running instance keeps the folder it was started with.";
                };
                readonly extension: {
                    readonly wire: "extension";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[a-zA-Z0-9-]+\\.[a-zA-Z0-9-]+$";
                    readonly publicDescription: "Extension identifier in PUBLISHER.NAME form. Opens the editor in extension-only mode, showing only that extension's view.";
                };
                readonly locale: {
                    readonly wire: "locale";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[a-z]{2}(-[A-Z]{2})?$";
                    readonly publicDescription: "Display language of the editor, as a language tag such as en or pt-BR. Applies when the instance starts.";
                };
                readonly "page-loader": {
                    readonly wire: "page-loader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Show a loading overlay while a newly started editor initialises. Applies when the instance starts.";
                };
                readonly "disable-walkthroughs": {
                    readonly wire: "disable-walkthroughs";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the editor's walkthrough pages. Applies when the instance starts.";
                };
                readonly "hoody-code": {
                    readonly wire: "hoody-code";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Load the Hoody page integration scripts, such as tab-title sync. Applies when the instance starts.";
                };
            };
            readonly required: readonly ["extension"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "files.root": {
            readonly kit: "files";
            readonly view: "root";
            readonly service: "files";
            readonly program: "files";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Root folder";
            readonly publicDescription: "The listing of the container root folder, with upload, rename and delete controls for the user.";
            readonly path: "/";
            readonly params: {
                readonly sort: {
                    readonly wire: "sort";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["name", "mtime", "size"];
                    readonly publicDescription: "Sort the listing by name, modification time or size.";
                };
                readonly order: {
                    readonly wire: "order";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["asc", "desc"];
                    readonly publicDescription: "Sort direction. Only desc changes the order; asc is the default.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme of the page.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme. Without it the page follows the system setting.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "cascadia-code", "fira-code", "hack", "inconsolata", "intel-one-mono", "iosevka", "jetbrains-mono", "meslo-lgs", "roboto-mono", "source-code-pro", "ubuntu-mono"];
                    readonly publicDescription: "Monospace font of the editor and listing.";
                };
                readonly fontSize: {
                    readonly wire: "fontSize";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 8;
                    readonly max: 72;
                    readonly publicDescription: "Editor font size in pixels, 8 to 72.";
                };
                readonly embedderOrigin: {
                    readonly wire: "embedderOrigin";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready.";
                };
                readonly chromeless: {
                    readonly wire: "chromeless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false.";
                };
                readonly borderless: {
                    readonly wire: "borderless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the page borders.";
                };
                readonly hideHeader: {
                    readonly wire: "hideHeader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header bar.";
                };
                readonly hideSidebar: {
                    readonly wire: "hideSidebar";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the sidebar.";
                };
                readonly hidePreview: {
                    readonly wire: "hidePreview";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the preview pane.";
                };
                readonly hideFooter: {
                    readonly wire: "hideFooter";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the footer.";
                };
                readonly embedBg: {
                    readonly wire: "embedBg";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["transparent"];
                    readonly publicDescription: "Set to transparent to let the embedding page's background show through.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "files.folder": {
            readonly kit: "files";
            readonly view: "folder";
            readonly service: "files";
            readonly program: "files";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Folder";
            readonly publicDescription: "The listing of a folder, with upload, rename and delete controls for the user.";
            readonly path: "/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly encoder: "path-segments";
                    readonly publicDescription: "Absolute path inside the container, starting with /. Each segment is percent-encoded; the slashes between segments are kept.";
                };
                readonly sort: {
                    readonly wire: "sort";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["name", "mtime", "size"];
                    readonly publicDescription: "Sort the listing by name, modification time or size.";
                };
                readonly order: {
                    readonly wire: "order";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["asc", "desc"];
                    readonly publicDescription: "Sort direction. Only desc changes the order; asc is the default.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme of the page.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme. Without it the page follows the system setting.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "cascadia-code", "fira-code", "hack", "inconsolata", "intel-one-mono", "iosevka", "jetbrains-mono", "meslo-lgs", "roboto-mono", "source-code-pro", "ubuntu-mono"];
                    readonly publicDescription: "Monospace font of the editor and listing.";
                };
                readonly fontSize: {
                    readonly wire: "fontSize";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 8;
                    readonly max: 72;
                    readonly publicDescription: "Editor font size in pixels, 8 to 72.";
                };
                readonly embedderOrigin: {
                    readonly wire: "embedderOrigin";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready.";
                };
                readonly chromeless: {
                    readonly wire: "chromeless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false.";
                };
                readonly borderless: {
                    readonly wire: "borderless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the page borders.";
                };
                readonly hideHeader: {
                    readonly wire: "hideHeader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header bar.";
                };
                readonly hideSidebar: {
                    readonly wire: "hideSidebar";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the sidebar.";
                };
                readonly hidePreview: {
                    readonly wire: "hidePreview";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the preview pane.";
                };
                readonly hideFooter: {
                    readonly wire: "hideFooter";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the footer.";
                };
                readonly embedBg: {
                    readonly wire: "embedBg";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["transparent"];
                    readonly publicDescription: "Set to transparent to let the embedding page's background show through.";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "files.editor": {
            readonly kit: "files";
            readonly view: "editor";
            readonly service: "files";
            readonly program: "files";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Editor";
            readonly publicDescription: "A text file opened in the code editor. Changes are saved only when the user saves.";
            readonly path: "/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly encoder: "path-segments";
                    readonly publicDescription: "Absolute path inside the container, starting with /. Each segment is percent-encoded; the slashes between segments are kept.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme of the page.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme. Without it the page follows the system setting.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "cascadia-code", "fira-code", "hack", "inconsolata", "intel-one-mono", "iosevka", "jetbrains-mono", "meslo-lgs", "roboto-mono", "source-code-pro", "ubuntu-mono"];
                    readonly publicDescription: "Monospace font of the editor and listing.";
                };
                readonly fontSize: {
                    readonly wire: "fontSize";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 8;
                    readonly max: 72;
                    readonly publicDescription: "Editor font size in pixels, 8 to 72.";
                };
                readonly embedderOrigin: {
                    readonly wire: "embedderOrigin";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready.";
                };
                readonly chromeless: {
                    readonly wire: "chromeless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false.";
                };
                readonly borderless: {
                    readonly wire: "borderless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the page borders.";
                };
                readonly hideHeader: {
                    readonly wire: "hideHeader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header bar.";
                };
                readonly hideFooter: {
                    readonly wire: "hideFooter";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the footer.";
                };
                readonly embedBg: {
                    readonly wire: "embedBg";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["transparent"];
                    readonly publicDescription: "Set to transparent to let the embedding page's background show through.";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {};
            readonly flags: readonly ["edit"];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "files.search": {
            readonly kit: "files";
            readonly view: "search";
            readonly service: "files";
            readonly program: "files";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Search";
            readonly publicDescription: "Search results for a text inside a folder and its subfolders.";
            readonly path: "/{directory}";
            readonly params: {
                readonly directory: {
                    readonly wire: "directory";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly encoder: "path-segments";
                    readonly publicDescription: "Absolute path of the folder to search in, starting with /, encoded like path.";
                };
                readonly q: {
                    readonly wire: "q";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Search text. Lists the entries below the folder whose names match.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme of the page.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme. Without it the page follows the system setting.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "cascadia-code", "fira-code", "hack", "inconsolata", "intel-one-mono", "iosevka", "jetbrains-mono", "meslo-lgs", "roboto-mono", "source-code-pro", "ubuntu-mono"];
                    readonly publicDescription: "Monospace font of the editor and listing.";
                };
                readonly fontSize: {
                    readonly wire: "fontSize";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 8;
                    readonly max: 72;
                    readonly publicDescription: "Editor font size in pixels, 8 to 72.";
                };
                readonly embedderOrigin: {
                    readonly wire: "embedderOrigin";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^https?://";
                    readonly format: "uri";
                    readonly publicDescription: "Origin of the embedding page, such as https://app.example.com. The page then accepts theme and layout messages from it and tells it when it is ready.";
                };
                readonly chromeless: {
                    readonly wire: "chromeless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own option set to false.";
                };
                readonly borderless: {
                    readonly wire: "borderless";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the page borders.";
                };
                readonly hideHeader: {
                    readonly wire: "hideHeader";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the header bar.";
                };
                readonly hideSidebar: {
                    readonly wire: "hideSidebar";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the sidebar.";
                };
                readonly hidePreview: {
                    readonly wire: "hidePreview";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the preview pane.";
                };
                readonly hideFooter: {
                    readonly wire: "hideFooter";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Hide the footer.";
                };
                readonly embedBg: {
                    readonly wire: "embedBg";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["transparent"];
                    readonly publicDescription: "Set to transparent to let the embedding page's background show through.";
                };
            };
            readonly required: readonly ["directory", "q"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.home": {
            readonly kit: "notes";
            readonly view: "home";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Home";
            readonly publicDescription: "Opens the last used locally available notebook, or the first available one.";
            readonly path: "/";
            readonly params: {
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.create": {
            readonly kit: "notes";
            readonly view: "create";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Create notebook";
            readonly publicDescription: "Opens the form for creating a new notebook; only submitting the form creates one. Like any Notes page, the first visit may set up the default notebook and your user in it.";
            readonly path: "/create";
            readonly params: {
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.notebook": {
            readonly kit: "notes";
            readonly view: "notebook";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Notebook";
            readonly publicDescription: "Opens a notebook at its last visited location, or its home page.";
            readonly path: "/notebook/{userId}";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.notebookHome": {
            readonly kit: "notes";
            readonly view: "notebookHome";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Notebook home";
            readonly publicDescription: "Opens the home page of a notebook.";
            readonly path: "/notebook/{userId}/home";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.node": {
            readonly kit: "notes";
            readonly view: "node";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Page";
            readonly publicDescription: "Opens one page or node of a notebook.";
            readonly path: "/notebook/{userId}/{nodeId}";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly nodeId: {
                    readonly wire: "nodeId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Id of the page or node to open. New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId", "nodeId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.modal": {
            readonly kit: "notes";
            readonly view: "modal";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Page with modal";
            readonly publicDescription: "Opens a page with another node shown in a modal over it.";
            readonly path: "/notebook/{userId}/{nodeId}/modal/{modalNodeId}";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly nodeId: {
                    readonly wire: "nodeId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Id of the page or node to open. New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly modalNodeId: {
                    readonly wire: "modalNodeId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Id of the node shown in a modal over the page. New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId", "nodeId", "modalNodeId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.alias": {
            readonly kit: "notes";
            readonly view: "alias";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Page by alias";
            readonly publicDescription: "Opens the page that has the given alias, or the notebook home when none has it.";
            readonly path: "/notebook/{userId}/alias/{alias}";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly alias: {
                    readonly wire: "alias";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 48;
                    readonly pattern: "^[a-z0-9_-]{1,48}$";
                    readonly publicDescription: "Page alias (lowercase letters, digits, '_' and '-', up to 48 characters). Opens the page with that alias, or the notebook home when no page has it.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId", "alias"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.files": {
            readonly kit: "notes";
            readonly view: "files";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Files";
            readonly publicDescription: "Opens the file tree of a notebook.";
            readonly path: "/notebook/{userId}/files";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.uploads": {
            readonly kit: "notes";
            readonly view: "uploads";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Uploads";
            readonly publicDescription: "Opens the uploads list of a notebook.";
            readonly path: "/notebook/{userId}/uploads";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.downloads": {
            readonly kit: "notes";
            readonly view: "downloads";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Downloads";
            readonly publicDescription: "Opens the downloads list of a notebook.";
            readonly path: "/notebook/{userId}/downloads";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.users": {
            readonly kit: "notes";
            readonly view: "users";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Users";
            readonly publicDescription: "Opens the member list of a notebook.";
            readonly path: "/notebook/{userId}/users";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.settings": {
            readonly kit: "notes";
            readonly view: "settings";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Notebook settings";
            readonly publicDescription: "Opens the settings of a notebook.";
            readonly path: "/notebook/{userId}/settings";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notes.account": {
            readonly kit: "notes";
            readonly view: "account";
            readonly service: "notes";
            readonly program: "notes";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Account settings";
            readonly publicDescription: "Opens the account settings for a notebook's account. The display name and avatar choice are kept in this browser for the signed-in identity and do not sync to other browsers or to a frame with separate storage; the avatar image itself is uploaded to the server.";
            readonly path: "/notebook/{userId}/account";
            readonly params: {
                readonly userId: {
                    readonly wire: "userId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^[0-9a-z]{24,28}$";
                    readonly publicDescription: "Your own user id in the notebook to open, as the viewing identity knows it (not the notebook id, and not another member's user id: an id the viewer does not have opens Notes home instead). New ids are 24 lowercase hexadecimal characters; older ids may be up to 28 lowercase letters and digits.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["readonly", "readwrite"];
                    readonly publicDescription: "Share presentation. Either value hides the sidebar. readonly shows the notebook's content and management views as a viewer sees them; your own account settings and appearance preferences stay editable. readwrite keeps the editing controls your permissions allow, including section and channel role overrides. Neither changes permissions.";
                };
                readonly sidebar: {
                    readonly wire: "sidebar";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["hidden"];
                    readonly publicDescription: "Set to hidden to hide the notebook sidebar.";
                };
                readonly theme: {
                    readonly wire: "theme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["oc-1", "hc-black", "aura", "ayu", "carbonfox", "catppuccin", "dracula", "gruvbox", "monokai", "nightowl", "nord", "onedarkpro", "shadesofpurple", "solarized", "tokyonight", "vesper"];
                    readonly publicDescription: "Colour theme id.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark"];
                    readonly publicDescription: "Light or dark colour scheme, over the saved preference. A page set to light or dark in its own appearance keeps it.";
                };
                readonly font: {
                    readonly wire: "font";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["ibm-plex-mono", "jetbrains-mono", "fira-code", "cascadia-code", "hack", "source-code-pro", "inconsolata", "roboto-mono", "ubuntu-mono", "intel-one-mono", "meslo-lgs", "iosevka"];
                    readonly publicDescription: "Monospace font id.";
                };
            };
            readonly required: readonly ["userId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "sqlite.overview": {
            readonly kit: "sqlite";
            readonly view: "overview";
            readonly service: "sqlite";
            readonly program: "sqlite";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Overview";
            readonly publicDescription: "Opens the database overview.";
            readonly path: "/";
            readonly params: {
                readonly db: {
                    readonly wire: "db";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Path of the database file to open. A missing file is reported as an error, never created.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark", "system"];
                    readonly publicDescription: "Force the light or dark colour scheme, or follow the system.";
                };
                readonly embed: {
                    readonly wire: "embed";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Compact chrome for embedding: a thin navigation bar instead of the full header.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "sqlite.tables": {
            readonly kit: "sqlite";
            readonly view: "tables";
            readonly service: "sqlite";
            readonly program: "sqlite";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Tables";
            readonly publicDescription: "Opens the table browser, optionally with one table selected.";
            readonly path: "/tables";
            readonly params: {
                readonly table: {
                    readonly wire: "table";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Table to select. On the key-value view it names the key-value table (default kv_store).";
                };
                readonly db: {
                    readonly wire: "db";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Path of the database file to open. A missing file is reported as an error, never created.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark", "system"];
                    readonly publicDescription: "Force the light or dark colour scheme, or follow the system.";
                };
                readonly embed: {
                    readonly wire: "embed";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Compact chrome for embedding: a thin navigation bar instead of the full header.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "sqlite.query": {
            readonly kit: "sqlite";
            readonly view: "query";
            readonly service: "sqlite";
            readonly program: "sqlite";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Query editor";
            readonly publicDescription: "Opens the SQL query editor. Nothing runs until you run a query.";
            readonly path: "/query";
            readonly params: {
                readonly db: {
                    readonly wire: "db";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Path of the database file to open. A missing file is reported as an error, never created.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark", "system"];
                    readonly publicDescription: "Force the light or dark colour scheme, or follow the system.";
                };
                readonly embed: {
                    readonly wire: "embed";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Compact chrome for embedding: a thin navigation bar instead of the full header.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "sqlite.kvStore": {
            readonly kit: "sqlite";
            readonly view: "kvStore";
            readonly service: "sqlite";
            readonly program: "sqlite";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Key-value store";
            readonly publicDescription: "Opens the key-value store browser.";
            readonly path: "/kv-store";
            readonly params: {
                readonly table: {
                    readonly wire: "table";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Table to select. On the key-value view it names the key-value table (default kv_store).";
                };
                readonly db: {
                    readonly wire: "db";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Path of the database file to open. A missing file is reported as an error, never created.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark", "system"];
                    readonly publicDescription: "Force the light or dark colour scheme, or follow the system.";
                };
                readonly embed: {
                    readonly wire: "embed";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Compact chrome for embedding: a thin navigation bar instead of the full header.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "sqlite.history": {
            readonly kit: "sqlite";
            readonly view: "history";
            readonly service: "sqlite";
            readonly program: "sqlite";
            readonly ui: "app";
            readonly default: false;
            readonly label: "History";
            readonly publicDescription: "Opens the query history.";
            readonly path: "/history";
            readonly params: {
                readonly db: {
                    readonly wire: "db";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Path of the database file to open. A missing file is reported as an error, never created.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark", "system"];
                    readonly publicDescription: "Force the light or dark colour scheme, or follow the system.";
                };
                readonly embed: {
                    readonly wire: "embed";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Compact chrome for embedding: a thin navigation bar instead of the full header.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "sqlite.pragmas": {
            readonly kit: "sqlite";
            readonly view: "pragmas";
            readonly service: "sqlite";
            readonly program: "sqlite";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Pragmas";
            readonly publicDescription: "Opens the database pragma settings. Nothing changes until you save.";
            readonly path: "/pragmas";
            readonly params: {
                readonly db: {
                    readonly wire: "db";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Path of the database file to open. A missing file is reported as an error, never created.";
                };
                readonly colorScheme: {
                    readonly wire: "colorScheme";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["light", "dark", "system"];
                    readonly publicDescription: "Force the light or dark colour scheme, or follow the system.";
                };
                readonly embed: {
                    readonly wire: "embed";
                    readonly in: "query";
                    readonly type: "boolean";
                    readonly class: "typed";
                    readonly publicDescription: "Compact chrome for embedding: a thin navigation bar instead of the full header.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "notifications.landing": {
            readonly kit: "notifications";
            readonly view: "landing";
            readonly service: "n";
            readonly program: "notifications";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Notifications";
            readonly publicDescription: "Recent and live notifications from every display, with a button to send a test notification to one display.";
            readonly path: "/";
            readonly params: {
                readonly display: {
                    readonly wire: "display";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^\\d{1,5}$";
                    readonly publicDescription: "Display number to send the test notification to. Takes precedence over the display named by the host. The feed always shows every display.";
                };
                readonly displays: {
                    readonly wire: "displays";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly pattern: "^\\d{1,5}$";
                    readonly publicDescription: "Alternative name for display; read only when display is absent.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "selector";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
            readonly aliasSelector: "display";
        };
        readonly "pipe.send": {
            readonly kit: "pipe";
            readonly view: "send";
            readonly service: "pipe";
            readonly program: "pipe";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Send";
            readonly publicDescription: "The page for sending a file or text to a pipe path. Its fields can be pre-filled, except the file itself, which the user picks; nothing is sent until the user confirms.";
            readonly path: "/api/v1/pipe/";
            readonly params: {
                readonly name: {
                    readonly wire: "name";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 1023;
                    readonly pattern: "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly publicDescription: "Pipe name to pre-fill on the send page, without a leading slash. The values . and .. as a segment, control characters, backslashes and the reserved names help, noscript, health, metrics, favicon.ico and robots.txt are refused. Absent: the page picks a random name.";
                };
                readonly n: {
                    readonly wire: "n";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 256;
                    readonly publicDescription: "How many receivers the transfer waits for, from 1 to 256. It pre-fills the receivers field; nothing is sent or received until the user confirms on the page.";
                };
                readonly text: {
                    readonly wire: "text";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 100000;
                    readonly publicDescription: "Text to pre-fill on the send page; it selects text mode unless mode says otherwise.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["file", "text"];
                    readonly publicDescription: "Whether the form sends a file or typed text. Defaults to file, or on the send page to text when text is given.";
                };
                readonly filename: {
                    readonly wire: "filename";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 255;
                    readonly publicDescription: "A file name to pre-fill: on the send page the name given to a text or pasted send, on the receive page the download name.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "pipe.noscript": {
            readonly kit: "pipe";
            readonly view: "noscript";
            readonly service: "pipe";
            readonly program: "pipe";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Send without JavaScript";
            readonly publicDescription: "A plain HTML form for sending a file or text to a pipe path, for browsers without JavaScript.";
            readonly path: "/api/v1/pipe/noscript";
            readonly params: {
                readonly noscriptPath: {
                    readonly wire: "path";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 1024;
                    readonly pattern: "^(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:\\.|%2[Ee]){1,2}$)[a-zA-Z0-9._~:@!$&'()*+,;=%-]+$";
                    readonly publicDescription: "Pipe path to prefill in the form, without a leading slash. Letters, digits and the characters . _ ~ : @ ! $ & ' ( ) * + , ; = % - only. The values . and .., and the reserved names help, noscript, health, metrics, favicon.ico and robots.txt are refused.";
                };
                readonly mode: {
                    readonly wire: "mode";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["file", "text"];
                    readonly publicDescription: "Whether the form sends a file or typed text. Defaults to file, or on the send page to text when text is given.";
                };
                readonly wait: {
                    readonly wire: "wait";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 3600;
                    readonly publicDescription: "Seconds the page's own transfer waits for the other side, from 1 to 3600 (default 300): on the receive page how long the download waits for the sender, on the video player how long the player waits for the stream, on the send page without JavaScript how long the send waits for the receivers. It changes no other participant's wait.";
                };
                readonly sha256: {
                    readonly wire: "sha256";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["1"];
                    readonly publicDescription: "1 to have the kit compute a SHA-256 digest of the transfer the page starts: the receive page's download or the send of the page without JavaScript. Leave it out for none. The page without JavaScript shows the digest in its send result; the receive page shows none (the digest goes to the sender's status).";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "pipe.progress": {
            readonly kit: "pipe";
            readonly view: "progress";
            readonly service: "pipe";
            readonly program: "pipe";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Progress";
            readonly publicDescription: "A live view of a transfer's progress on a pipe path. It only observes; it does not receive the data.";
            readonly path: "/api/v1/pipe/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 1023;
                    readonly pattern: "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly wirePattern: "^[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly encoder: "pipe-path";
                    readonly publicDescription: "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded.";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {
                readonly progress: "true";
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "pipe.video": {
            readonly kit: "pipe";
            readonly view: "video";
            readonly service: "pipe";
            readonly program: "pipe";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Video player";
            readonly publicDescription: "A video player for a video streamed to a pipe path. Opening it starts receiving: the player takes the stream as one of the transfer's receivers or, with live, joins a live stream from now on.";
            readonly path: "/api/v1/pipe/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 1023;
                    readonly pattern: "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly wirePattern: "^[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly encoder: "pipe-path";
                    readonly publicDescription: "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded.";
                };
                readonly live: {
                    readonly wire: "live";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["1"];
                    readonly publicDescription: "1 for a live stream. On the share page it pre-ticks Live: once the user starts, viewers join and leave at any time, and the receivers count is hidden and not used. On the video player the player joins a live stream from now on and keeps up with the newest data. Any n is then ignored.";
                };
                readonly wait: {
                    readonly wire: "wait";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 3600;
                    readonly publicDescription: "Seconds the page's own transfer waits for the other side, from 1 to 3600 (default 300): on the receive page how long the download waits for the sender, on the video player how long the player waits for the stream, on the send page without JavaScript how long the send waits for the receivers. It changes no other participant's wait.";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {
                readonly video: "true";
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: true;
            readonly forwardsQuery: true;
        };
        readonly "pipe.share": {
            readonly kit: "pipe";
            readonly view: "share";
            readonly service: "pipe";
            readonly program: "pipe";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Share screen, camera or audio";
            readonly publicDescription: "A page that streams the user's screen, camera or microphone live to a pipe path, for viewers on the video view. Capture starts only on the user's click. In an iframe, give the frame allow=\"display-capture; camera; microphone; autoplay\".";
            readonly path: "/api/v1/pipe/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 1023;
                    readonly pattern: "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly wirePattern: "^[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly encoder: "pipe-path";
                    readonly publicDescription: "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded.";
                };
                readonly source: {
                    readonly wire: "source";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["screen", "camera", "audio"];
                    readonly publicDescription: "What the share page captures: screen (default), camera or audio (microphone only).";
                };
                readonly audio: {
                    readonly wire: "audio";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["1", "0"];
                    readonly publicDescription: "1 to also capture audio when sharing a screen, 0 (default) for none.";
                };
                readonly surface: {
                    readonly wire: "surface";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["monitor", "window", "browser"];
                    readonly publicDescription: "Which kind of surface the browser's screen picker offers first: monitor, window or browser (tab). A hint; the user still picks.";
                };
                readonly quality: {
                    readonly wire: "quality";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["low", "medium", "high"];
                    readonly publicDescription: "Video quality of the share: low, medium (default) or high.";
                };
                readonly fps: {
                    readonly wire: "fps";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 60;
                    readonly publicDescription: "Frames per second of the share, from 1 to 60 (default 30).";
                };
                readonly n: {
                    readonly wire: "n";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 256;
                    readonly publicDescription: "How many receivers the transfer waits for, from 1 to 256. It pre-fills the receivers field; nothing is sent or received until the user confirms on the page.";
                };
                readonly live: {
                    readonly wire: "live";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["1"];
                    readonly publicDescription: "1 for a live stream. On the share page it pre-ticks Live: once the user starts, viewers join and leave at any time, and the receivers count is hidden and not used. On the video player the player joins a live stream from now on and keeps up with the newest data. Any n is then ignored.";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {
                readonly share: "true";
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "pipe.receive": {
            readonly kit: "pipe";
            readonly view: "receive";
            readonly service: "pipe";
            readonly program: "pipe";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Receive";
            readonly publicDescription: "A page for receiving what is sent to a pipe path as a download. It shows the transfer state and starts the download only on the user's click.";
            readonly path: "/api/v1/pipe/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 1023;
                    readonly pattern: "^(?!/)(?!api/v1/pipe(?:/|$))(?!(?:[Hh][Ee][Ll][Pp]|[Nn][Oo][Ss][Cc][Rr][Ii][Pp][Tt]|[Hh][Ee][Aa][Ll][Tt][Hh]|[Mm][Ee][Tt][Rr][Ii][Cc][Ss]|[Ff][Aa][Vv][Ii][Cc][Oo][Nn]\\.[Ii][Cc][Oo]|[Rr][Oo][Bb][Oo][Tt][Ss]\\.[Tt][Xx][Tt])\\.?/?$)(?!(?:.*/)?\\.\\.?(?:/|$))[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly wirePattern: "^[^\\x00-\\x1F\\x7F\\\\]+$";
                    readonly encoder: "pipe-path";
                    readonly publicDescription: "The pipe path the sender uses, without a leading slash. Each segment is percent-encoded.";
                };
                readonly n: {
                    readonly wire: "n";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 256;
                    readonly publicDescription: "How many receivers the transfer waits for, from 1 to 256. It pre-fills the receivers field; nothing is sent or received until the user confirms on the page.";
                };
                readonly filename: {
                    readonly wire: "filename";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly maxLength: 255;
                    readonly publicDescription: "A file name to pre-fill: on the send page the name given to a text or pasted send, on the receive page the download name.";
                };
                readonly wait: {
                    readonly wire: "wait";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 3600;
                    readonly publicDescription: "Seconds the page's own transfer waits for the other side, from 1 to 3600 (default 300): on the receive page how long the download waits for the sender, on the video player how long the player waits for the stream, on the send page without JavaScript how long the send waits for the receivers. It changes no other participant's wait.";
                };
                readonly sha256: {
                    readonly wire: "sha256";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["1"];
                    readonly publicDescription: "1 to have the kit compute a SHA-256 digest of the transfer the page starts: the receive page's download or the send of the page without JavaScript. Leave it out for none. The page without JavaScript shows the digest in its send result; the receive page shows none (the digest goes to the sender's status).";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {
                readonly receive: "true";
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "cron.manager": {
            readonly kit: "cron";
            readonly view: "manager";
            readonly service: "cron";
            readonly program: "cron";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Cron manager";
            readonly publicDescription: "Lists users and their cron entries; changes are made only through the page controls.";
            readonly path: "/";
            readonly params: {};
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "supported";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "bot.index": {
            readonly kit: "bot";
            readonly view: "index";
            readonly service: "bot";
            readonly program: "bot";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Bot registrations";
            readonly publicDescription: "Lists every bot registration of the owner, with a form to register a new one.";
            readonly path: "/";
            readonly params: {};
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "bot.detail": {
            readonly kit: "bot";
            readonly view: "detail";
            readonly service: "bot";
            readonly program: "bot";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Registration";
            readonly publicDescription: "One bot registration with its state and its start and stop controls.";
            readonly path: "/api/v1/bot/ui/registrations/{registrationId}";
            readonly params: {
                readonly registrationId: {
                    readonly wire: "registrationId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Registration id, as returned when the bot was registered or listed.";
                };
            };
            readonly required: readonly ["registrationId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "bot.confirmDelete": {
            readonly kit: "bot";
            readonly view: "confirmDelete";
            readonly service: "bot";
            readonly program: "bot";
            readonly ui: "app";
            readonly default: false;
            readonly label: "Confirm deletion";
            readonly publicDescription: "Asks for confirmation before a registration is deleted. Opening this page deletes nothing.";
            readonly path: "/api/v1/bot/ui/registrations/{registrationId}/delete";
            readonly params: {
                readonly registrationId: {
                    readonly wire: "registrationId";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Registration id, as returned when the bot was registered or listed.";
                };
            };
            readonly required: readonly ["registrationId"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "run.results": {
            readonly kit: "run";
            readonly view: "results";
            readonly service: "run";
            readonly program: "run";
            readonly ui: "app";
            readonly default: true;
            readonly label: "Results";
            readonly publicDescription: "The list of applications matching a name. It only looks them up; nothing is installed or started.";
            readonly path: "/api/v1/run/resolve";
            readonly params: {
                readonly app: {
                    readonly wire: "app";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Name of the application to look up.";
                };
                readonly os: {
                    readonly wire: "os";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["linux", "windows", "any"];
                    readonly publicDescription: "Target operating system of the application.";
                };
                readonly source: {
                    readonly wire: "source";
                    readonly in: "query";
                    readonly type: "array";
                    readonly class: "typed";
                    readonly repeat: "ordered";
                    readonly publicDescription: "Package sources to search. Repeat the key for several sources.";
                };
                readonly kind: {
                    readonly wire: "kind";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["gui", "cli", "any"];
                    readonly publicDescription: "Graphical or terminal applications.";
                };
                readonly arch: {
                    readonly wire: "arch";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly enum: readonly ["amd64", "arm64", "any"];
                    readonly publicDescription: "Target CPU architecture.";
                };
                readonly profile: {
                    readonly wire: "profile";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Named preference profile to apply to this lookup.";
                };
                readonly version: {
                    readonly wire: "version";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Package version for pkgx candidates: the listed pkgx entry runs that version. It does not change which applications are listed.";
                };
                readonly repo: {
                    readonly wire: "repo";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Limits the GitHub-release applications to the configured repository with this name.";
                };
                readonly release: {
                    readonly wire: "release";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Release tag to use for GitHub-release applications.";
                };
                readonly asset: {
                    readonly wire: "asset";
                    readonly in: "query";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly publicDescription: "Asset-name filter for GitHub-release applications; with no matching asset the application is not listed.";
                };
                readonly limit: {
                    readonly wire: "limit";
                    readonly in: "query";
                    readonly type: "integer";
                    readonly class: "typed";
                    readonly min: 1;
                    readonly max: 100;
                    readonly publicDescription: "Maximum number of candidates, 1 to 100. The page lists at most 50.";
                };
            };
            readonly required: readonly ["app"];
            readonly const: {
                readonly format: "html";
            };
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "watch.index": {
            readonly kit: "watch";
            readonly view: "index";
            readonly service: "watch";
            readonly program: "watch";
            readonly ui: "info";
            readonly default: true;
            readonly label: "About";
            readonly publicDescription: "A static page describing the watch service and where its API starts.";
            readonly path: "/";
            readonly params: {};
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: false;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "exec.script": {
            readonly kit: "exec";
            readonly view: "script";
            readonly service: "exec";
            readonly program: "exec";
            readonly ui: "user-content";
            readonly default: true;
            readonly label: "Script page";
            readonly publicDescription: "The response of your script for the given path. Opening it runs the script; any query parameters are passed to it unchanged.";
            readonly path: "/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly encoder: "path-segments";
                    readonly publicDescription: "Path of the script route to open, without the leading slash. Each segment is percent-encoded; the slashes between segments are kept.";
                };
            };
            readonly required: readonly ["path"];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: true;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: true;
            readonly mutating: true;
            readonly forwardsQuery: true;
        };
        readonly "http.content": {
            readonly kit: "http";
            readonly view: "content";
            readonly service: "http";
            readonly program: "http";
            readonly ui: "user-content";
            readonly default: true;
            readonly label: "App content";
            readonly publicDescription: "A path of the application on this port, with any query the caller passes.";
            readonly path: "/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly encoder: "path-segments";
                    readonly publicDescription: "Path inside the application, encoded segment by segment.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: true;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
        readonly "https.content": {
            readonly kit: "https";
            readonly view: "content";
            readonly service: "https";
            readonly program: "https";
            readonly ui: "user-content";
            readonly default: true;
            readonly label: "App content";
            readonly publicDescription: "A path of the application on this port, with any query the caller passes.";
            readonly path: "/{path}";
            readonly params: {
                readonly path: {
                    readonly wire: "path";
                    readonly in: "path";
                    readonly type: "string";
                    readonly class: "typed";
                    readonly encoder: "path-segments";
                    readonly publicDescription: "Path inside the application, encoded segment by segment.";
                };
            };
            readonly required: readonly [];
            readonly const: {};
            readonly flags: readonly [];
            readonly freeQuery: true;
            readonly frameable: "yes";
            readonly alias: "refused";
            readonly spawns: false;
            readonly mutating: false;
            readonly forwardsQuery: true;
        };
    };
};
export type EmbedsCatalog = typeof EMBEDS_CATALOG;
/**
 * Typed wrappers, one function per view, over a build function supplied by the caller (the runtime).
 * Taking the function as an argument keeps this table free of imports.
 */
export declare function makeEmbedWrappers<TTarget>(build: (viewId: EmbedViewId, target: TTarget, opts: EmbedWrapperOptions<EmbedViewId>) => string): {
    terminal: {
        /** Terminal session. */
        session: (target: TTarget, opts?: EmbedWrapperOptions<"terminal.session">) => string;
    };
    desktop: {
        /** Desktop. */
        session: (target: TTarget, opts?: EmbedWrapperOptions<"desktop.session">) => string;
    };
    agent: {
        /** Agent. */
        webui: (target: TTarget, opts?: EmbedWrapperOptions<"agent.webui">) => string;
    };
    display: {
        /** Display. */
        client: (target: TTarget, opts?: EmbedWrapperOptions<"display.client">) => string;
    };
    browser: {
        /** Status. */
        status: (target: TTarget, opts?: EmbedWrapperOptions<"browser.status">) => string;
        /** Display. */
        display: (target: TTarget, opts?: EmbedWrapperOptions<"browser.display">) => string;
    };
    code: {
        /** Editor (default folder). */
        root: (target: TTarget, opts?: EmbedWrapperOptions<"code.root">) => string;
        /** Editor. */
        editor: (target: TTarget, opts: EmbedWrapperOptions<"code.editor">) => string;
        /** Extension. */
        extension: (target: TTarget, opts: EmbedWrapperOptions<"code.extension">) => string;
    };
    files: {
        /** Root folder. */
        root: (target: TTarget, opts?: EmbedWrapperOptions<"files.root">) => string;
        /** Folder. */
        folder: (target: TTarget, opts: EmbedWrapperOptions<"files.folder">) => string;
        /** Editor. */
        editor: (target: TTarget, opts: EmbedWrapperOptions<"files.editor">) => string;
        /** Search. */
        search: (target: TTarget, opts: EmbedWrapperOptions<"files.search">) => string;
    };
    notes: {
        /** Home. */
        home: (target: TTarget, opts?: EmbedWrapperOptions<"notes.home">) => string;
        /** Create notebook. */
        create: (target: TTarget, opts?: EmbedWrapperOptions<"notes.create">) => string;
        /** Notebook. */
        notebook: (target: TTarget, opts: EmbedWrapperOptions<"notes.notebook">) => string;
        /** Notebook home. */
        notebookHome: (target: TTarget, opts: EmbedWrapperOptions<"notes.notebookHome">) => string;
        /** Page. */
        node: (target: TTarget, opts: EmbedWrapperOptions<"notes.node">) => string;
        /** Page with modal. */
        modal: (target: TTarget, opts: EmbedWrapperOptions<"notes.modal">) => string;
        /** Page by alias. */
        alias: (target: TTarget, opts: EmbedWrapperOptions<"notes.alias">) => string;
        /** Files. */
        files: (target: TTarget, opts: EmbedWrapperOptions<"notes.files">) => string;
        /** Uploads. */
        uploads: (target: TTarget, opts: EmbedWrapperOptions<"notes.uploads">) => string;
        /** Downloads. */
        downloads: (target: TTarget, opts: EmbedWrapperOptions<"notes.downloads">) => string;
        /** Users. */
        users: (target: TTarget, opts: EmbedWrapperOptions<"notes.users">) => string;
        /** Notebook settings. */
        settings: (target: TTarget, opts: EmbedWrapperOptions<"notes.settings">) => string;
        /** Account settings. */
        account: (target: TTarget, opts: EmbedWrapperOptions<"notes.account">) => string;
    };
    sqlite: {
        /** Overview. */
        overview: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.overview">) => string;
        /** Tables. */
        tables: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.tables">) => string;
        /** Query editor. */
        query: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.query">) => string;
        /** Key-value store. */
        kvStore: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.kvStore">) => string;
        /** History. */
        history: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.history">) => string;
        /** Pragmas. */
        pragmas: (target: TTarget, opts?: EmbedWrapperOptions<"sqlite.pragmas">) => string;
    };
    notifications: {
        /** Notifications. */
        landing: (target: TTarget, opts?: EmbedWrapperOptions<"notifications.landing">) => string;
    };
    pipe: {
        /** Send. */
        send: (target: TTarget, opts?: EmbedWrapperOptions<"pipe.send">) => string;
        /** Send without JavaScript. */
        noscript: (target: TTarget, opts?: EmbedWrapperOptions<"pipe.noscript">) => string;
        /** Progress. */
        progress: (target: TTarget, opts: EmbedWrapperOptions<"pipe.progress">) => string;
        /** Video player. */
        video: (target: TTarget, opts: EmbedWrapperOptions<"pipe.video">) => string;
        /** Share screen, camera or audio. */
        share: (target: TTarget, opts: EmbedWrapperOptions<"pipe.share">) => string;
        /** Receive. */
        receive: (target: TTarget, opts: EmbedWrapperOptions<"pipe.receive">) => string;
    };
    cron: {
        /** Cron manager. */
        manager: (target: TTarget, opts?: EmbedWrapperOptions<"cron.manager">) => string;
    };
    bot: {
        /** Bot registrations. */
        index: (target: TTarget, opts?: EmbedWrapperOptions<"bot.index">) => string;
        /** Registration. */
        detail: (target: TTarget, opts: EmbedWrapperOptions<"bot.detail">) => string;
        /** Confirm deletion. */
        confirmDelete: (target: TTarget, opts: EmbedWrapperOptions<"bot.confirmDelete">) => string;
    };
    run: {
        /** Results. */
        results: (target: TTarget, opts: EmbedWrapperOptions<"run.results">) => string;
    };
    watch: {
        /** About. */
        index: (target: TTarget, opts?: EmbedWrapperOptions<"watch.index">) => string;
    };
    exec: {
        /** Script page. */
        script: (target: TTarget, opts: EmbedWrapperOptions<"exec.script">) => string;
    };
    http: {
        /** App content. */
        content: (target: TTarget, opts?: EmbedWrapperOptions<"http.content">) => string;
    };
    https: {
        /** App content. */
        content: (target: TTarget, opts?: EmbedWrapperOptions<"https.content">) => string;
    };
};
/** The object `makeEmbedWrappers` returns. */
export type EmbedWrappers<TTarget> = ReturnType<typeof makeEmbedWrappers<TTarget>>;
