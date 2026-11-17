> _**SDK skill · `notes` namespace** · ~24,916 tokens · hoody-sdk v1.0.1_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-computer notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, computer fs → `files`, desktop notifs → `notifications`, cross-computer identity → `api`, scheduled writes → `cron`.

## Prerequisites

- **To add a note, create a page in a notebook you already have; do not create a notebook for it.** Your default notebook (the `notebookId` from `notes.whoami`) and every new notebook start with a `Home` section; in an older notebook it may have been renamed or deleted, so then use any section you can edit. A page is `nodes.create` with `type:"page"`, `parentId:<Home section id>` (from `nodes.list` with `type:"section"`) and `attributes:{name}`; then write its text with `document.append`.
- `notebookId` on every notebook-scoped call (identity and notebook list/create take none). Without a Bearer token or export ticket, identity comes from the `?username=` / `?role=` query parameters on each request (default username `user`, default role `owner`). The first request for a username adds that user to the computer's single shared default notebook (`Hoody Notes`); every query-identity user joins that same notebook, so it is not private. A readonly default notebook takes no new usernames: they get role `none` (see Quirks). Use `notebooks.create` for a separate notebook.
- The HTTP API honours `X-Idempotency-Key` on node create, record create, document append, collaborator add, reactions and interactions. Notebook create, comment create and version create ignore it, so retrying those can create duplicates. Node create takes the key in its third argument, `nodes.create(nbId, body, { idempotencyKey: key })`; without one the SDK sends a fresh key per call, so its own retries are safe but a rerun of your code is not. Record create takes it in its fourth argument, the options: `records.create(nbId, dbId, body, { idempotencyKey: key })`. `document.append` takes it as `options.idempotencyKey`, but the SDK does not create one for you: pass a stable key of your own and reuse it when you repeat the same append (a call without a key adds the content again if you rerun it). Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `document.set`/`document.update`/`document.append` reject viewers and read-only collaborators with `403`. Documents attach only to `page` and `record` nodes; `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `nodes.list` `type:"section"` → pick `Home` → `nodes.create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `document.append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `document.set`. Creates the document if absent; pass an idempotency key (`options.idempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `notes.whoami` → `{userId,username,role,notebookId}`. The `notebookId` is the computer's shared default notebook (`Hoody Notes`, with a `Home` section and starter pages), which every query-identity username joins; create a separate notebook with `notebooks.create` to manage a separate membership list. Query identity does not authenticate usernames, so a separate notebook alone does not keep content private from callers who can reach the kit. `notebooks.create` does not check the caller's role and makes the caller the new notebook's owner. `notebooks.list` needs a membership row matching the identity (else `403`) and returns the active or readonly notebooks where that username's role is not `none`. `notebooks.get` needs a non-`none` membership; `update`/`delete` are owner-gated.
3. **Build a structured document with `document.set`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `document.set` OVERWRITES the whole document; `document.update` merges: top-level keys replace the stored ones, and `content.blocks` merges by block id (each sent block replaces the stored block with that id wholesale, omitted blocks are kept; removing a block takes `document.set`). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real block `type` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 2.
4. **Database CRUD** — `nodes.create` `type:"database"`; then `records.create`/`records.list`/`records.search`/`records.update` (merges `fields`)/`records.delete`. Page with `page`/`count` on `records.list` (count max 100). `records.listIterator` and `records.listAll` walk those pages for you (they advance `page` and size pages with `count`).
5. **Collaborators, comments + versions** — before sharing a node with someone new to the notebook, call `members.invite(notebookId, { users: [{ username, role: 'guest' }] })`, check the returned `errors`, and use the created user's `id` as the `collaboratorId` for `collaborators.add` (`admin`/`editor`/`collaborator`/`viewer`; managing node collaborators needs admin permission): a collaborator who is not yet a member of that notebook is refused with `404 user_not_found`. Inviting users needs the notebook owner or an admin (anyone else gets `403 user_invite_no_access`), so a node admin without that notebook role asks one of them to invite the person first. Collaborators attach to a section, or to a channel that has a collaborator list, not to a page: `collaborators.add` on a page, database or other node answers `400 bad_request` (`This node type does not support collaborators.`), so share the section that holds it. `comments.create` (top-level, anchored, or reply); `comments.update` / `comments.delete` / `comments.resolve` accept optional `expectedVersion` for optimistic concurrency. Re-anchoring a thread (`comments.setAnchor`) is disabled by default and answers `409` (`Comment re-anchor is disabled.`); leave the comment where it is, or delete it and create it again on the block you want. `versions.create`/`list`/`get`/`versions.restore`.
6. **TUS upload + download** — the `fileId` is an input, not something the upload returns. First create the file node yourself: `nodes.create` with `type: 'file'` (without an `id`, the kit gives the node a file id, which ends in `18`, the only shape the upload routes accept; an `id` you pass yourself must be 22 lowercase hex chars + `'18'`), `parentId` (a node where you have editor rights), and `attributes: { subtype: 'image'|'video'|'audio'|'pdf'|'other', name, originalName, mimeType, extension: '' or '.ext', size, version: <22 lowercase hex chars> + '03', status: 0 }`. Only that node's creator can upload to it. Then run the TUS calls on that id. Send `Tus-Resumable: 1.0.0` on every one of them (POST, PATCH, HEAD and DELETE). Once the request reaches TUS validation, a missing or empty header is refused with `412`, and any other value with `400` (`file_upload_invalid_request` where a body is returned). On `…/files/{fileId}/tus`: create the upload with `POST` and an `Upload-Length` equal to the file node's `size` in bytes (a different or deferred length is refused with `400 file_size_mismatch`), send chunks with `PATCH` plus `Upload-Offset` and `Content-Type: application/offset+octet-stream`, check the resume offset with `HEAD`, or cancel with `DELETE`. Download with `files.download`. `files.upload(notebookId, data, { parentId, name })` does the whole sequence: it creates the file node with a valid `…18` id, sends the bytes over TUS and resolves once the file is ready. If it rejects after the node exists, `files.resumeUpload(notebookId, fileId, data)` continues from the offset the server holds (the id comes from the `onFileId` option or `err.fileId`), and `files.uploads.cancel(notebookId, fileId, { tusResumable: '1.0.0' })` abandons the upload (the options argument is required). A result with `alreadyUploaded: true` means the file was already recorded: the final response was lost, or another caller finished it. The helpers reject with `code` `NOTES_UPLOAD_LENGTH_MISMATCH`, `NOTES_UPLOAD_SIZE_MISMATCH`, `NOTES_UPLOAD_NOT_READY` or `NOTES_UPLOAD_NOT_A_FILE`; server refusals surface as `ApiError` with the notes code. `files.download` takes `(notebookId, fileId)`, notebook id first.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — a value the kit cannot repair stores silently but renders blank.** The valid block types are: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` and `database` (an embedded database view) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. `document.set` and `document.update` repair the unambiguous mistakes before validating: known type aliases (`code`, `quote`, `bullet_list_item`, `numbered_list_item`, `h1`, …) become the real type, with flat list items wrapped in a list, and `props` becomes `attrs` when the block has no `attrs`. Other write paths skip this repair, and it leaves anything ambiguous alone (an unknown type, a bare `list_item`). The block schema is loose (`type:z.string()`, `attrs:z.record`), so an unrepaired bad `type`/`props` is accepted with `200` and stored — the block is validated on the way in, but the ORIGINAL object is what gets written, so the junk key persists — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container block's id. `document.set`/`document.update` move text found directly on a container block with no children into a new child paragraph, but text on a container block that already has children is left there and renders empty. See §Examples 0 and 2 for the exact nesting.
- **Prefer `document.append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types that do not support documents (only `page`/`record` do) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected); `horizontalRule` only in the `blocks` form, since the `{text}` form takes `paragraph`, `heading1-3` and `codeBlock` only.
- **`document.set` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **A page needs a parent and a `name`: `nodes.create` with `type:"page"`, `parentId` and `attributes.name`.** The parent is the `Home` section (its id from `nodes.list` with `type:"section"`) or another page you can edit. With no `parentId` the kit answers `400 parent_required`: add the parent rather than creating a notebook. A `403 forbidden` is a real permission refusal (your role on the parent does not allow the create). The label is `name`; there is no `title` attribute, and a page without `name` is refused with `400 validation_error`, its `details` naming `/attributes/name`.
- **`nodes.create` checks `attributes` against the type's schema and answers `400 validation_error` when they do not fit.** `details` lists each failing field as a JSON Pointer `path` (such as `/attributes/name` or `/attributes/fields`) with a `message`, the message names the same fields, and nothing is written. The check runs after the permission check, so a parent you cannot edit gives `403` whatever the attributes hold. An unknown type or a `parentId` that does not exist gives `400`; no `parentId` for a node that needs one gives `400 parent_required`. A section is root-only (a `parentId` gives `400 section_must_be_root`). When you create a section without `attributes.collaborators`, the server adds you as `admin`; a section collaborator map you send yourself must be a map of user ids to roles, or the create is a `400 validation_error` naming `/attributes/collaborators` (this shape is checked before the permission check), and it must name you as `admin`, or the create is a `403`. For a note, reuse the auto-provisioned `Home` section.
- **`notebooks.create` always makes a new, separate notebook; it is not how you add a note.** It takes only `name` (plus optional `description`/`avatar`) and no parent: a notebook is top-level. It ignores `X-Idempotency-Key`, and names are not unique, so a retry or a second call with the same name makes a duplicate. Run `notebooks.list` first and reuse a notebook that has the name; to add a note, create a page in an existing notebook with `nodes.create`.
- Authentication re-anchors identity to the `notebookId` in the URL, so one bearer token reaches any notebook the username has joined.
- Cross-client convergence is **mutation-stream-driven** via the `mutations.sync` route + WS feed: each mutation type (`type: 'document.update'`, `type: 'node.create'`, etc.) is dispatched server-side to a SQL-backed lib function. The document PUT (full overwrite) is a last-writer-wins overwrite of the same store. The document PATCH re-applies its merge to the current document when a concurrent write lands first, so two PATCHes that send different blocks both survive; two that send the same block id are last-writer-wins for that block, and a document PUT racing a PATCH still overwrites whatever it omits.
- `notes.whoami` with `?username=&role=` (HTTP only: `notes.whoami()` takes no such options) does NOT create a per-user notebook: the first request for a username adds that user to the computer's single shared default notebook (`Hoody Notes`, seeded with starting content) with the role from that request (default `owner`), and notebook routes then use that stored role (role `none` is refused `403 notebook_no_access` on notebook-scoped routes, while `notes.whoami` itself still answers with role `none`). Every query-identity username shares that notebook. Create a separate notebook to manage a separate membership list; query identity does not authenticate usernames, so a separate notebook alone does not keep content private from callers who can reach the kit. When that default notebook is readonly, a username it does not hold yet is not added: `notes.whoami` answers with role `none`, the default notebook's routes answer `403 notebook_no_access`, and no row is written; a username that is already a member keeps its stored role and can still read and export. The `username` and `role` query parameters are read by the identity hook on every route except `/health` and `/capabilities` but are not listed in the generated Reference; `ticket` is listed for the document export. The spec also declares all three as query security schemes (`notesIdentityUsername`, `notesIdentityRole`, `notesExportTicket`). Priority Bearer → `ticket` → `?username=&role=`. Only a notes Bearer token (base64url JSON with `userId`, `notebookId`, `username`, `role`) is read: one that decodes to a JSON object but is malformed returns `401` with no fallback, while a JWT, an opaque token or another scheme is ignored and resolution continues with `ticket` or the query identity. An export `ticket` is accepted only on the HTML document export (`GET …/document?output=html`); on any other route behind the hook, a non-empty `ticket` sent without a valid notes Bearer token is a `400`. **Without a notes Bearer token, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=<name>` on every unauthenticated call, or attach a valid notes Bearer identity. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes** — content reads still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`. The TUS upload route refuses every method on a readonly notebook, the `HEAD` offset check included.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409. Only routes that implement it honour the header (see Prerequisites); notebook create does not.
- `records.update` merges `fields`. Database access uses the shared node-access check: it starts from your collaboration on the notebook **root** node (or your notebook role when there is none), returns `403` if an ancestor is a private `section` or a `channel` whose `collaborators` map omits you, and then applies the deepest explicit collaboration on the database's ancestor chain, so a role granted lower in the tree overrides the root one. Notebook owners/admins skip the privacy checks and keep their root-level role (their explicit collaboration on the root section when they have one, otherwise their notebook role). A root collaboration alone is therefore NOT sufficient under such an ancestor, and a write refusal can come from a deeper collaboration. A guest gets no role from the notebook, so without a collaboration on the root section the check answers `403` before deeper collaborations count. TUS validates `fileId` against the generated file-id regex (22 lowercase hex chars + `18`); a free-form file id → 400 `file_not_found`. An unknown `notebookId` is `404 notebook_not_found` from the notebook check, before the TUS route runs.
- `document.get` with `output: 'html'` needs a short-lived export `ticket` (3 uses, 2 minutes). `document.set` overwrites; `document.update` merges: top-level keys replace the stored ones, and `content.blocks` (a map by block id, or a list of blocks with distinct ids) merges by block id — a sent block replaces the stored block with that id, every other block is kept, and removing blocks takes a `document.set`. Any other `blocks` shape is a `400`. `comments.update` / `comments.delete` / `comments.resolve` accept optional `expectedVersion`.
- **`notebooks.export` downloads a ZIP of the whole notebook, or of one section, folder, page or database (`nodeId`), as Markdown (`format=md`, the default) or HTML (`format=html`).** Pages and records become documents, databases become CSV files, attachments are included unless `attachments=false`, and an `index.md` (or `index.html`) at the top lists what the archive holds and what it leaves out. Only what the caller can read is exported, and channels and messages never are. `dryRun=true` runs the scope checks and the planning limits and answers `204` with no body, or the error the download would get at planning; it does not render, so a later cut is still possible. A record, file, channel or message as `nodeId`, or a node inside a channel or message, is `400 export_unsupported_scope`; an export over a planning limit (items, sizes, nesting, planning time) is `422 export_too_large`; `nodeId` must be 24 lowercase hex characters (else `400 validation_error`); a second export of yours while one runs, or a third on the server, is `429 export_busy` with `Retry-After: 10`. The route takes no export `ticket`: without a Bearer token a non-empty one is a `400`. After the first byte a failure can only cut the connection, so a short read means an incomplete ZIP. An attachment with a browser-active extension (`html`, `htm`, `xhtml`, `shtml`, `svg`, `svgz`, `xml`, `xsl`, `xslt`, `js`, `mjs`, `mht`, `mhtml`, `hta`) is stored with `.txt` appended (`report.html` becomes `report.html.txt`, bytes unchanged), because opened from the unzipped folder it would run outside the export's CSP; rename it to open it as a page. In CSV list cells and relation/file labels, a display name longer than about 256 characters is cut and ends with an ellipsis; user display names in mentions and comment authors are capped the same way. A link to an attachment that the index lists as not included may not open. Names that match a sibling's (ignoring case) get ` (2)`, ` (3)`…, but when the numbered names are used up (case variants, long names cut to the same stem), the item is named `<name> ~<last 12 hex of its id>`, or the whole id if that is taken. `notebooks.exportStream(notebookId, { nodeId, format, attachments, dryRun })` returns the raw `Response` (body unread) so the archive can be piped to a file; booleans are sent as `'true'`/`'false'`.
- `records.search` matches `q` as a substring against the record name and each field's stored JSON (`{"type":…,"value":…}`), type and `value` key included. So `text` can match a text field whatever its value, and `type` or `value` matches any record with a field. Use `records.list` filters for an exact field match.
- Text filter operators in `records.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` and `not_contains` are not supported operators; use `is_equal_to` and `does_not_contain`. A field filter that passes the schema but cannot be applied (an operator the field type does not support, an unknown field id, a value of an unsuitable type) is silently ignored; if no filters remain, the list comes back unfiltered. Malformed JSON, a non-array `filters` value and an entry that fails the filter schema return `400`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). The file node must already exist with a `…18` id (workflow 6). The generated `files.uploads.writeChunk` sends one chunk, but its response envelope hides the `Upload-Offset` header the next chunk needs, so use `files.upload` / `files.resumeUpload`, which track the offset.
- `nodes.listRecent` (recently changed pages) is for notebook owners and admins; any other member gets `403 forbidden`.

## Common errors

- `400 validation_error` for request-schema failures, for `nodes.create` attributes that do not fit the node type, and for record field values that do not match the database definition (the only 400 that carries `details[]`); `400 bad_request` for checks inside a handler (no `details`); `400 file_not_found` for a TUS file id that is not a generated file id; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (a database write needs a node role that allows it: notebook owners and admins get a node role from their notebook role unless they have an explicit collaboration on the root section, and notebook collaborators get an editor role, without any explicit collaboration; guests need an explicit collaboration on the root section, which deeper collaborations then refine).
- `404 not_found` — node/comment/version missing, or it does not belong to the `notebookId` given in the path. File routes use their own codes: `files.download` answers `400 file_not_found` for a missing file node or one outside the notebook, `400 file_not_ready` / `400 file_upload_not_found` for an upload that has not finished, and `404 file_not_found` when the stored bytes are missing; the TUS route answers `404 file_not_found` for a missing file node. `500 unknown` — an operation failed or an unexpected error occurred.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first. Except for the HTML export requests, which use an export ticket and run as the ticket creator's identity, the examples send no `?username=`, Bearer token or ticket, so every call runs as the default username `user`; the notes methods take no `username` or `role` option, so without a token they run as `user`; to run them as a Notes bearer token's user, set that token as the computer client's `kitAuth` (`{ type: 'token', value: '<token>' }`), since a per-call `Authorization` header is refused with a `TypeError`; and to pick a user by name, send the HTTP requests with the same `?username=<name>` on every request.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `document.set` body.** A document is
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
  and strips them from an editable document; anchor a comment with `comments.create`
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

**Step 1 — check identity & create notebook.** `notes.whoami` returns the caller (`user` here) and the shared default notebook that the first request joined it to. Then `notebooks.create` for a separate, named notebook owned by that user. To write into the default notebook instead, skip `notebooks.create` and use the `notebookId` that `notes.whoami` returns.

```typescript
// client.notes.whoami() needs no arguments. Without a Bearer identity, SDK calls send no ?username=,
// so they resolve as the default username "user" (as do the HTTP and CLI forms here).
const me = await client.notes.whoami();
const nb = await client.notes.notebooks.create({ name: 'team-wiki', description: 'engineering docs' });
const nbId = nb.data!.id;
```

**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `nodes.create` with `type:"page"` needs that section as `parentId`. Filter on the type too: the Home splash page is also named `Home`. If no Home section is found (renamed, deleted or not visible to you), pick any section you can edit, or create one, as the parent. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```typescript
const list = await client.notes.nodes.list(nbId, { type: 'section', limit: 100 });
const sec = (list.data!.nodes as any[]).find(n => n.type === 'section' && n.name === 'Home')!.id as string;   // the node union has no common `name`; cast to read it
const page = await client.notes.nodes.create(nbId, {
  type: 'page',
  parentId: sec,
  attributes: { name: 'Runbook' },
});
const pageId = page.data!.id as string;
```

**Step 3 — append the first content (recommended).** `document.append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only (`horizontalRule` only in the `blocks` form: the `{text}` form
takes `paragraph`, `heading1`–`heading3` and `codeBlock`); container blocks
(lists/tables) need `document.set` (Example 2).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe; within a notebook and user a key identifies one request, so reusing it with another page or another body answers `409`: use a fresh key for each distinct append and reuse it only to retry that same request.

```typescript
// One block from plain text. The idempotency key is passed via options.idempotencyKey
// (document.append exposes the X-Idempotency-Key header as an option).
await client.notes.document.append(
  nbId, pageId,
  { type: 'heading1', text: 'Runbook' },
  { idempotencyKey: `runbook-${pageId}-1` },
);
// A batch of flat blocks:
await client.notes.document.append(nbId, pageId, {
  blocks: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Run the deploy script:' }] },
    { type: 'codeBlock', attrs: { language: 'bash' },
      content: [{ type: 'text', text: './deploy.sh prod' }] },
  ],
});
```

### 2. Build a structured document with `document.set` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
container blocks or precise ordering. Warning: this example avoids two traps. (1) Use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`). PUT
repairs the well-known aliases, but a wrong type it cannot map is stored silently and
renders blank (see Quirks). (2) `document.update` merges
by block id: each sent block replaces the stored block with that id wholesale and
omitted blocks are kept, so it can add or rewrite blocks but never remove one. To
remove blocks, `GET` the current blocks, mutate locally, `PUT` the result back (to
add plain blocks, `document.append` is simpler).

```typescript
import { randomBytes } from 'crypto';
const mk = () => randomBytes(12).toString('hex');
const b1 = mk(), b2 = mk(), b3 = mk(), bl = mk();
const li1 = mk(), li1p = mk(), li2 = mk(), li2p = mk();
await client.notes.document.set(nbId, pageId, {
  content: { type: 'rich_text', blocks: {
    [b1]: { id: b1, parentId: pageId, index: 'a0', type: 'heading1',
            content: [{ type: 'text', text: 'Deploy Steps' }] },
    [b2]: { id: b2, parentId: pageId, index: 'a1', type: 'paragraph',
            content: [{ type: 'text', text: 'Run the script below, then verify.' }] },
    [b3]: { id: b3, parentId: pageId, index: 'a2', type: 'codeBlock',
            attrs: { language: 'bash' },
            content: [{ type: 'text', text: './deploy.sh prod' }] },
    // bulleted list: bulletList -> listItem -> paragraph (text lives in the paragraph)
    [bl]:   { id: bl,   parentId: pageId, index: 'a3', type: 'bulletList' },
    [li1]:  { id: li1,  parentId: bl,  index: 'a0', type: 'listItem' },
    [li1p]: { id: li1p, parentId: li1, index: 'a0', type: 'paragraph',
              content: [{ type: 'text', text: 'Smoke-test /healthz' }] },
    [li2]:  { id: li2,  parentId: bl,  index: 'a1', type: 'listItem' },
    [li2p]: { id: li2p, parentId: li2, index: 'a0', type: 'paragraph',
              content: [{ type: 'text', text: 'Tag the release' }] },
  }},
});
```

### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```typescript
const doc = await client.notes.document.get(nbId, pageId);
const blocks = (doc.data!.content as any).blocks;
```

**Step 2 — mutate locally + PUT back.** Select the target block by its id (`B2` / `b2` from example 2) and leave every other block as it is; matching on `type` would also rewrite the paragraphs inside the list items. `index` orders a block among the children of the same parent only, by plain code-unit string comparison. The editor treats it as a fractional index, so give the block a key that sorts before its first sibling and is still a valid key: before `a0` that is `Zz`. An invalid key such as `_a0` is not stored as sent: a full-document PUT re-keys a sibling group that holds one when every sibling has a non-empty string `index` (fresh `a0`, `a1`, … in the current order, so the siblings' `index` values may change; read them back after the PUT); a block with a missing or empty `index` that is the only child of its parent gets `a0`, but a group of several blocks in which one has a missing or empty `index` is left as sent and the PUT is refused with `400`, and a PATCH that sends a new invalid index is refused with `400`.

```typescript
blocks[b2].index = 'Zz';   // sorts before the first sibling, a0
blocks[b2].content = [{ type: 'text', text: 'Updated intro paragraph (now first).' }];
await client.notes.document.set(nbId, pageId, { content: { type: 'rich_text', blocks } });
```

### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```typescript
delete blocks[b3];
await client.notes.document.set(nbId, pageId, { content: { type: 'rich_text', blocks } });
const after = await client.notes.document.get(nbId, pageId);
// Order siblings (here: the page's top-level blocks) by plain string comparison,
// as the editor does; localeCompare orders `Zz` and `a0` the other way round.
const order = (Object.values((after.data!.content as any).blocks) as any[])
  .filter((b) => b.parentId === pageId)
  .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
  .map((b) => b.type);
```

### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. Warning: `nodes.create` for `type:"database"` requires an `attributes.fields` map (`{}` is valid while the database has no columns yet). Without the map the kit answers `400 validation_error`, its `details` naming `/attributes/fields`; a permission failure is a `403`. Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```typescript
const db = await client.notes.nodes.create(nbId, {
  type: 'database', parentId: sec,
  attributes: {
    name: 'Tasks',
    fields: {
      f_status:   { id: 'f_status',   type: 'text',    name: 'Status',   index: 'a0' },
      f_priority: { id: 'f_priority', type: 'number',  name: 'Priority', index: 'a1' },
      f_done:     { id: 'f_done',     type: 'boolean', name: 'Done',     index: 'a2' },
    },
  },
});
const dbId = db.data!.id as string;
for (let i = 1; i <= 3; i++) {
  await client.notes.records.create(nbId, dbId, {
    name: `Task ${i}`,
    fields: {
      f_status:   { type: 'text',    value: 'todo' },
      f_priority: { type: 'number',  value: i },
      f_done:     { type: 'boolean', value: false },
    },
  });
}
```

### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. Warning: `filters` MUST be a **JSON array** (not an object) of filter entries: a field filter `{ id, type:"field", fieldId, operator, value }`, or a group `{ id, type:"group", operator:"and"|"or", filters:[…field filters] }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array). A schema-valid field filter that cannot be applied is ignored, so check that the result is actually filtered.

```typescript
const r = await client.notes.records.list(nbId, dbId, {
  filters: JSON.stringify([
    { id: 'f1', type: 'field', fieldId: 'f_priority', operator: 'is_greater_than', value: 1 },
  ]),
  sorts: JSON.stringify([
    { id: 's1', fieldId: 'f_priority', direction: 'desc' },
  ]),
  count: 50,
});
```

A simpler full-text alternative is `records.search?q=...` — no array shape, just a query string; matches the record `name` and each field's stored JSON, including type names and keys.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `records.update` PATCH MERGES `fields` (sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` with a `type` the column accepts: `text`, `select`, `date`, `phone` and `url` columns take `text` or `string`, `number` takes `number`, `boolean` takes `boolean`, and `multi_select`, `collaborator`, `file` and `relation` take `string_array`. Computed columns (`created_at`, `created_by`, `updated_at`, `updated_by`, `rollup`) cannot be set.

```typescript
const list = await client.notes.records.list(nbId, dbId, { count: 50 });
const recordId = (list.data as any).records.find((r: any) => r.name === 'Task 1').id;
await client.notes.records.update(nbId, dbId, recordId, {
  fields: {
    f_status: { type: 'text',    value: 'done' },
    f_done:   { type: 'boolean', value: true },
  },
});
```

### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `records.create` per row. The loops below split each line on commas, so they handle simple rows only, with no quoted values and no commas or newlines inside a value; for a real CSV file, use a CSV parser and check that each priority is a number. Warning: Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key that includes the database id and the row number (a key made from the name alone collides across databases and between rows with the same name; replay returns the saved response; same key + different payload returns `409`). From the SDK, pass it as `records.create`'s fourth argument: `{ idempotencyKey: key }`.

```typescript
import { createHash } from 'crypto';
// The rows to import: a header line, then name,priority,status per task
// (or read your own file with fs.readFileSync).
const csv = `name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress`;
const rows = csv.trim().split('\n').slice(1);
for (const [i, row] of rows.entries()) {
  const [name, pri, stat] = row.split(',');
  if (name === undefined || pri === undefined || stat === undefined) {
    throw new Error(`Expected name,priority,status: ${row}`);
  }
  const key = createHash('sha256').update(`import-2026-05-07:${dbId}:${i}:${name}`).digest('hex');
  // A rerun replays the saved response for the same key instead of adding a duplicate.
  await client.notes.records.create(nbId, dbId, {
    name,
    fields: {
      f_priority: { type: 'number',  value: Number(pri) },
      f_status:   { type: 'text',    value: stat },
      f_done:     { type: 'boolean', value: false },
    },
  }, { idempotencyKey: key });
}
```

### 9. Export a page to HTML — short-lived ticket flow

**Goal:** publish a static HTML snapshot of a page. `document.get` with `output: 'html'` requires a short-lived export `ticket` (markdown via `output: 'md'` does NOT — it returns text directly with no ticket). Each ticket allows 3 uses and expires after 2 minutes. Anyone with the kit URL and the ticket can download until the uses are spent or it expires, as long as the person who created it still has access to the page.

**Step 1 — create a ticket.**

```typescript
const t = await client.notes.document.createExportTicket(nbId, pageId, {
  output: 'html', themeMode: 'light', includeComments: 'appendix',
});
const ticket = t.data!.ticket;
```

**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```typescript
const html = await client.notes.document.get(nbId, pageId, { output: 'html', ticket });
// Markdown needs no ticket; `data` is the page as markdown text, not a document object.
const md = await client.notes.document.get(nbId, pageId, { output: 'md' });
console.log(md.data);
```

### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. The section and notebook steps are only for the separate notebook Example 1 created. If you wrote into the default notebook from `notes.whoami` (Example 1's alternative) or any other notebook you did not create here, delete only the records, the database and the page these examples created, and stop: deleting that notebook's `Home` section or the notebook itself removes content that was there before, including the shared default notebook's starter pages. Order matters: deleting a `section` cascades to every descendant page/database/record under it; other sections and their descendants remain. Then `notebooks.delete` removes the notebook itself.

`notebooks.delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `notebooks.list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```typescript
const recs = await client.notes.records.list(nbId, dbId, { count: 100 });
for (const r of recs.data!.records) {
  await client.notes.records.delete(nbId, dbId, r.id as string);
}
await client.notes.nodes.delete(nbId, dbId);
```

Then, in the default notebook or any notebook you did not create here, delete the page and stop:

```typescript
await client.notes.nodes.delete(nbId, pageId);
```

Or, only in the separate notebook Example 1 created, delete the section and the notebook:

```typescript
await client.notes.nodes.delete(nbId, sec);
try { await client.notes.notebooks.delete(nbId); }
catch { await client.notes.notebooks.update(nbId, { name: 'team-wiki-DELETED' }); }
```

## Reference

**Accessor:** `client.notes`  |  **Import:** `import * as notes from 'hoody-sdk/notes'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.notes.avatars.upload()` returns `Promise<NotesAvatarsUploadResponse>`. `data` is the request body; it has a row only where the row says more than the signature. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

**Services** (the ones the notes and examples above call most come first):

- `client.notes`: whoami
- `client.notes.document`: append, createExportTicket, exportBlock, get, set, update
- `client.notes.records`: create, delete, get, list, listAll, listIterator, search, update
- `client.notes.nodes`: create, delete, get, list, listAll, listChildren, listChildrenAll, listChildrenIterator, listIterator, listRecent, markOpened, markSeen, resolve, update
- `client.notes.notebooks`: create, delete, export, get, list, update, exportStream
- `client.notes.avatars`: download, upload
- `client.notes.collaborators`: add, list, remove, setRole
- `client.notes.comments`: create, delete, list, listAll, listAnchors, listAnchorsAll, listAnchorsIterator, listIterator, resolve, setAnchor, update
- `client.notes.files`: download, list, listAll, listIterator, classify, upload, resumeUpload
- `client.notes.files.uploads`: cancel, create, getOffset, writeChunk
- `client.notes.kit`: getCapabilities, getHealth
- `client.notes.members`: invite, setRole
- `client.notes.mutations`: sync
- `client.notes.reactions`: add, list, remove
- `client.notes.sockets`: connect, create
- `client.notes.versions`: create, delete, get, list, listAll, listIterator, restore

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |

### `client.notes` (1) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

#### `whoami` — Get current identity

```typescript
client.notes.whoami()
```

**HTTP:** `GET /api/v1/notes/me`
**CLI:** `hoody notes whoami`

---

### `client.notes.document` (6) — Document content of a node

**Shared parameters of `client.notes.document`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ifMatch` | `string` | header `If-Match` | No | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). An append that repeats an `X-Idempotency-Key` it already completed is answered from the stored response without checking `If-Match` again. |

#### `append` — Append blocks to a document

```typescript
client.notes.document.append(notebookId: string, nodeId: string, data: NotesDocumentAppendRequest, options?: { ifMatch?: string; idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409. |

**Body:** `{ text*: string, type: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"="paragraph", attrs: object|null } | { blocks*: object[] }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
**CLI:** `hoody notes document append --notebook-id <notebook-id> --node-id <node-id> --text <text>` (or `--blocks <blocks>` instead of `--text`: one of them is required)

---

#### `createExportTicket` — Create secure HTML export ticket

```typescript
client.notes.document.createExportTicket(notebookId: string, nodeId: string, data: NotesDocumentCreateExportTicketRequest)
```

**Body:** `{ output: "html"="html", includeComments: "none" | "appendix"="none", includeBackground: bool=true, themeMode: "light" | "dark"="dark", themeId: string|null, themeVariables: { [key: string]: string }, fileName: string }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket`
**CLI:** `hoody notes document exporttickets create --notebook-id <notebook-id> --node-id <node-id>`

---

#### `exportBlock` — Export drawing block as SVG

```typescript
client.notes.document.exportBlock(notebookId: string, nodeId: string, blockId: string, options?: { bg?: string; scale?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `bg` | `string` | query | No |  |
| `scale` | `number` | query | No |  |
| `blockId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg`
**CLI:** `hoody notes document blocks export --notebook-id <notebook-id> --node-id <node-id> --block-id <block-id>`

---

#### `get` — Read a notebook node's document. `output: 'md'` or `'html'` answers the rendered text; otherwise the document object.

```typescript
client.notes.document.get(notebookId: string, nodeId: string, options: { blockIds?: string; lines?: string; includeComments?: "none" | "appendix"; ticket?: string; ifNoneMatch?: string; output: "md" | "html" })  // → Promise<ApiResponse<string>>
client.notes.document.get(notebookId: string, nodeId: string, options?: { blockIds?: string; lines?: string; output?: "json" | "md" | "html"; includeComments?: "none" | "appendix"; ticket?: string; ifNoneMatch?: string })  // → Promise<NotesDocumentGetResponse>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `blockIds` | `string` | query | No |  |
| `lines` | `string` | query | No |  |
| `output` | `"md" \| "html" \| "json"` | query | form 1: Yes; form 2: No |  |
| `includeComments` | `"none" \| "appendix"` | query | No |  |
| `ticket` | `string` | query | No |  |
| `ifNoneMatch` | `string` | header `If-None-Match` | No | Optional (RFC 9110): ETags of copies the caller already holds, or `*`. When the document is still at one of them the JSON output answers 304 with no body. Ignored by the Markdown and HTML outputs. |

**Returns:** see each form above  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes document get --notebook-id <notebook-id> --node-id <node-id>`

---

#### `set` — Create or replace document

```typescript
client.notes.document.set(notebookId: string, nodeId: string, data: NotesDocumentSetRequest, options?: { ifMatch?: string })
```

**Body:** `{ content*: { [key: string]: any } }`

**HTTP:** `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes document set --notebook-id <notebook-id> --node-id <node-id> --content <content>`

---

#### `update` — Merge document content

```typescript
client.notes.document.update(notebookId: string, nodeId: string, data: NotesDocumentUpdateRequest, options?: { ifMatch?: string })
```

**Body:** `{ content*: { [key: string]: any } }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes document update --notebook-id <notebook-id> --node-id <node-id> --content <content>`

---

### `client.notes.records` (8) — Records of a database node

**Shared parameters of `client.notes.records`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |

#### `create` — Create a database record

```typescript
client.notes.records.create(notebookId: string, databaseId: string, data?: NotesRecordsCreateRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response instead of creating a second record. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Body:** `{ id: string, name: string="Untitled", avatar: string|null, fields: { [key: string]: object } }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records create --notebook-id <notebook-id> --database-id <database-id>`

---

#### `delete` — Delete a database record

```typescript
client.notes.records.delete(notebookId: string, databaseId: string, recordId: string)
```

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes records delete --notebook-id <notebook-id> --database-id <database-id> --record-id <record-id>`

---

#### `get` — Get a database record

```typescript
client.notes.records.get(notebookId: string, databaseId: string, recordId: string)
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes records get --notebook-id <notebook-id> --database-id <database-id> --record-id <record-id>`

---

#### `list` — List database records

```typescript
client.notes.records.list(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No | JSON-encoded array of filters. Each is a field filter { id, type: "field", fieldId, operator, value } or a group { id, type: "group", operator: "and" \| "or", filters }. The fieldId `name` filters on the record name. A filter on a field the database does not have is ignored. |
| `sorts` | `string` | query | No | JSON-encoded array of sorts, applied in order. Each is { id, fieldId, direction: "asc" \| "desc" }. The fieldId `name` sorts by the record name. A sort on a field the database does not have is ignored. |
| `page` | `number` | query | No |  |
| `count` | `number` | query | No |  |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records list --notebook-id <notebook-id> --database-id <database-id>`

---

#### `listAll` — List database records (collect all pages)

```typescript
client.notes.records.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<NotesRecordsListResponse>[]>` — every item of `data.records`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `{ [key: string]: any }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records list --notebook-id <notebook-id> --database-id <database-id>`

---

#### `listIterator` — List database records (async iterator)

```typescript
client.notes.records.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<NotesRecordsListResponse>, void, unknown>` — one item of `data.records` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `{ [key: string]: any }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records list --notebook-id <notebook-id> --database-id <database-id>`

---

#### `search` — Search database records

```typescript
client.notes.records.search(notebookId: string, databaseId: string, options?: { q?: string; exclude?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `q` | `string` | query | No | Text to find in the record name or in any field value (substring match; ASCII letters match in any case). A field value is matched as its JSON text, such as {"type":"string","value":"Q3"}, so a query can also match a field type name. Empty returns all records except those specified in `exclude`. |
| `exclude` | `string` | query | No |  |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`
**CLI:** `hoody notes records search --notebook-id <notebook-id> --database-id <database-id>`

---

#### `update` — Update a database record

```typescript
client.notes.records.update(notebookId: string, databaseId: string, recordId: string, data?: NotesRecordsUpdateRequest)
```

**Body:** `{ name: string, avatar: string|null, fields: { [key: string]: object } }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes records update --notebook-id <notebook-id> --database-id <database-id> --record-id <record-id>`

---

### `client.notes.nodes` (14) — Nodes: pages, folders and databases

#### `create` — Create a node

```typescript
client.notes.nodes.create(notebookId: string, data: NotesNodesCreateRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key (max 256 chars), such as a random UUID per node. Reusing the same key with an identical request body replays the original response instead of creating a second node; reusing it with a different body returns 409. |

**Body:** `{ id: string, type*: string, parentId: string, attributes*: { [key: string]: any } }`

- `attributes` — … Attributes that do not fit the type answer `400` with code `validation_error`, and `details` names each field.

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes create --notebook-id <notebook-id> --type <type> --attributes <attributes>`

---

#### `delete` — Delete a node

```typescript
client.notes.nodes.delete(notebookId: string, nodeId: string)
```

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes nodes delete --notebook-id <notebook-id> --node-id <node-id>`

---

#### `get` — Get a node

```typescript
client.notes.nodes.get(notebookId: string, nodeId: string)
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes nodes get --notebook-id <notebook-id> --node-id <node-id>`

---

#### `list` — List nodes

```typescript
client.notes.nodes.list(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `string` | query | No |  |
| `parentId` | `string` | query | No |  |
| `rootId` | `string` | query | No |  |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes list --notebook-id <notebook-id>`

---

#### `listAll` — List nodes (collect all pages)

```typescript
client.notes.nodes.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<NotesNodesListResponse>[]>` — every item of `data.nodes`, pages collected from the offset you pass, 0 by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes list --notebook-id <notebook-id>`

---

#### `listChildren` — List child nodes

```typescript
client.notes.nodes.listChildren(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes nodes children list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listChildrenAll` — List child nodes (collect all pages)

```typescript
client.notes.nodes.listChildrenAll(/* the arguments of listChildren */)
```

**Returns:** `Promise<Item<NotesNodesListChildrenResponse>[]>` — every item of `data.nodes`, pages collected from the offset you pass, 0 by default (`listChildren()` fetches one page). Each item is `{ [key: string]: any }`. `listChildrenIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes nodes children list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listChildrenIterator` — List child nodes (async iterator)

```typescript
client.notes.nodes.listChildrenIterator(/* the arguments of listChildren */)
```

**Returns:** `AsyncGenerator<Item<NotesNodesListChildrenResponse>, void, unknown>` — one item of `data.nodes` per step, the next page fetched on demand from the offset you pass, 0 by default (`listChildren()` fetches one page). Each item is `{ [key: string]: any }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes nodes children list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listIterator` — List nodes (async iterator)

```typescript
client.notes.nodes.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<NotesNodesListResponse>, void, unknown>` — one item of `data.nodes` per step, the next page fetched on demand from the offset you pass, 0 by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes list --notebook-id <notebook-id>`

---

#### `listRecent` — List recently changed pages

```typescript
client.notes.nodes.listRecent(notebookId: string, options?: { limit?: number })
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/recent`

---

#### `markOpened` — Mark node as opened

```typescript
client.notes.nodes.markOpened(notebookId: string, nodeId: string, data: NotesNodesMarkOpenedRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without recording the open again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Body:** `{ openedAt: string }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`
**CLI:** `hoody notes nodes markopened --notebook-id <notebook-id> --node-id <node-id>`

---

#### `markSeen` — Mark node as seen

```typescript
client.notes.nodes.markSeen(notebookId: string, nodeId: string, data: NotesNodesMarkSeenRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without recording the view again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Body:** `{ seenAt: string }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`
**CLI:** `hoody notes nodes markseen --notebook-id <notebook-id> --node-id <node-id>`

---

#### `resolve` — Resolve page by alias

```typescript
client.notes.nodes.resolve(notebookId: string, alias: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `alias` | `string` | path | Yes |  |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}`
**CLI:** `hoody notes nodes resolve --notebook-id <notebook-id> --alias <alias>`

---

#### `update` — Update a node

```typescript
client.notes.nodes.update(notebookId: string, nodeId: string, data: NotesNodesUpdateRequest)
```

**Body:** `{ attributes*: { [key: string]: any } }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes nodes update --notebook-id <notebook-id> --node-id <node-id> --attributes <attributes>`

---

### `client.notes.notebooks` (6) — Notebooks

#### `create` — Create a notebook

```typescript
client.notes.notebooks.create(data: NotesNotebooksCreateRequest)
```

**Body:** `{ name*: string, description: string|null, avatar: string|null }`

**HTTP:** `POST /api/v1/notes/notebooks`
**CLI:** `hoody notes notebooks create --name <name>`

---

#### `delete` — Delete a notebook

```typescript
client.notes.notebooks.delete(notebookId: string)
```

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebooks delete --notebook-id <notebook-id>`

---

#### `export` — Export notes as a ZIP

```typescript
client.notes.notebooks.export(notebookId: string, options?: { nodeId?: string; format?: "md" | "html"; attachments?: "true" | "false"; comments?: "none" | "appendix"; themeMode?: "light" | "dark"; dryRun?: "true" | "false" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `nodeId` | `string` | query | No |  |
| `format` | `"md" \| "html"` | query | No |  |
| `attachments` | `"true" \| "false"` | query | No |  |
| `comments` | `"none" \| "appendix"` | query | No |  |
| `themeMode` | `"light" \| "dark"` | query | No |  |
| `dryRun` | `"true" \| "false"` | query | No |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/export`
**CLI:** `hoody notes notebooks export --notebook-id <notebook-id>`

---

#### `get` — Get notebook details

```typescript
client.notes.notebooks.get(notebookId: string)
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebooks get --notebook-id <notebook-id>`

---

#### `list` — List notebooks

```typescript
client.notes.notebooks.list()
```

**HTTP:** `GET /api/v1/notes/notebooks`
**CLI:** `hoody notes notebooks list`

---

#### `update` — Update notebook settings

```typescript
client.notes.notebooks.update(notebookId: string, data: NotesNotebooksUpdateRequest)
```

**Body:** `{ name*: string, description: string|null, avatar: string|null }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebooks update --notebook-id <notebook-id> --name <name>`

---

#### `exportStream` — Start a ZIP export and return the raw Response (body unread).

```typescript
client.notes.notebooks.exportStream(notebookId: string, query?: NotesExportQuery, templateVars?: TemplateVars, options?: NotesExportOptions)
```

**Returns:** `Promise<Response>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.notes.avatars` (2) — Avatar images

#### `download` — Download an avatar image

```typescript
client.notes.avatars.download(avatarId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `avatarId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/avatars/{avatarId}`
**CLI:** `hoody notes avatars download --avatar-id <avatar-id>`

---

#### `upload` — Upload an avatar image

```typescript
client.notes.avatars.upload(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, requestOptions?: { contentType?: 'image/jpeg' | 'image/png' | 'image/webp' })
```

**HTTP:** `POST /api/v1/notes/avatars`
**CLI:** `hoody notes avatars upload`

---

### `client.notes.collaborators` (4) — Collaborators on a node

#### `add` — Add a collaborator

```typescript
client.notes.collaborators.add(notebookId: string, nodeId: string, data: NotesCollaboratorsAddRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without adding the collaborator again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Body:** `{ collaboratorId*: string, role*: "admin" | "editor" | "collaborator" | "viewer" }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`
**CLI:** `hoody notes collaborators add --notebook-id <notebook-id> --node-id <node-id> --collaborator-id <collaborator-id> --role <role>`

---

#### `list` — List collaborators

```typescript
client.notes.collaborators.list(notebookId: string, nodeId: string)
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`
**CLI:** `hoody notes collaborators list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `remove` — Remove a collaborator

```typescript
client.notes.collaborators.remove(notebookId: string, nodeId: string, collaboratorId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `collaboratorId` | `string` | path | Yes |  |

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`
**CLI:** `hoody notes collaborators remove --notebook-id <notebook-id> --node-id <node-id> --collaborator-id <collaborator-id>`

---

#### `setRole` — Update collaborator role

```typescript
client.notes.collaborators.setRole(notebookId: string, nodeId: string, collaboratorId: string, data: NotesCollaboratorsSetRoleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `collaboratorId` | `string` | path | Yes |  |

**Body:** `{ role*: "admin" | "editor" | "collaborator" | "viewer" }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`
**CLI:** `hoody notes collaborators role set --notebook-id <notebook-id> --node-id <node-id> --collaborator-id <collaborator-id> --role <role>`

---

### `client.notes.comments` (11) — Comments on a node

**Shared parameters of `client.notes.comments`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `commentId` | `string` | path | Yes |  |

#### `create` — Create a comment

```typescript
client.notes.comments.create(notebookId: string, nodeId: string, data: NotesCommentsCreateRequest)
```

**Body:** `{ content*: string, parentId: string, anchorBlockId: string, anchor: object }`

- `parentId` — ID of the root comment to reply to. Replies go one level deep: a reply to a reply, or to a resolved thread, returns 409 with code bad_request. A reply takes its thread's anchor; an anchor sent with it is ignored by default.

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments create --notebook-id <notebook-id> --node-id <node-id> --content <content>`

---

#### `delete` — Delete a comment

```typescript
client.notes.comments.delete(notebookId: string, nodeId: string, commentId: string, options?: { expectedVersion?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `expectedVersion` | `number` | query | No |  |

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`
**CLI:** `hoody notes comments delete --notebook-id <notebook-id> --node-id <node-id> --comment-id <comment-id>`

---

#### `list` — List comments

```typescript
client.notes.comments.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `cursor` | `string` | query | No | The nextCursor of the previous page. While cursor pagination is turned off (the default), a non-empty cursor returns 409 with code bad_request. While it is on, a non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listAll` — List comments (collect all pages)

```typescript
client.notes.comments.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<NotesCommentsListResponse>[]>` — every item of `data.comments`, pages collected from the offset you pass, 0 by default (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listAnchors` — List comment anchors

```typescript
client.notes.comments.listAnchors(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `cursor` | `string` | query | No | The nextCursor of the previous page. A non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. While comment anchors are turned off (the default), the endpoint returns 409 with code bad_request whatever the cursor. |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comments anchors list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listAnchorsAll` — List comment anchors (collect all pages)

```typescript
client.notes.comments.listAnchorsAll(/* the arguments of listAnchors */)
```

**Returns:** `Promise<Item<NotesCommentsListAnchorsResponse>[]>` — every item of `data.anchors`, pages collected from the offset you pass, 0 by default (`listAnchors()` fetches one page). `listAnchorsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comments anchors list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listAnchorsIterator` — List comment anchors (async iterator)

```typescript
client.notes.comments.listAnchorsIterator(/* the arguments of listAnchors */)
```

**Returns:** `AsyncGenerator<Item<NotesCommentsListAnchorsResponse>, void, unknown>` — one item of `data.anchors` per step, the next page fetched on demand from the offset you pass, 0 by default (`listAnchors()` fetches one page).  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comments anchors list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listIterator` — List comments (async iterator)

```typescript
client.notes.comments.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<NotesCommentsListResponse>, void, unknown>` — one item of `data.comments` per step, the next page fetched on demand from the offset you pass, 0 by default (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `resolve` — Resolve a comment

```typescript
client.notes.comments.resolve(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsResolveRequest)
```

**Body:** `{ expectedVersion: int }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve`
**CLI:** `hoody notes comments resolve --notebook-id <notebook-id> --node-id <node-id> --comment-id <comment-id>`

---

#### `setAnchor` — Re-anchor a comment thread

```typescript
client.notes.comments.setAnchor(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsSetAnchorRequest)
```

**Body:** `{ anchor*: object, expectedVersion: int }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`
**CLI:** `hoody notes comments anchors set --notebook-id <notebook-id> --node-id <node-id> --comment-id <comment-id> --anchor-type <anchor-type>`

---

#### `update` — Edit a comment

```typescript
client.notes.comments.update(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsUpdateRequest)
```

**Body:** `{ content*: string, expectedVersion: int }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`
**CLI:** `hoody notes comments update --notebook-id <notebook-id> --node-id <node-id> --comment-id <comment-id> --content <content>`

---

### `client.notes.files` (4) — File attachments

#### `download` — Download a file

```typescript
client.notes.files.download(notebookId: string, fileId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `fileId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}`
**CLI:** `hoody notes files download --notebook-id <notebook-id> --file-id <file-id>`

---

#### `list` — List all uploaded files

```typescript
client.notes.files.list(notebookId: string, options?: { limit?: number; offset?: number })
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes files list --notebook-id <notebook-id>`

---

#### `listAll` — List all uploaded files (collect all pages)

```typescript
client.notes.files.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<NotesFilesListResponse>[]>` — every item of `data.files`, pages collected from the offset you pass, 0 by default (`list()` fetches one page). Each item is `{ id*: string, name*: string, mimeType*: string, size*: number, createdAt*: string, createdBy*: string, documentId*: string, documentName*: string|null }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes files list --notebook-id <notebook-id>`

---

#### `listIterator` — List all uploaded files (async iterator)

```typescript
client.notes.files.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<NotesFilesListResponse>, void, unknown>` — one item of `data.files` per step, the next page fetched on demand from the offset you pass, 0 by default (`list()` fetches one page). Each item is `{ id*: string, name*: string, mimeType*: string, size*: number, createdAt*: string, createdBy*: string, documentId*: string, documentName*: string|null }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes files list --notebook-id <notebook-id>`

---

#### `classify` — SDK helper

```typescript
client.notes.files.classify(filepath: string)
```

**Returns:** `'renderable' | 'binary' | 'text'`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `upload` — Create a file node under `parentId` and upload its bytes over TUS.

```typescript
client.notes.files.upload(notebookId: string, data: NotesUploadData, options: NotesUploadFileOptions, templateVars?: TemplateVars)
```

**Returns:** `Promise<NotesUploadFileResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `resumeUpload` — Continue an interrupted upload with the same bytes, from the offset the server reports (`uploads.getOffset`).

```typescript
client.notes.files.resumeUpload(notebookId: string, fileId: string, data: NotesUploadData, options?: NotesChunkOptions & { metadata?: Record<string, string> }, templateVars?: TemplateVars)
```

**Returns:** `Promise<NotesUploadResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.notes.files.uploads` (4) — files

**Shared parameters of `client.notes.files.uploads`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `fileId` | `string` | path | Yes |  |
| `tusResumable` | `"1.0.0"` | header `Tus-Resumable` | Yes | TUS protocol version. Every TUS request must send `1.0.0`: a missing header is refused with 412, any other value with 400. |

#### `cancel` — Abort a TUS upload

```typescript
client.notes.files.uploads.cancel(notebookId: string, fileId: string, options: { tusResumable: "1.0.0" })
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `create` — Create a resumable (TUS) upload

```typescript
client.notes.files.uploads.create(notebookId: string, fileId: string, options: { tusResumable: "1.0.0"; uploadLength: number; uploadMetadata?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `uploadLength` | `number` | header `Upload-Length` | Yes | Total size of the file in bytes. Must equal the file node's `size` (set when the node was created), which must not exceed the notebook's maximum file size. Upload-Defer-Length is not supported. |
| `uploadMetadata` | `string` | header `Upload-Metadata` | No | Optional TUS metadata: comma-separated `key base64(value)` pairs. |

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `getOffset` — Check a TUS upload's offset (for resuming)

```typescript
client.notes.files.uploads.getOffset(notebookId: string, fileId: string, options: { tusResumable: "1.0.0" })
```

**Returns:** `Promise<ApiResponse<Record<string, string>>>`  |  **HTTP:** `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `writeChunk` — Upload a chunk to a TUS upload

```typescript
client.notes.files.uploads.writeChunk(notebookId: string, fileId: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { tusResumable: "1.0.0"; uploadOffset: number; contentType?: 'application/offset+octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `uploadOffset` | `number` | header `Upload-Offset` | Yes | Offset this chunk starts at: the value the HEAD check (or the previous chunk) returned. |

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

### `client.notes.kit` (2) — health

#### `getCapabilities` — Optional features of this server

```typescript
client.notes.kit.getCapabilities()
```

**HTTP:** `GET /api/v1/notes/capabilities`

---

#### `getHealth` — Service health and runtime info

```typescript
client.notes.kit.getHealth()
```

**HTTP:** `GET /api/v1/notes/health`
**CLI:** `hoody notes health`

---

### `client.notes.members` (2) — Notebook members

#### `invite` — Invite users to notebook

```typescript
client.notes.members.invite(notebookId: string, data: NotesMembersInviteRequest)
```

**Body:** `{ users*: { username*: string, role*: "owner" | "admin" | "collaborator" | "guest" | "none" }[] }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/users`
**CLI:** `hoody notes members invite --notebook-id <notebook-id> --users <users>`

---

#### `setRole` — Update user role

```typescript
client.notes.members.setRole(notebookId: string, userId: string, data: NotesMembersSetRoleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `userId` | `string` | path | Yes |  |

**Body:** `{ role*: "owner" | "admin" | "collaborator" | "guest" | "none" }`

**HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role`
**CLI:** `hoody notes members role set --notebook-id <notebook-id> --user-id <user-id> --role <role>`

---

### `client.notes.mutations` (1) — mutations

#### `sync` — Sync client mutations

```typescript
client.notes.mutations.sync(notebookId: string, data: NotesMutationsSyncRequest)
```

**Body:** `{ mutations*: object[] }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/mutations`

---

### `client.notes.reactions` (3) — Emoji reactions on a node

#### `add` — Add a reaction

```typescript
client.notes.reactions.add(notebookId: string, nodeId: string, data: NotesReactionsAddRequest, options?: { idempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `idempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without adding the reaction again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Body:** `{ reaction*: string }`

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`
**CLI:** `hoody notes reactions add --notebook-id <notebook-id> --node-id <node-id> --reaction <reaction>`

---

#### `list` — List reactions

```typescript
client.notes.reactions.list(notebookId: string, nodeId: string)
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`
**CLI:** `hoody notes reactions list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `remove` — Remove a reaction

```typescript
client.notes.reactions.remove(notebookId: string, nodeId: string, reaction: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `reaction` | `string` | path | Yes |  |

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}`
**CLI:** `hoody notes reactions remove --notebook-id <notebook-id> --node-id <node-id> --reaction <reaction>`

---

### `client.notes.sockets` (2) — sockets

#### `connect` — Open a WebSocket connection

```typescript
client.notes.sockets.connect(socketId: string, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, requestOptions?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `socketId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesSocketsConnectWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/notes/sockets/{socketId}`

---

#### `create` — Initialize a WebSocket session

```typescript
client.notes.sockets.create()
```

**HTTP:** `POST /api/v1/notes/sockets`

---

### `client.notes.versions` (7) — Document version snapshots

**Shared parameters of `client.notes.versions`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `versionId` | `string` | path | Yes |  |

#### `create` — Create a document version snapshot

```typescript
client.notes.versions.create(notebookId: string, nodeId: string)
```

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions create --notebook-id <notebook-id> --node-id <node-id>`

---

#### `delete` — Delete a document version

```typescript
client.notes.versions.delete(notebookId: string, nodeId: string, versionId: string)
```

**HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`
**CLI:** `hoody notes versions delete --notebook-id <notebook-id> --node-id <node-id> --version-id <version-id>`

---

#### `get` — Get a specific document version

```typescript
client.notes.versions.get(notebookId: string, nodeId: string, versionId: string)
```

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`
**CLI:** `hoody notes versions get --notebook-id <notebook-id> --node-id <node-id> --version-id <version-id>`

---

#### `list` — List document versions

```typescript
client.notes.versions.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; beforeRevision?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `beforeRevision` | `number` | query | No | Only versions with a lower revision. Pass the lowest revision you already have to get the next page: unlike offset it stays correct while versions are added or deleted. Combines with offset (normally 0). |

**HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listAll` — List document versions (collect all pages)

```typescript
client.notes.versions.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<NotesVersionsListResponse>[]>` — every item of `data.versions`, pages collected from the offset you pass, 0 by default (`list()` fetches one page). Each item is `{ id*: string, documentId*: string, revision*: number, createdAt*: string, createdBy*: string }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `listIterator` — List document versions (async iterator)

```typescript
client.notes.versions.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<NotesVersionsListResponse>, void, unknown>` — one item of `data.versions` per step, the next page fetched on demand from the offset you pass, 0 by default (`list()` fetches one page). Each item is `{ id*: string, documentId*: string, revision*: number, createdAt*: string, createdBy*: string }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions list --notebook-id <notebook-id> --node-id <node-id>`

---

#### `restore` — Restore a document version

```typescript
client.notes.versions.restore(notebookId: string, nodeId: string, versionId: string)
```

**HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`
**CLI:** `hoody notes versions restore --notebook-id <notebook-id> --node-id <node-id> --version-id <version-id>`

