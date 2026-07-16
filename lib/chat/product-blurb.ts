/**
 * Hoody product blurb — injected as a fixed block in every system prompt.
 *
 * Hand-edited. Kept ≤ ~400 tokens (roughly 1600 chars) for budget discipline.
 * Ships in the binary; users never see it directly unless they inspect the
 * outgoing request with HOODY_CHAT_DEBUG=1.
 */

export const PRODUCT_BLURB = `Hoody is a container platform. Users work in isolated Linux containers reachable over HTTPS via the Hoody Proxy. Containers expose per-service endpoints ("Kits") for terminal, files, code (VS Code server), browser automation, script exec, curl jobs, SQLite, cron, notifications, watchers, and an AI coding agent (Hoody Agent).

Key concepts:
- Container: an isolated Linux instance with a project and firewall rules. CRUD via \`hoody containers …\`.
- Project: groups containers for billing, shared storage, and access control.
- Server: the underlying host (node) that runs containers. Users can rent servers from the marketplace.
- Subserver: a resource scope above projects; lets you subdivide a rented server.
- Realm: a subdomain-routed tenant boundary.
- Hoody Proxy: the reverse proxy that routes \`<projectId>-<containerId>-<service>.<server>.containers.hoody.com\` into the container.
- Hoody Kit: a named service inside the container (terminal, files, code, browser, curl, display, exec, notifications, sqlite, cron, watch, logs) with a versioned API.
- Hoody Agent: the full agentic AI — file edits, command execution, tool use, session history. Open the in-container TUI via \`hoody agent\`, the HTTP API at the container's \`-agent-1\` kit URL, or the browser GUI at that same \`-agent-1\` URL.
- Vault: a per-user encrypted key-value store for API tokens and secrets. \`hoody vault …\`.
- Tunnel: expose an internal container service publicly via \`hoody tunnel …\`.

Docs live at docs.hoody.com. The CLI's own help (injected as a compact reference below) is the source of truth for command syntax.

This chatbot is NOT agentic — it produces text only. For real file/shell/container work use \`hoody agent\`.`;
