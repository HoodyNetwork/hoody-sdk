> _**HTTP skill · `notes` namespace** · ~17,527 tokens · hoody-sdk v1.0.1_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-computer notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, computer fs → `files`, desktop notifs → `notifications`, cross-computer identity → `api`, scheduled writes → `cron`.

## Prerequisites

- **To add a note, create a page in a notebook you already have; do not create a notebook for it.** Your default notebook (the `notebookId` from `GET /api/v1/notes/me`) and every new notebook start with a `Home` section; in an older notebook it may have been renamed or deleted, so then use any section you can edit. A page is `POST /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"page"`, `parentId:<Home section id>` (from `GET /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"section"`) and `attributes:{name}`; then write its text with `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`.
- `notebookId` on every notebook-scoped call (identity and notebook list/create take none). Without a Bearer token or export ticket, identity comes from the `?username=` / `?role=` query parameters on each request (default username `user`, default role `owner`). The first request for a username adds that user to the computer's single shared default notebook (`Hoody Notes`); every query-identity user joins that same notebook, so it is not private. A readonly default notebook takes no new usernames: they get role `none` (see Quirks). Use `POST /api/v1/notes/notebooks` for a separate notebook.
- Send an `X-Idempotency-Key` header to make retries safe on node create, record create, `POST …/document/append`, collaborator add, reactions and interactions. Notebook create, comment create and version create ignore the header, so retrying those can create duplicates. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` reject viewers and read-only collaborators with `403`. Documents attach only to `page` and `record` nodes; `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `GET /api/v1/notes/notebooks/{notebookId}/nodes` `type:"section"` → pick `Home` → `POST /api/v1/notes/notebooks/{notebookId}/nodes` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`. Creates the document if absent; pass an idempotency key (`X-Idempotency-Key` header) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `GET /api/v1/notes/me` → `{userId,username,role,notebookId}`. The `notebookId` is the computer's shared default notebook (`Hoody Notes`, with a `Home` section and starter pages), which every query-identity username joins; create a separate notebook with `POST /api/v1/notes/notebooks` to manage a separate membership list. Query identity does not authenticate usernames, so a separate notebook alone does not keep content private from callers who can reach the kit. `POST /api/v1/notes/notebooks` does not check the caller's role and makes the caller the new notebook's owner. `GET /api/v1/notes/notebooks` needs a membership row matching the identity (else `403`) and returns the active or readonly notebooks where that username's role is not `none`. `GET /api/v1/notes/notebooks/{notebookId}` needs a non-`none` membership; `update`/`delete` are owner-gated.
3. **Build a structured document with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` OVERWRITES the whole document; `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` merges: top-level keys replace the stored ones, and `content.blocks` merges by block id (each sent block replaces the stored block with that id wholesale, omitted blocks are kept; removing a block takes `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real block `type` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 2.
4. **Database CRUD** — `POST /api/v1/notes/notebooks/{notebookId}/nodes` `type:"database"`; then `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`/`GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`/`GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`/`PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` (merges `fields`)/`DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`. Page the records list with the `page`/`count` query parameters (count max 100).
5. **Collaborators, comments + versions** — before sharing a node with someone new to the notebook, call `POST /api/v1/notes/notebooks/{notebookId}/users` with `{ users: [{ username, role: 'guest' }] }`, check the returned `errors`, and use the created user's `id` as the `collaboratorId` for `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` (`admin`/`editor`/`collaborator`/`viewer`; managing node collaborators needs admin permission): a collaborator who is not yet a member of that notebook is refused with `404 user_not_found`. Inviting users needs the notebook owner or an admin (anyone else gets `403 user_invite_no_access`), so a node admin without that notebook role asks one of them to invite the person first. Collaborators attach to a section, or to a channel that has a collaborator list, not to a page: `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` on a page, database or other node answers `400 bad_request` (`This node type does not support collaborators.`), so share the section that holds it. `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` (top-level, anchored, or reply); `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` / `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` / `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` accept optional `expectedVersion` for optimistic concurrency. Re-anchoring a thread (`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`) is disabled by default and answers `409` (`Comment re-anchor is disabled.`); leave the comment where it is, or delete it and create it again on the block you want. `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`/`list`/`get`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`.
6. **TUS upload + download** — the `fileId` is an input, not something the upload returns. First create the file node yourself: `POST /api/v1/notes/notebooks/{notebookId}/nodes` with `type: 'file'` (without an `id`, the kit gives the node a file id, which ends in `18`, the only shape the upload routes accept; an `id` you pass yourself must be 22 lowercase hex chars + `'18'`), `parentId` (a node where you have editor rights), and `attributes: { subtype: 'image'|'video'|'audio'|'pdf'|'other', name, originalName, mimeType, extension: '' or '.ext', size, version: <22 lowercase hex chars> + '03', status: 0 }`. Only that node's creator can upload to it. Then run the TUS calls on that id. Send `Tus-Resumable: 1.0.0` on every one of them (POST, PATCH, HEAD and DELETE). Once the request reaches TUS validation, a missing or empty header is refused with `412`, and any other value with `400` (`file_upload_invalid_request` where a body is returned). On `…/files/{fileId}/tus`: create the upload with `POST` and an `Upload-Length` equal to the file node's `size` in bytes (a different or deferred length is refused with `400 file_size_mismatch`), send chunks with `PATCH` plus `Upload-Offset` and `Content-Type: application/offset+octet-stream`, check the resume offset with `HEAD`, or cancel with `DELETE`. Download with `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}`. 

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — a value the kit cannot repair stores silently but renders blank.** The valid block types are: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` and `database` (an embedded database view) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` and `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` repair the unambiguous mistakes before validating: known type aliases (`code`, `quote`, `bullet_list_item`, `numbered_list_item`, `h1`, …) become the real type, with flat list items wrapped in a list, and `props` becomes `attrs` when the block has no `attrs`. Other write paths skip this repair, and it leaves anything ambiguous alone (an unknown type, a bare `list_item`). The block schema is loose (`type:z.string()`, `attrs:z.record`), so an unrepaired bad `type`/`props` is accepted with `200` and stored — the block is validated on the way in, but the ORIGINAL object is what gets written, so the junk key persists — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container block's id. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` move text found directly on a container block with no children into a new child paragraph, but text on a container block that already has children is left there and renders empty. See §Examples 0 and 2 for the exact nesting.
- **Prefer `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types that do not support documents (only `page`/`record` do) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected); `horizontalRule` only in the `blocks` form, since the `{text}` form takes `paragraph`, `heading1-3` and `codeBlock` only.
- **`PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **A page needs a parent and a `name`: `POST /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"page"`, `parentId` and `attributes.name`.** The parent is the `Home` section (its id from `GET /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"section"`) or another page you can edit. With no `parentId` the kit answers `400 parent_required`: add the parent rather than creating a notebook. A `403 forbidden` is a real permission refusal (your role on the parent does not allow the create). The label is `name`; there is no `title` attribute, and a page without `name` is refused with `400 validation_error`, its `details` naming `/attributes/name`.
- **`POST /api/v1/notes/notebooks/{notebookId}/nodes` checks `attributes` against the type's schema and answers `400 validation_error` when they do not fit.** `details` lists each failing field as a JSON Pointer `path` (such as `/attributes/name` or `/attributes/fields`) with a `message`, the message names the same fields, and nothing is written. The check runs after the permission check, so a parent you cannot edit gives `403` whatever the attributes hold. An unknown type or a `parentId` that does not exist gives `400`; no `parentId` for a node that needs one gives `400 parent_required`. A section is root-only (a `parentId` gives `400 section_must_be_root`). When you create a section without `attributes.collaborators`, the server adds you as `admin`; a section collaborator map you send yourself must be a map of user ids to roles, or the create is a `400 validation_error` naming `/attributes/collaborators` (this shape is checked before the permission check), and it must name you as `admin`, or the create is a `403`. For a note, reuse the auto-provisioned `Home` section.
- **`POST /api/v1/notes/notebooks` always makes a new, separate notebook; it is not how you add a note.** It takes only `name` (plus optional `description`/`avatar`) and no parent: a notebook is top-level. It ignores `X-Idempotency-Key`, and names are not unique, so a retry or a second call with the same name makes a duplicate. Run `GET /api/v1/notes/notebooks` first and reuse a notebook that has the name; to add a note, create a page in an existing notebook with `POST /api/v1/notes/notebooks/{notebookId}/nodes`.
- Authentication re-anchors identity to the `notebookId` in the URL, so one bearer token reaches any notebook the username has joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` route + WS feed: each mutation type (`type: 'document.update'`, `type: 'node.create'`, etc.) is dispatched server-side to a SQL-backed lib function. The document PUT (full overwrite) is a last-writer-wins overwrite of the same store. The document PATCH re-applies its merge to the current document when a concurrent write lands first, so two PATCHes that send different blocks both survive; two that send the same block id are last-writer-wins for that block, and a document PUT racing a PATCH still overwrites whatever it omits.
- `GET /api/v1/notes/me` with `?username=&role=` does NOT create a per-user notebook: the first request for a username adds that user to the computer's single shared default notebook (`Hoody Notes`, seeded with starting content) with the role from that request (default `owner`), and notebook routes then use that stored role (role `none` is refused `403 notebook_no_access` on notebook-scoped routes, while `GET /api/v1/notes/me` itself still answers with role `none`). Every query-identity username shares that notebook. Create a separate notebook to manage a separate membership list; query identity does not authenticate usernames, so a separate notebook alone does not keep content private from callers who can reach the kit. When that default notebook is readonly, a username it does not hold yet is not added: `GET /api/v1/notes/me` answers with role `none`, the default notebook's routes answer `403 notebook_no_access`, and no row is written; a username that is already a member keeps its stored role and can still read and export. The `username` and `role` query parameters are read by the identity hook on every route except `/health` and `/capabilities` but are not listed in the generated Reference; `ticket` is listed for the document export. The spec also declares all three as query security schemes (`notesIdentityUsername`, `notesIdentityRole`, `notesExportTicket`). Priority Bearer → `ticket` → `?username=&role=`. Only a notes Bearer token (base64url JSON with `userId`, `notebookId`, `username`, `role`) is read: one that decodes to a JSON object but is malformed returns `401` with no fallback, while a JWT, an opaque token or another scheme is ignored and resolution continues with `ticket` or the query identity. An export `ticket` is accepted only on the HTML document export (`GET …/document?output=html`); on any other route behind the hook, a non-empty `ticket` sent without a valid notes Bearer token is a `400`. **Without a notes Bearer token, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=<name>` on every unauthenticated call, or attach a valid notes Bearer identity. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes** — content reads still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`. The TUS upload route refuses every method on a readonly notebook, the `HEAD` offset check included.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409. Only routes that implement it honour the header (see Prerequisites); notebook create does not.
- `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` merges `fields`. Database access uses the shared node-access check: it starts from your collaboration on the notebook **root** node (or your notebook role when there is none), returns `403` if an ancestor is a private `section` or a `channel` whose `collaborators` map omits you, and then applies the deepest explicit collaboration on the database's ancestor chain, so a role granted lower in the tree overrides the root one. Notebook owners/admins skip the privacy checks and keep their root-level role (their explicit collaboration on the root section when they have one, otherwise their notebook role). A root collaboration alone is therefore NOT sufficient under such an ancestor, and a write refusal can come from a deeper collaboration. A guest gets no role from the notebook, so without a collaboration on the root section the check answers `403` before deeper collaborations count. TUS validates `fileId` against the generated file-id regex (22 lowercase hex chars + `18`); a free-form file id → 400 `file_not_found`. An unknown `notebookId` is `404 notebook_not_found` from the notebook check, before the TUS route runs.
- `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` with `?output=html` needs a short-lived export `ticket` (3 uses, 2 minutes) on `GET .../document`. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` overwrites; `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` merges: top-level keys replace the stored ones, and `content.blocks` (a map by block id, or a list of blocks with distinct ids) merges by block id — a sent block replaces the stored block with that id, every other block is kept, and removing blocks takes a `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`. Any other `blocks` shape is a `400`. `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` / `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` / `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` accept optional `expectedVersion`.
- **`GET /api/v1/notes/notebooks/{notebookId}/export` downloads a ZIP of the whole notebook, or of one section, folder, page or database (`nodeId`), as Markdown (`format=md`, the default) or HTML (`format=html`).** Pages and records become documents, databases become CSV files, attachments are included unless `attachments=false`, and an `index.md` (or `index.html`) at the top lists what the archive holds and what it leaves out. Only what the caller can read is exported, and channels and messages never are. `dryRun=true` runs the scope checks and the planning limits and answers `204` with no body, or the error the download would get at planning; it does not render, so a later cut is still possible. A record, file, channel or message as `nodeId`, or a node inside a channel or message, is `400 export_unsupported_scope`; an export over a planning limit (items, sizes, nesting, planning time) is `422 export_too_large`; `nodeId` must be 24 lowercase hex characters (else `400 validation_error`); a second export of yours while one runs, or a third on the server, is `429 export_busy` with `Retry-After: 10`. The route takes no export `ticket`: without a Bearer token a non-empty one is a `400`. After the first byte a failure can only cut the connection, so a short read means an incomplete ZIP. An attachment with a browser-active extension (`html`, `htm`, `xhtml`, `shtml`, `svg`, `svgz`, `xml`, `xsl`, `xslt`, `js`, `mjs`, `mht`, `mhtml`, `hta`) is stored with `.txt` appended (`report.html` becomes `report.html.txt`, bytes unchanged), because opened from the unzipped folder it would run outside the export's CSP; rename it to open it as a page. In CSV list cells and relation/file labels, a display name longer than about 256 characters is cut and ends with an ellipsis; user display names in mentions and comment authors are capped the same way. A link to an attachment that the index lists as not included may not open. Names that match a sibling's (ignoring case) get ` (2)`, ` (3)`…, but when the numbered names are used up (case variants, long names cut to the same stem), the item is named `<name> ~<last 12 hex of its id>`, or the whole id if that is taken. 
- `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` matches `q` as a substring against the record name and each field's stored JSON (`{"type":…,"value":…}`), type and `value` key included. So `text` can match a text field whatever its value, and `type` or `value` matches any record with a field. Use `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` filters for an exact field match.
- Text filter operators in `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` and `not_contains` are not supported operators; use `is_equal_to` and `does_not_contain`. A field filter that passes the schema but cannot be applied (an operator the field type does not support, an unknown field id, a value of an unsuitable type) is silently ignored; if no filters remain, the list comes back unfiltered. Malformed JSON, a non-array `filters` value and an entry that fails the filter schema return `400`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). The file node must already exist with a `…18` id (workflow 6). 
- `GET /api/v1/notes/notebooks/{notebookId}/recent` (recently changed pages) is for notebook owners and admins; any other member gets `403 forbidden`.

## Common errors

- `400 validation_error` for request-schema failures, for `POST /api/v1/notes/notebooks/{notebookId}/nodes` attributes that do not fit the node type, and for record field values that do not match the database definition (the only 400 that carries `details[]`); `400 bad_request` for checks inside a handler (no `details`); `400 file_not_found` for a TUS file id that is not a generated file id; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (a database write needs a node role that allows it: notebook owners and admins get a node role from their notebook role unless they have an explicit collaboration on the root section, and notebook collaborators get an editor role, without any explicit collaboration; guests need an explicit collaboration on the root section, which deeper collaborations then refine).
- `404 not_found` — node/comment/version missing, or it does not belong to the `notebookId` given in the path. File routes use their own codes: `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}` answers `400 file_not_found` for a missing file node or one outside the notebook, `400 file_not_ready` / `400 file_upload_not_found` for an upload that has not finished, and `404 file_not_found` when the stored bytes are missing; the TUS route answers `404 file_not_found` for a missing file node. `500 unknown` — an operation failed or an unexpected error occurred.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `GET /api/v1/computers/{id}` first. Except for the HTML export requests, which use an export ticket and run as the ticket creator's identity, the examples send no `?username=`, Bearer token or ticket, so every call runs as the default username `user`; to act as another user, add the same `?username=<name>` to every request (a username that appears on only some calls splits ownership between two users).

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body.** A document is
`{ "content": { "type": "rich_text", "blocks": { "<blockId>": <block> } } }`. Each
block is `{ id, type, parentId, index, content?, attrs? }`:

- `type` is one of the block types listed above. There is **no** `code`,
  `bullet_list_item`, `quote`, or `numbered_list_item`. Block attributes live under
  `attrs` (**never** `props`).
- **Leaf blocks** carry text directly in `content`: `paragraph`, `heading1`,
  `heading2`, `heading3`, `codeBlock` (language in `attrs.language`). `horizontalRule`
  is a leaf with no text/content.
- **Container blocks carry NO direct text** — each holds a child `paragraph`:
  `bulletList`/`orderedList` → `listItem` → `paragraph`; `taskList` → `taskItem`
  (`attrs.checked`) → `paragraph`; `blockquote` → `paragraph`; `table` → `tableRow` →
  `tableHeader`/`tableCell` → `paragraph`. The child's `parentId` is the container block's id.
- `index` is a fractional-index key per sibling group (server uses
  fractional indexing), and keys compare as plain strings. For a brand-new document,
  `a0` to `a9` sort in order; do not continue with `a10`, which sorts between `a1` and
  `a2`. For more blocks, or to INSERT between two existing blocks, make the keys with a
  fractional-indexing library, or prefer append, which assigns keys for you.
- Inline `content` leaves are `{ "type":"text", "text":"…", "marks":[…] }` (`marks` is optional). Marks:
  `bold`, `italic`, `strike`, `underline`, `code` (no attrs); `link`
  (`attrs:{href,target,rel}`); `color` (`attrs:{color}`); `highlight`
  (`attrs:{highlight}`). Do not write `comment` marks: the editor treats them as legacy
  and strips them from an editable document; anchor a comment with `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
  instead. `mention` is an inline NODE
  (`{type:'mention',attrs:{id,target}}`), not a mark; `hardBreak`
  (`{type:'hardBreak'}`) forces a line break inside a paragraph.

Leaf blocks (text/code carry `content` directly):

```json
{ "h":  {"id":"h","type":"heading1","parentId":"PAGE","index":"a0","content":[{"type":"text","text":"Runbook"}]},
  "p":  {"id":"p","type":"paragraph","parentId":"PAGE","index":"a1","content":[{"type":"text","text":"Intro with ","marks":[]},{"type":"text","text":"bold","marks":[{"type":"bold"}]}]},
  "c":  {"id":"c","type":"codeBlock","parentId":"PAGE","index":"a2","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "hr": {"id":"hr","type":"horizontalRule","parentId":"PAGE","index":"a3"} }
```

Bulleted list — `bulletList → listItem → paragraph` (use `orderedList` for numbered):

```json
{ "bl":  {"id":"bl","type":"bulletList","parentId":"PAGE","index":"a0"},
  "li1": {"id":"li1","type":"listItem","parentId":"bl","index":"a0"},
  "li1p":{"id":"li1p","type":"paragraph","parentId":"li1","index":"a0","content":[{"type":"text","text":"First item"}]},
  "li2": {"id":"li2","type":"listItem","parentId":"bl","index":"a1"},
  "li2p":{"id":"li2p","type":"paragraph","parentId":"li2","index":"a0","content":[{"type":"text","text":"Second item"}]} }
```

Task list (`attrs.checked` on the item) and blockquote:

```json
{ "tl":  {"id":"tl","type":"taskList","parentId":"PAGE","index":"a0"},
  "ti1": {"id":"ti1","type":"taskItem","parentId":"tl","index":"a0","attrs":{"checked":false}},
  "ti1p":{"id":"ti1p","type":"paragraph","parentId":"ti1","index":"a0","content":[{"type":"text","text":"Open task"}]},
  "bq":  {"id":"bq","type":"blockquote","parentId":"PAGE","index":"a1"},
  "bqp": {"id":"bqp","type":"paragraph","parentId":"bq","index":"a0","content":[{"type":"text","text":"Quoted line"}]} }
```

Table — `table → tableRow → tableHeader/tableCell → paragraph`:

```json
{ "tbl": {"id":"tbl","type":"table","parentId":"PAGE","index":"a0"},
  "r1":  {"id":"r1","type":"tableRow","parentId":"tbl","index":"a0"},
  "h1":  {"id":"h1","type":"tableHeader","parentId":"r1","index":"a0"},
  "h1p": {"id":"h1p","type":"paragraph","parentId":"h1","index":"a0","content":[{"type":"text","text":"Col A"}]},
  "r2":  {"id":"r2","type":"tableRow","parentId":"tbl","index":"a1"},
  "c1":  {"id":"c1","type":"tableCell","parentId":"r2","index":"a0"},
  "c1p": {"id":"c1p","type":"paragraph","parentId":"c1","index":"a0","content":[{"type":"text","text":"Val 1"}]} }
```

### 1. Bootstrap identity, create a page, and append the first content (recommended)

**Goal:** stand up a fresh notebook from scratch, attach a page under the auto-created Home section, give it a one-block document.

**Step 1 — check identity & create notebook.** `GET /api/v1/notes/me` returns the caller (`user` here) and the shared default notebook that the first request joined it to. Then `POST /api/v1/notes/notebooks` for a separate, named notebook owned by that user. To write into the default notebook instead, skip `POST /api/v1/notes/notebooks` and use the `notebookId` that `GET /api/v1/notes/me` returns.

```bash
KIT="https://${P}-${C}-notes-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/notes/me" | jq .   # runs as username "user" (no ?username=)
NBID=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks" \
  -H 'Content-Type: application/json' \
  -d '{"name":"team-wiki","description":"engineering docs"}' | jq -r .id)
echo "NBID=$NBID"
```

**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `POST /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"page"` needs that section as `parentId`. Filter on the type too: the Home splash page is also named `Home`. If no Home section is found (renamed, deleted or not visible to you), pick any section you can edit, or create one, as the parent. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes?type=section&limit=100" \
  | jq -r '.nodes[] | select(.type=="section" and .name=="Home") | .id' | head -1)
PAGE=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"page\",\"parentId\":\"$SEC\",\"attributes\":{\"name\":\"Runbook\"}}" \
  | jq -r .id)
```

**Step 3 — append the first content (recommended).** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only (`horizontalRule` only in the `blocks` form: the `{text}` form
takes `paragraph`, `heading1`–`heading3` and `codeBlock`); container blocks
(lists/tables) need `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` (Example 2).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe; within a notebook and user a key identifies one request, so reusing it with another page or another body answers `409`: use a fresh key for each distinct append and reuse it only to retry that same request.

```bash
# one block from plain text
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' -H "X-Idempotency-Key: runbook-$PAGE-1" \
  -d '{"type":"heading1","text":"Runbook"}'
# a batch of flat blocks (note codeBlock language goes in attrs)
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
        {"type":"paragraph","content":[{"type":"text","text":"Run the deploy script:"}]},
        {"type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]}
      ]}'
```

### 2. Build a structured document with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
container blocks or precise ordering. Warning: this example avoids two traps. (1) Use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`). PUT
repairs the well-known aliases, but a wrong type it cannot map is stored silently and
renders blank (see Quirks). (2) `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` merges
by block id: each sent block replaces the stored block with that id wholesale and
omitted blocks are kept, so it can add or rewrite blocks but never remove one. To
remove blocks, `GET` the current blocks, mutate locally, `PUT` the result back (to
add plain blocks, `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` is simpler).

```bash
# $PAGE is still the page id from Example 1.
B1=$(openssl rand -hex 12); B2=$(openssl rand -hex 12); B3=$(openssl rand -hex 12)
BL=$(openssl rand -hex 12); LI1=$(openssl rand -hex 12); LI1P=$(openssl rand -hex 12)
LI2=$(openssl rand -hex 12); LI2P=$(openssl rand -hex 12)
cat > /tmp/doc.json <<EOF
{"content":{"type":"rich_text","blocks":{
  "$B1":{"id":"$B1","parentId":"$PAGE","index":"a0","type":"heading1","content":[{"type":"text","text":"Deploy Steps"}]},
  "$B2":{"id":"$B2","parentId":"$PAGE","index":"a1","type":"paragraph","content":[{"type":"text","text":"Run the script below, then verify."}]},
  "$B3":{"id":"$B3","parentId":"$PAGE","index":"a2","type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "$BL":{"id":"$BL","parentId":"$PAGE","index":"a3","type":"bulletList"},
  "$LI1":{"id":"$LI1","parentId":"$BL","index":"a0","type":"listItem"},
  "$LI1P":{"id":"$LI1P","parentId":"$LI1","index":"a0","type":"paragraph","content":[{"type":"text","text":"Smoke-test /healthz"}]},
  "$LI2":{"id":"$LI2","parentId":"$BL","index":"a1","type":"listItem"},
  "$LI2P":{"id":"$LI2P","parentId":"$LI2","index":"a0","type":"paragraph","content":[{"type":"text","text":"Tag the release"}]}
}}}
EOF
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d @/tmp/doc.json
```

### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```bash
DOC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document")
echo "$DOC" | jq '.content.blocks | to_entries | map({k:.key,t:.value.type,i:.value.index})'
```

**Step 2 — mutate locally + PUT back.** Select the target block by its id (`B2` / `b2` from example 2) and leave every other block as it is; matching on `type` would also rewrite the paragraphs inside the list items. `index` orders a block among the children of the same parent only, by plain code-unit string comparison. The editor treats it as a fractional index, so give the block a key that sorts before its first sibling and is still a valid key: before `a0` that is `Zz`. An invalid key such as `_a0` is not stored as sent: a full-document PUT re-keys a sibling group that holds one when every sibling has a non-empty string `index` (fresh `a0`, `a1`, … in the current order, so the siblings' `index` values may change; read them back after the PUT); a block with a missing or empty `index` that is the only child of its parent gets `a0`, but a group of several blocks in which one has a missing or empty `index` is left as sent and the PUT is refused with `400`, and a PATCH that sends a new invalid index is refused with `400`.

```bash
NEW=$(echo "$DOC" | jq --arg id "$B2" --arg t "Updated intro paragraph (now first)." '
  .content.blocks
  | .[$id].index = "Zz"
  | .[$id].content = [{type:"text",text:$t}]
  | {content:{type:"rich_text",blocks:.}}')
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d "$NEW"
```

### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```bash
DOC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document")
NEW=$(echo "$DOC" | jq 'del(.content.blocks["'"$B3"'"]) | {content:{type:"rich_text",blocks:.content.blocks}}')
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d "$NEW"
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  | jq --arg p "$PAGE" '[.content.blocks[] | select(.parentId==$p)] | sort_by(.index) | map(.type)'
```

### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. Warning: `POST /api/v1/notes/notebooks/{notebookId}/nodes` for `type:"database"` requires an `attributes.fields` map (`{}` is valid while the database has no columns yet). Without the map the kit answers `400 validation_error`, its `details` naming `/attributes/fields`; a permission failure is a `403`. Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
DBID=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"database\",\"parentId\":\"$SEC\",\"attributes\":{
    \"name\":\"Tasks\",
    \"fields\":{
      \"f_status\":{\"id\":\"f_status\",\"type\":\"text\",\"name\":\"Status\",\"index\":\"a0\"},
      \"f_priority\":{\"id\":\"f_priority\",\"type\":\"number\",\"name\":\"Priority\",\"index\":\"a1\"},
      \"f_done\":{\"id\":\"f_done\",\"type\":\"boolean\",\"name\":\"Done\",\"index\":\"a2\"}
    }
  }}" | jq -r .id)

for i in 1 2 3; do
  curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Task $i\",\"fields\":{
      \"f_status\":{\"type\":\"text\",\"value\":\"todo\"},
      \"f_priority\":{\"type\":\"number\",\"value\":$i},
      \"f_done\":{\"type\":\"boolean\",\"value\":false}
    }}" >/dev/null
done
```

### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. Warning: `filters` MUST be a **JSON array** (not an object) of filter entries: a field filter `{ id, type:"field", fieldId, operator, value }`, or a group `{ id, type:"group", operator:"and"|"or", filters:[…field filters] }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array). A schema-valid field filter that cannot be applied is ignored, so check that the result is actually filtered.

```bash
F='[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]'
S='[{"id":"s1","fieldId":"f_priority","direction":"desc"}]'
ENC_F=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$F")
ENC_S=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$S")
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?filters=$ENC_F&sorts=$ENC_S&count=50" \
  | jq '.records[] | {n:.name, p:.fields.f_priority.value}'
```

A simpler full-text alternative is `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search?q=...` — no array shape, just a query string; matches the record `name` and each field's stored JSON, including type names and keys.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` PATCH MERGES `fields` (sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` with a `type` the column accepts: `text`, `select`, `date`, `phone` and `url` columns take `text` or `string`, `number` takes `number`, `boolean` takes `boolean`, and `multi_select`, `collaborator`, `file` and `relation` take `string_array`. Computed columns (`created_at`, `created_by`, `updated_at`, `updated_by`, `rollup`) cannot be set.

```bash
RID=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?count=50" \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
curl -sf -X PATCH "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records/$RID" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"f_status":{"type":"text","value":"done"},"f_done":{"type":"boolean","value":true}}}' \
  | jq '.fields'
```

### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` per row. The loops below split each line on commas, so they handle simple rows only, with no quoted values and no commas or newlines inside a value; for a real CSV file, use a CSV parser and check that each priority is a number. Warning: Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key that includes the database id and the row number (a key made from the name alone collides across databases and between rows with the same name; replay returns the saved response; same key + different payload returns `409`). 

```bash
cat > /tmp/tasks.csv <<EOF
name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress
EOF
n=0
tail -n +2 /tmp/tasks.csv | while IFS=, read -r name pri stat; do
  n=$((n + 1))
  KEY=$(echo -n "import-2026-05-07:$DBID:$n:$name" | sha256sum | cut -d' ' -f1)
  curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records" \
    -H 'Content-Type: application/json' -H "X-Idempotency-Key: $KEY" \
    -d "$(jq -nc --arg n "$name" --argjson p "$pri" --arg s "$stat" \
      '{name:$n, fields:{
         f_priority:{type:"number",value:$p},
         f_status:{type:"text",value:$s},
         f_done:{type:"boolean",value:false}}}')" >/dev/null
done
```

### 9. Export a page to HTML — short-lived ticket flow

**Goal:** publish a static HTML snapshot of a page. `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` with `?output=html` requires a short-lived export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Each ticket allows 3 uses and expires after 2 minutes. Anyone with the kit URL and the ticket can download until the uses are spent or it expires, as long as the person who created it still has access to the page.

**Step 1 — create a ticket.**

```bash
TICKET=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/export-ticket" \
  -H 'Content-Type: application/json' \
  -d '{"output":"html","themeMode":"light","includeComments":"appendix"}' \
  | jq -r .ticket)
```

**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document?output=html&ticket=$TICKET" > /tmp/page.html
# Markdown export — no ticket needed:
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document?output=md" > /tmp/page.md
```

### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. The section and notebook steps are only for the separate notebook Example 1 created. If you wrote into the default notebook from `GET /api/v1/notes/me` (Example 1's alternative) or any other notebook you did not create here, delete only the records, the database and the page these examples created, and stop: deleting that notebook's `Home` section or the notebook itself removes content that was there before, including the shared default notebook's starter pages. Order matters: deleting a `section` cascades to every descendant page/database/record under it; other sections and their descendants remain. Then `DELETE /api/v1/notes/notebooks/{notebookId}` removes the notebook itself.

`DELETE /api/v1/notes/notebooks/{notebookId}` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `GET /api/v1/notes/notebooks` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
# delete records
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?count=100" \
  | jq -r '.records[].id' \
  | while read RID; do
      curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records/$RID" >/dev/null
    done
# delete the database node
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$DBID" >/dev/null
```

Then, in the default notebook or any notebook you did not create here, delete the page and stop:

```bash
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE" >/dev/null
```

Or, only in the separate notebook Example 1 created, delete the section and the notebook:

```bash
# cascade-delete by removing the section (drops every page/db underneath)
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$SEC" >/dev/null
# notebook delete (returns 200 immediately, soft-delete — see note above).
# Rename only if the delete failed: once deleted, a PATCH returns
# 403 notebook_no_access, or 404 notebook_not_found after cleanup removes it.
CODE=$(curl -s -X DELETE "$KIT/api/v1/notes/notebooks/$NBID" -o /dev/null -w '%{http_code}')
if [ "$CODE" != 200 ]; then
  curl -sf -X PATCH "$KIT/api/v1/notes/notebooks/$NBID" \
    -H 'Content-Type: application/json' \
    -d '{"name":"team-wiki-DELETED"}'
fi
```

## Reference

### `avatars` (2) — Avatar images

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/avatars/{avatarId}` | Download an avatar image |  |
| `POST /api/v1/notes/avatars` | Upload an avatar image | `body*:image/jpeg,image/png,image/webp` |

### `collaborators` (4) — Collaborators on a node

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | Add a collaborator | `H:X-Idempotency-Key` `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | List collaborators |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Remove a collaborator |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Update collaborator role | `body*` |

**Param notes:**

- `X-Idempotency-Key` — Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without adding the collaborator again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409.

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` body — `{ collaboratorId*: string, role*: "admin" | "editor" | "collaborator" | "viewer" }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` body — `{ role*: "admin" | "editor" | "collaborator" | "viewer" }`

### `comments` (7) — Comments on a node

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | Create a comment | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Delete a comment | `?expectedVersion` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments | `?limit` `?offset` `?cursor` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors | `?limit` `?offset` `?cursor` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | Resolve a comment | `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | Re-anchor a comment thread | `body*` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Edit a comment | `body*` |

**Param notes:**

- `cursor` — The nextCursor of the previous page. While cursor pagination is turned off (the default), a non-empty cursor returns 409 with code bad_request. While it is on, a non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. _(on `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`)_
- `cursor` — The nextCursor of the previous page. A non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. While comment anchors are turned off (the default), the endpoint returns 409 with code bad_request whatever the cursor. _(on `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`)_

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` body — `{ content*: string, parentId: string, anchorBlockId: string, anchor: object }`
  - `parentId` — ID of the root comment to reply to. Replies go one level deep: a reply to a reply, or to a resolved thread, returns 409 with code bad_request. A reply takes its thread's anchor; an anchor sent with it is ignored by default.
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` body — `{ expectedVersion: int }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` body — `{ anchor*: object, expectedVersion: int }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` body — `{ content*: string, expectedVersion: int }`

### `document` (6) — Document content of a node

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | Append blocks to a document | `H:If-Match` `H:X-Idempotency-Key` `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | Create secure HTML export ticket | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | Export drawing block as SVG | `?bg` `?scale` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Get document content | `?blockIds` `?lines` `?output` `?includeComments` `?ticket` `H:If-None-Match` |
| `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Create or replace document | `H:If-Match` `body*` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Merge document content | `H:If-Match` `body*` |

**Param notes:**

- `If-Match` — Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). An append that repeats an `X-Idempotency-Key` it already completed is answered from the stored response without checking `If-Match` again.
- `X-Idempotency-Key` — Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409.
- `If-None-Match` — Optional (RFC 9110): ETags of copies the caller already holds, or `*`. When the document is still at one of them the JSON output answers 304 with no body. Ignored by the Markdown and HTML outputs.

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` body — `{ text*: string, type: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"="paragraph", attrs: object|null } | { blocks*: object[] }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` body — `{ output: "html"="html", includeComments: "none" | "appendix"="none", includeBackground: bool=true, themeMode: "light" | "dark"="dark", themeId: string|null, themeVariables: { [key: string]: string }, fileName: string }`
- `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body — `{ content*: { [key: string]: any } }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body — `{ content*: { [key: string]: any } }`

### `files` (2) — File attachments

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}` | Download a file |  |
| `GET /api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files | `?limit` `?offset` |

### `files.uploads` (4) — files

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Abort a TUS upload | `H:Tus-Resumable*` |
| `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Create a resumable (TUS) upload | `H:Tus-Resumable*` `H:Upload-Length*` `H:Upload-Metadata` |
| `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Check a TUS upload's offset (for resuming) | `H:Tus-Resumable*` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Upload a chunk to a TUS upload | `H:Tus-Resumable*` `H:Upload-Offset*` `body*:application/offset+octet-stream` |

**Param notes:**

- `Tus-Resumable` — TUS protocol version. Every TUS request must send `1.0.0`: a missing header is refused with 412, any other value with 400.
- `Upload-Length` — Total size of the file in bytes. Must equal the file node's `size` (set when the node was created), which must not exceed the notebook's maximum file size. Upload-Defer-Length is not supported.
- `Upload-Metadata` — Optional TUS metadata: comma-separated `key base64(value)` pairs.
- `Upload-Offset` — Offset this chunk starts at: the value the HEAD check (or the previous chunk) returned.

### `kit` (2) — health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/capabilities` | Optional features of this server |  |
| `GET /api/v1/notes/health` | Service health and runtime info |  |

### `members` (2) — Notebook members

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/users` | Invite users to notebook | `body*` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | Update user role | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/users` body — `{ users*: { username*: string, role*: "owner" | "admin" | "collaborator" | "guest" | "none" }[] }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role` body — `{ role*: "owner" | "admin" | "collaborator" | "guest" | "none" }`

### `mutations` (1) — mutations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/mutations` | Sync client mutations | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/mutations` body — `{ mutations*: object[] }`

### `nodes` (10) — Nodes: pages, folders and databases

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes` | Create a node | `H:X-Idempotency-Key` `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Delete a node |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Get a node |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes` | List nodes | `?type` `?parentId` `?rootId` `?limit` `?offset` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes | `?limit` `?offset` |
| `GET /api/v1/notes/notebooks/{notebookId}/recent` | List recently changed pages | `?limit` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | Mark node as opened | `H:X-Idempotency-Key` `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | Mark node as seen | `H:X-Idempotency-Key` `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | Resolve page by alias |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Update a node | `body*` |

**Param notes:**

- `X-Idempotency-Key` — Optional idempotency key (max 256 chars), such as a random UUID per node. Reusing the same key with an identical request body replays the original response instead of creating a second node; reusing it with a different body returns 409. _(on `POST /api/v1/notes/notebooks/{notebookId}/nodes`)_
- `X-Idempotency-Key` — Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without recording the open again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. _(on `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`)_
- `X-Idempotency-Key` — Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without recording the view again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. _(on `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`)_

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes` body — `{ id: string, type*: string, parentId: string, attributes*: { [key: string]: any } }`
  - `type` — The node type: `page`, `folder`, `database`, `database_view`, `record`, `channel`, `message`, `file` or `section`.
  - `parentId` — The id of the node this one goes under. Every type except `section` needs one. A page, folder, database or channel can go under the notebook's Home section (every new notebook starts with one; it can be renamed or deleted later, then use another section you can edit). …
  - `attributes` — … Attributes that do not fit the type answer `400` with code `validation_error`, and `details` names each field.
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` body — `{ openedAt: string }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` body — `{ seenAt: string }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` body — `{ attributes*: { [key: string]: any } }`

### `notebooks` (6) — Notebooks

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks` | Create a notebook | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}` | Delete a notebook |  |
| `GET /api/v1/notes/notebooks/{notebookId}/export` | Export notes as a ZIP | `?nodeId` `?format` `?attachments` `?comments` `?themeMode` `?dryRun` |
| `GET /api/v1/notes/notebooks/{notebookId}` | Get notebook details |  |
| `GET /api/v1/notes/notebooks` | List notebooks |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}` | Update notebook settings | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks` body — `{ name*: string, description: string|null, avatar: string|null }`
- `PATCH /api/v1/notes/notebooks/{notebookId}` body — `{ name*: string, description: string|null, avatar: string|null }`

### `notes` (1) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/me` | Get current identity |  |

### `reactions` (3) — Emoji reactions on a node

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | Add a reaction | `H:X-Idempotency-Key` `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | List reactions |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | Remove a reaction |  |

**Param notes:**

- `X-Idempotency-Key` — Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without adding the reaction again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409.

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` body — `{ reaction*: string }`

### `records` (6) — Records of a database node

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | Create a database record | `H:X-Idempotency-Key` `body` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Delete a database record |  |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Get a database record |  |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | List database records | `?filters` `?sorts` `?page` `?count` |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` | Search database records | `?q` `?exclude` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Update a database record | `body` |

**Param notes:**

- `X-Idempotency-Key` — Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response instead of creating a second record. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409.
- `filters` — JSON-encoded array of filters. Each is a field filter { id, type: "field", fieldId, operator, value } or a group { id, type: "group", operator: "and" | "or", filters }. The fieldId `name` filters on the record name. A filter on a field the database does not have is ignored.
- `sorts` — JSON-encoded array of sorts, applied in order. Each is { id, fieldId, direction: "asc" | "desc" }. The fieldId `name` sorts by the record name. A sort on a field the database does not have is ignored.
- `q` — Text to find in the record name or in any field value (substring match; ASCII letters match in any case). A field value is matched as its JSON text, such as {"type":"string","value":"Q3"}, so a query can also match a field type name. Empty returns all records except those specified in `exclude`.

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` body — `{ id: string, name: string="Untitled", avatar: string|null, fields: { [key: string]: object } }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` body — `{ name: string, avatar: string|null, fields: { [key: string]: object } }`

### `sockets` (2) — sockets

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/sockets/{socketId}` | Open a WebSocket connection |  |
| `POST /api/v1/notes/sockets` | Initialize a WebSocket session |  |

### `versions` (5) — Document version snapshots

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | Create a document version snapshot |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Delete a document version |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Get a specific document version |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions | `?limit` `?offset` `?beforeRevision` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | Restore a document version |  |

**Param notes:**

- `beforeRevision` — Only versions with a lower revision. Pass the lowest revision you already have to get the next page: unlike offset it stays correct while versions are added or deleted. Combines with offset (normally 0).

