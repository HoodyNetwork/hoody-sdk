> _**CLI skill · `notes` namespace** · ~15,142 tokens · hoody-sdk v1.0.1_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-computer notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, computer fs → `files`, desktop notifs → `notifications`, cross-computer identity → `api`, scheduled writes → `cron`.

## Prerequisites

- **To add a note, create a page in a notebook you already have; do not create a notebook for it.** Your default notebook (the `notebookId` from `hoody notes whoami`) and every new notebook start with a `Home` section; in an older notebook it may have been renamed or deleted, so then use any section you can edit. A page is `hoody notes nodes create` with `type:"page"`, `parentId:<Home section id>` (from `hoody notes nodes list` with `type:"section"`) and `attributes:{name}`; then write its text with `hoody notes document append`.
- `notebookId` on every notebook-scoped call (identity and notebook list/create take none). Notebook-scoped commands fall back to your default notebook when `--notebook-id` is omitted. Without a Bearer token or export ticket, identity comes from the `?username=` / `?role=` query parameters on each request (default username `user`, default role `owner`). The first request for a username adds that user to the computer's single shared default notebook (`Hoody Notes`); every query-identity user joins that same notebook, so it is not private. A readonly default notebook takes no new usernames: they get role `none` (see Quirks). Use `hoody notes notebooks create` for a separate notebook.
- `hoody notes document append`, `nodes create`, `records create`, `collaborators add`, `reactions add`, `nodes markopened` and `nodes markseen` take `--idempotency-key <key>`, so the recommended document-writing path, node creation and record creation are retry-safe from the CLI. Notebook create, comment create and version create ignore that header, so retrying those can create duplicates. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `hoody notes document set`/`hoody notes document update`/`hoody notes document append` reject viewers and read-only collaborators with `403`. Documents attach only to `page` and `record` nodes; `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `hoody notes nodes list` `type:"section"` → pick `Home` → `hoody notes nodes create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `hoody notes document append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `hoody notes document set`. Creates the document if absent; pass an idempotency key (`--idempotency-key`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `hoody notes whoami` → `{userId,username,role,notebookId}`. The `notebookId` is the computer's shared default notebook (`Hoody Notes`, with a `Home` section and starter pages), which every query-identity username joins; create a separate notebook with `hoody notes notebooks create` to manage a separate membership list. Query identity does not authenticate usernames, so a separate notebook alone does not keep content private from callers who can reach the kit. `hoody notes notebooks create` does not check the caller's role and makes the caller the new notebook's owner. `hoody notes notebooks list` needs a membership row matching the identity (else `403`) and returns the active or readonly notebooks where that username's role is not `none`. `hoody notes notebooks get` needs a non-`none` membership; `update`/`delete` are owner-gated.
3. **Build a structured document with `hoody notes document set`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `hoody notes document set` OVERWRITES the whole document; `hoody notes document update` merges: top-level keys replace the stored ones, and `content.blocks` merges by block id (each sent block replaces the stored block with that id wholesale, omitted blocks are kept; removing a block takes `hoody notes document set`). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real block `type` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 2.
4. **Database CRUD** — `hoody notes nodes create` `type:"database"`; then `hoody notes records create`/`hoody notes records list`/`hoody notes records search`/`hoody notes records update` (merges `fields`)/`hoody notes records delete`. `hoody notes records list` walks pages automatically, up to 10000 records; `--count N` caps the total returned rather than setting the request page size.
5. **Collaborators, comments + versions** — before sharing a node with someone new to the notebook, call `hoody notes members invite --notebook-id <notebookId> --users <users>`, check the returned `errors`, and use the created user's `id` as the `collaboratorId` for `hoody notes collaborators add` (`admin`/`editor`/`collaborator`/`viewer`; managing node collaborators needs admin permission): a collaborator who is not yet a member of that notebook is refused with `404 user_not_found`. Inviting users needs the notebook owner or an admin (anyone else gets `403 user_invite_no_access`), so a node admin without that notebook role asks one of them to invite the person first. Collaborators attach to a section, or to a channel that has a collaborator list, not to a page: `hoody notes collaborators add` on a page, database or other node answers `400 bad_request` (`This node type does not support collaborators.`), so share the section that holds it. `hoody notes comments create` (top-level, anchored, or reply); `hoody notes comments update` / `hoody notes comments delete` / `hoody notes comments resolve` accept optional `expectedVersion` for optimistic concurrency. Re-anchoring a thread (`hoody notes comments anchors set`) is disabled by default and answers `409` (`Comment re-anchor is disabled.`); leave the comment where it is, or delete it and create it again on the block you want. `hoody notes versions create`/`list`/`get`/`hoody notes versions restore`.
6. **TUS upload + download** — the `fileId` is an input, not something the upload returns. First create the file node yourself: `hoody notes nodes create` with `type: 'file'` (without an `id`, the kit gives the node a file id, which ends in `18`, the only shape the upload routes accept; an `id` you pass yourself must be 22 lowercase hex chars + `'18'`), `parentId` (a node where you have editor rights), and `attributes: { subtype: 'image'|'video'|'audio'|'pdf'|'other', name, originalName, mimeType, extension: '' or '.ext', size, version: <22 lowercase hex chars> + '03', status: 0 }`. Only that node's creator can upload to it. Then run the TUS calls on that id. Send `Tus-Resumable: 1.0.0` on every one of them (POST, PATCH, HEAD and DELETE). Once the request reaches TUS validation, a missing or empty header is refused with `412`, and any other value with `400` (`file_upload_invalid_request` where a body is returned). On `…/files/{fileId}/tus`: create the upload with `POST` and an `Upload-Length` equal to the file node's `size` in bytes (a different or deferred length is refused with `400 file_size_mismatch`), send chunks with `PATCH` plus `Upload-Offset` and `Content-Type: application/offset+octet-stream`, check the resume offset with `HEAD`, or cancel with `DELETE`. Download with `hoody notes files download`. The CLI has no TUS commands (`hoody notes files` only lists and downloads), so upload over HTTP.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — a value the kit cannot repair stores silently but renders blank.** The valid block types are: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` and `database` (an embedded database view) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. `hoody notes document set` and `hoody notes document update` repair the unambiguous mistakes before validating: known type aliases (`code`, `quote`, `bullet_list_item`, `numbered_list_item`, `h1`, …) become the real type, with flat list items wrapped in a list, and `props` becomes `attrs` when the block has no `attrs`. Other write paths skip this repair, and it leaves anything ambiguous alone (an unknown type, a bare `list_item`). The block schema is loose (`type:z.string()`, `attrs:z.record`), so an unrepaired bad `type`/`props` is accepted with `200` and stored — the block is validated on the way in, but the ORIGINAL object is what gets written, so the junk key persists — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container block's id. `hoody notes document set`/`hoody notes document update` move text found directly on a container block with no children into a new child paragraph, but text on a container block that already has children is left there and renders empty. See §Examples 0 and 2 for the exact nesting.
- **Prefer `hoody notes document append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types that do not support documents (only `page`/`record` do) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected); `horizontalRule` only in the `blocks` form, since the `{text}` form takes `paragraph`, `heading1-3` and `codeBlock` only.
- **`hoody notes document set` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **A page needs a parent and a `name`: `hoody notes nodes create` with `type:"page"`, `parentId` and `attributes.name`.** The parent is the `Home` section (its id from `hoody notes nodes list` with `type:"section"`) or another page you can edit; in flags: `--type page --parent-id "$SEC" --attributes name=Runbook`, with `$SEC` holding the section's id. With no `parentId` the kit answers `400 parent_required`: add the parent rather than creating a notebook. A `403 forbidden` is a real permission refusal (your role on the parent does not allow the create). The label is `name`; there is no `title` attribute, and a page without `name` is refused with `400 validation_error`, its `details` naming `/attributes/name`.
- **`hoody notes nodes create` checks `attributes` against the type's schema and answers `400 validation_error` when they do not fit.** `details` lists each failing field as a JSON Pointer `path` (such as `/attributes/name` or `/attributes/fields`) with a `message`, the message names the same fields, and nothing is written. The check runs after the permission check, so a parent you cannot edit gives `403` whatever the attributes hold. An unknown type or a `parentId` that does not exist gives `400`; no `parentId` for a node that needs one gives `400 parent_required`. A section is root-only (a `parentId` gives `400 section_must_be_root`). When you create a section without `attributes.collaborators`, the server adds you as `admin`; a section collaborator map you send yourself must be a map of user ids to roles, or the create is a `400 validation_error` naming `/attributes/collaborators` (this shape is checked before the permission check), and it must name you as `admin`, or the create is a `403`. For a note, reuse the auto-provisioned `Home` section.
- **`hoody notes notebooks create` always makes a new, separate notebook; it is not how you add a note.** It takes only `name` (plus optional `description`/`avatar`) and no parent: a notebook is top-level. It ignores `X-Idempotency-Key`, and names are not unique, so a retry or a second call with the same name makes a duplicate. Run `hoody notes notebooks list` first and reuse a notebook that has the name; to add a note, create a page in an existing notebook with `hoody notes nodes create`.
- **`hoody notes document set` and `hoody notes document update` take a rich-text document as one JSON document: `--content @/tmp/content.json`, `--content @-` for standard input, or the JSON inline.** The document is the content object itself, such as `{"type":"rich_text","blocks":{…}}`, without an outer `content` key; its values are sent as written, nested blocks included. `--content KEY=VALUE` sends each value as a plain string, which no document accepts (`set` is refused with `400`, `update` stores an extra key the page never shows). For plain text, `hoody notes document append --node-id "$PAGE" --text '…' --type paragraph`, where `$PAGE` is the page's node id, is simpler.
- **`hoody notes records create` and `hoody notes records update` take typed field values.** Each `--fields` VALUE is JSON, the `{type, value}` object keyed by the field id: `--fields 'f_done={"type":"boolean","value":true}'` (repeat the flag per field), or `--fields @/tmp/fields.json` for the whole fields map. A bare value such as `f_done=true` is not a field value and is refused.
- **Upload an avatar with `hoody --computer "$C" notes avatars upload --input /tmp/avatar.jpg`** (or pipe the bytes on stdin). The body is the raw JPEG, PNG or WebP image, and the CLI sets `Content-Type` from the file's bytes; the response carries the avatar id for `--avatar`.
- Authentication re-anchors identity to the `notebookId` in the URL, so one bearer token reaches any notebook the username has joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` (HTTP only; no CLI command) route + WS feed: each mutation type (`type: 'document.update'`, `type: 'node.create'`, etc.) is dispatched server-side to a SQL-backed lib function. The document PUT (full overwrite) is a last-writer-wins overwrite of the same store. The document PATCH re-applies its merge to the current document when a concurrent write lands first, so two PATCHes that send different blocks both survive; two that send the same block id are last-writer-wins for that block, and a document PUT racing a PATCH still overwrites whatever it omits.
- `hoody notes whoami` with `?username=&role=` (HTTP only: `hoody notes whoami` has no such options) does NOT create a per-user notebook: the first request for a username adds that user to the computer's single shared default notebook (`Hoody Notes`, seeded with starting content) with the role from that request (default `owner`), and notebook routes then use that stored role (role `none` is refused `403 notebook_no_access` on notebook-scoped routes, while `hoody notes whoami` itself still answers with role `none`). Every query-identity username shares that notebook. Create a separate notebook to manage a separate membership list; query identity does not authenticate usernames, so a separate notebook alone does not keep content private from callers who can reach the kit. When that default notebook is readonly, a username it does not hold yet is not added: `hoody notes whoami` answers with role `none`, the default notebook's routes answer `403 notebook_no_access`, and no row is written; a username that is already a member keeps its stored role and can still read and export. The `username` and `role` query parameters are read by the identity hook on every route except `/health` and `/capabilities` but are not listed in the generated Reference; `ticket` is listed for the document export. The spec also declares all three as query security schemes (`notesIdentityUsername`, `notesIdentityRole`, `notesExportTicket`). Priority Bearer → `ticket` → `?username=&role=`. Only a notes Bearer token (base64url JSON with `userId`, `notebookId`, `username`, `role`) is read: one that decodes to a JSON object but is malformed returns `401` with no fallback, while a JWT, an opaque token or another scheme is ignored and resolution continues with `ticket` or the query identity. An export `ticket` is accepted only on the HTML document export (`GET …/document?output=html`); on any other route behind the hook, a non-empty `ticket` sent without a valid notes Bearer token is a `400`. **Without a notes Bearer token, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=<name>` on every unauthenticated call, or attach a valid notes Bearer identity. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes** — content reads still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`. The TUS upload route refuses every method on a readonly notebook, the `HEAD` offset check included.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409. Only routes that implement it honour the header (see Prerequisites); notebook create does not.
- `hoody notes records update` merges `fields`. Database access uses the shared node-access check: it starts from your collaboration on the notebook **root** node (or your notebook role when there is none), returns `403` if an ancestor is a private `section` or a `channel` whose `collaborators` map omits you, and then applies the deepest explicit collaboration on the database's ancestor chain, so a role granted lower in the tree overrides the root one. Notebook owners/admins skip the privacy checks and keep their root-level role (their explicit collaboration on the root section when they have one, otherwise their notebook role). A root collaboration alone is therefore NOT sufficient under such an ancestor, and a write refusal can come from a deeper collaboration. A guest gets no role from the notebook, so without a collaboration on the root section the check answers `403` before deeper collaborations count. TUS validates `fileId` against the generated file-id regex (22 lowercase hex chars + `18`); a free-form file id → 400 `file_not_found`. An unknown `notebookId` is `404 notebook_not_found` from the notebook check, before the TUS route runs.
- `hoody notes document get` with `--format html` needs a short-lived export `ticket` (3 uses, 2 minutes). `hoody notes document set` overwrites; `hoody notes document update` merges: top-level keys replace the stored ones, and `content.blocks` (a map by block id, or a list of blocks with distinct ids) merges by block id — a sent block replaces the stored block with that id, every other block is kept, and removing blocks takes a `hoody notes document set`. Any other `blocks` shape is a `400`. `hoody notes comments update` / `hoody notes comments delete` / `hoody notes comments resolve` accept optional `expectedVersion`.
- **`hoody notes notebooks export` downloads a ZIP of the whole notebook, or of one section, folder, page or database (`nodeId`), as Markdown (`format=md`, the default) or HTML (`format=html`).** Pages and records become documents, databases become CSV files, attachments are included unless `attachments=false`, and an `index.md` (or `index.html`) at the top lists what the archive holds and what it leaves out. Only what the caller can read is exported, and channels and messages never are. `dryRun=true` runs the scope checks and the planning limits and answers `204` with no body, or the error the download would get at planning; it does not render, so a later cut is still possible. A record, file, channel or message as `nodeId`, or a node inside a channel or message, is `400 export_unsupported_scope`; an export over a planning limit (items, sizes, nesting, planning time) is `422 export_too_large`; `nodeId` must be 24 lowercase hex characters (else `400 validation_error`); a second export of yours while one runs, or a third on the server, is `429 export_busy` with `Retry-After: 10`. The route takes no export `ticket`: without a Bearer token a non-empty one is a `400`. After the first byte a failure can only cut the connection, so a short read means an incomplete ZIP. An attachment with a browser-active extension (`html`, `htm`, `xhtml`, `shtml`, `svg`, `svgz`, `xml`, `xsl`, `xslt`, `js`, `mjs`, `mht`, `mhtml`, `hta`) is stored with `.txt` appended (`report.html` becomes `report.html.txt`, bytes unchanged), because opened from the unzipped folder it would run outside the export's CSP; rename it to open it as a page. In CSV list cells and relation/file labels, a display name longer than about 256 characters is cut and ends with an ellipsis; user display names in mentions and comment authors are capped the same way. A link to an attachment that the index lists as not included may not open. Names that match a sibling's (ignoring case) get ` (2)`, ` (3)`…, but when the numbered names are used up (case variants, long names cut to the same stem), the item is named `<name> ~<last 12 hex of its id>`, or the whole id if that is taken. `hoody --computer "$C" notes notebooks export --node-id "$PAGE" --format html --out-file notes.zip` (`$PAGE` holds the node's id) saves the archive; `--dry-run true` exits 0, writes no archive and prints no data on stdout (`-o json` prints `null`; with `--out-file` a note on stderr says nothing was written).
- `hoody notes records search` matches `q` as a substring against the record name and each field's stored JSON (`{"type":…,"value":…}`), type and `value` key included. So `text` can match a text field whatever its value, and `type` or `value` matches any record with a field. Use `hoody notes records list` filters for an exact field match.
- Text filter operators in `hoody notes records list --filters <filters>`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` and `not_contains` are not supported operators; use `is_equal_to` and `does_not_contain`. A field filter that passes the schema but cannot be applied (an operator the field type does not support, an unknown field id, a value of an unsuitable type) is silently ignored; if no filters remain, the list comes back unfiltered. Malformed JSON, a non-array `filters` value and an entry that fails the filter schema return `400`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). The file node must already exist with a `…18` id (workflow 6). 
- `GET /api/v1/notes/notebooks/{notebookId}/recent` (HTTP only; no CLI command) (recently changed pages) is for notebook owners and admins; any other member gets `403 forbidden`.

## Common errors

- `400 validation_error` for request-schema failures, for `hoody notes nodes create` attributes that do not fit the node type, and for record field values that do not match the database definition (the only 400 that carries `details[]`); `400 bad_request` for checks inside a handler (no `details`); `400 file_not_found` for a TUS file id that is not a generated file id; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (a database write needs a node role that allows it: notebook owners and admins get a node role from their notebook role unless they have an explicit collaboration on the root section, and notebook collaborators get an editor role, without any explicit collaboration; guests need an explicit collaboration on the root section, which deeper collaborations then refine).
- `404 not_found` — node/comment/version missing, or it does not belong to the `notebookId` given in the path. File routes use their own codes: `hoody notes files download` answers `400 file_not_found` for a missing file node or one outside the notebook, `400 file_not_ready` / `400 file_upload_not_found` for an upload that has not finished, and `404 file_not_found` when the stored bytes are missing; the TUS route answers `404 file_not_found` for a missing file node. `500 unknown` — an operation failed or an unexpected error occurred.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK); nested documents and whole attribute maps go through a JSON file passed as `@file.json`. Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first. Except for the HTML export requests, which use an export ticket and run as the ticket creator's identity, the examples send no `?username=`, Bearer token or ticket, so every call runs as the default username `user`; the `hoody notes` commands have no `--username` or `--role` option, so without a token they run as `user`; a Notes bearer token sent with `--kit-token <token>` runs them as that token's user, and to pick a user by name, send the HTTP requests with the same `?username=<name>` on every request.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `hoody notes document set` body.** A document is
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
  and strips them from an editable document; anchor a comment with `hoody notes comments create`
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

**Step 1 — check identity & create notebook.** `hoody notes whoami` returns the caller (`user` here) and the shared default notebook that the first request joined it to. Then `hoody notes notebooks create` for a separate, named notebook owned by that user. To write into the default notebook instead, skip `hoody notes notebooks create` and use the `notebookId` that `hoody notes whoami` returns.

```bash
hoody --computer "$C" notes whoami
NBID=$(hoody --computer "$C" notes notebooks create \
  --name team-wiki --description 'engineering docs' -o json | jq -r .id)
```

**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `hoody notes nodes create` with `type:"page"` needs that section as `parentId`. Filter on the type too: the Home splash page is also named `Home`. If no Home section is found (renamed, deleted or not visible to you), pick any section you can edit, or create one, as the parent. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(hoody --computer "$C" notes nodes list --notebook-id "$NBID" --type section -o json \
  | jq -r '.nodes[] | select(.type=="section" and .name=="Home") | .id' | head -1)
PAGE=$(hoody --computer "$C" notes nodes create --notebook-id "$NBID" \
  --type page --parent-id "$SEC" --attributes name=Runbook -o json | jq -r .id)
```

**Step 3 — append the first content (recommended).** `hoody notes document append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only (`horizontalRule` only in the `blocks` form: the `{text}` form
takes `paragraph`, `heading1`–`heading3` and `codeBlock`); container blocks
(lists/tables) need `hoody notes document set` (Example 2).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe; within a notebook and user a key identifies one request, so reusing it with another page or another body answers `409`: use a fresh key for each distinct append and reuse it only to retry that same request.

```bash
# --text appends one block (--type sets its type); --blocks @file.json appends several
hoody --computer "$C" notes document append --notebook-id "$NBID" --node-id "$PAGE" \
  --idempotency-key "runbook-$PAGE-1" --text 'Runbook' --type heading1
```

### 2. Build a structured document with `hoody notes document set` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
container blocks or precise ordering. Warning: this example avoids two traps. (1) Use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`). PUT
repairs the well-known aliases, but a wrong type it cannot map is stored silently and
renders blank (see Quirks). (2) `hoody notes document update` merges
by block id: each sent block replaces the stored block with that id wholesale and
omitted blocks are kept, so it can add or rewrite blocks but never remove one. To
remove blocks, `GET` the current blocks, mutate locally, `PUT` the result back (to
add plain blocks, `hoody notes document append` is simpler).

```bash
# $PAGE is still the page id from Example 1.
B1=$(openssl rand -hex 12); B2=$(openssl rand -hex 12); B3=$(openssl rand -hex 12)
BL=$(openssl rand -hex 12); LI1=$(openssl rand -hex 12); LI1P=$(openssl rand -hex 12)
LI2=$(openssl rand -hex 12); LI2P=$(openssl rand -hex 12)
# The file holds the content object itself (no outer "content" key).
cat > /tmp/content.json <<EOF
{"type":"rich_text","blocks":{
  "$B1":{"id":"$B1","parentId":"$PAGE","index":"a0","type":"heading1","content":[{"type":"text","text":"Deploy Steps"}]},
  "$B2":{"id":"$B2","parentId":"$PAGE","index":"a1","type":"paragraph","content":[{"type":"text","text":"Run the script below, then verify."}]},
  "$B3":{"id":"$B3","parentId":"$PAGE","index":"a2","type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "$BL":{"id":"$BL","parentId":"$PAGE","index":"a3","type":"bulletList"},
  "$LI1":{"id":"$LI1","parentId":"$BL","index":"a0","type":"listItem"},
  "$LI1P":{"id":"$LI1P","parentId":"$LI1","index":"a0","type":"paragraph","content":[{"type":"text","text":"Smoke-test /healthz"}]},
  "$LI2":{"id":"$LI2","parentId":"$BL","index":"a1","type":"listItem"},
  "$LI2P":{"id":"$LI2P","parentId":"$LI2","index":"a0","type":"paragraph","content":[{"type":"text","text":"Tag the release"}]}
}}
EOF
hoody --computer "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
```

### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```bash
DOC=$(hoody --computer "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json)
echo "$DOC" | jq '.content.blocks | to_entries | map({k:.key,t:.value.type,i:.value.index})'
```

**Step 2 — mutate locally + PUT back.** Select the target block by its id (`B2` / `b2` from example 2) and leave every other block as it is; matching on `type` would also rewrite the paragraphs inside the list items. `index` orders a block among the children of the same parent only, by plain code-unit string comparison. The editor treats it as a fractional index, so give the block a key that sorts before its first sibling and is still a valid key: before `a0` that is `Zz`. An invalid key such as `_a0` is not stored as sent: a full-document PUT re-keys a sibling group that holds one when every sibling has a non-empty string `index` (fresh `a0`, `a1`, … in the current order, so the siblings' `index` values may change; read them back after the PUT); a block with a missing or empty `index` that is the only child of its parent gets `a0`, but a group of several blocks in which one has a missing or empty `index` is left as sent and the PUT is refused with `400`, and a PATCH that sends a new invalid index is refused with `400`.

```bash
# --content @file takes the content object itself (no outer "content" key)
echo "$DOC" | jq --arg id "$B2" --arg t "Updated intro paragraph (now first)." '
  .content.blocks
  | .[$id].index = "Zz"
  | .[$id].content = [{type:"text",text:$t}]
  | {type:"rich_text",blocks:.}' > /tmp/content.json
hoody --computer "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
```

### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```bash
hoody --computer "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json \
  | jq '{type:"rich_text",blocks:(.content.blocks | del(.["'"$B3"'"]))}' > /tmp/content.json
hoody --computer "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
hoody --computer "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json \
  | jq --arg p "$PAGE" '[.content.blocks[] | select(.parentId==$p)] | sort_by(.index) | map(.type)'
```

### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. Warning: `hoody notes nodes create` for `type:"database"` requires an `attributes.fields` map (`{}` is valid while the database has no columns yet). Without the map the kit answers `400 validation_error`, its `details` naming `/attributes/fields`; a permission failure is a `403`. Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
# The database's attributes (name + field definitions) come from a file.
cat > /tmp/db-attrs.json <<'EOF'
{"name":"Tasks","fields":{
  "f_status":{"id":"f_status","type":"text","name":"Status","index":"a0"},
  "f_priority":{"id":"f_priority","type":"number","name":"Priority","index":"a1"},
  "f_done":{"id":"f_done","type":"boolean","name":"Done","index":"a2"}
}}
EOF
DBID=$(hoody --computer "$C" notes nodes create --notebook-id "$NBID" \
  --type database --parent-id "$SEC" --attributes @/tmp/db-attrs.json -o json | jq -r .id)

# Each --fields VALUE is the typed {type, value} JSON for that field id.
for i in 1 2 3; do
  hoody --computer "$C" notes records create --notebook-id "$NBID" --database-id "$DBID" \
    --name "Task $i" \
    --fields 'f_status={"type":"text","value":"todo"}' \
    --fields "f_priority={\"type\":\"number\",\"value\":$i}" \
    --fields 'f_done={"type":"boolean","value":false}' >/dev/null
done
```

### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. Warning: `filters` MUST be a **JSON array** (not an object) of filter entries: a field filter `{ id, type:"field", fieldId, operator, value }`, or a group `{ id, type:"group", operator:"and"|"or", filters:[…field filters] }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array). A schema-valid field filter that cannot be applied is ignored, so check that the result is actually filtered.

```bash
hoody --computer "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" \
  --filters '[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]' \
  --sorts '[{"id":"s1","fieldId":"f_priority","direction":"desc"}]' \
  --count 50 -o json | jq '.records[] | {n:.name,p:.fields.f_priority.value}'
```

A simpler full-text alternative is `hoody notes records search --query ...` — no array shape, just a query string; matches the record `name` and each field's stored JSON, including type names and keys.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `hoody notes records update` PATCH MERGES `fields` (sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` with a `type` the column accepts: `text`, `select`, `date`, `phone` and `url` columns take `text` or `string`, `number` takes `number`, `boolean` takes `boolean`, and `multi_select`, `collaborator`, `file` and `relation` take `string_array`. Computed columns (`created_at`, `created_by`, `updated_at`, `updated_by`, `rollup`) cannot be set.

```bash
RID=$(hoody --computer "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" --count 50 -o json \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
hoody --computer "$C" notes records update --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID" \
  --fields 'f_status={"type":"text","value":"done"}' \
  --fields 'f_done={"type":"boolean","value":true}' -o json | jq '.fields'
```

### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `hoody notes records create` per row. The loops below split each line on commas, so they handle simple rows only, with no quoted values and no commas or newlines inside a value; for a real CSV file, use a CSV parser and check that each priority is a number. Warning: Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key that includes the database id and the row number (a key made from the name alone collides across databases and between rows with the same name; replay returns the saved response; same key + different payload returns `409`). From the CLI, pass it with `--idempotency-key`.

```bash
cat > /tmp/tasks.csv <<EOF
name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress
EOF
# One fixed key per row: a rerun replays the stored answer instead of adding the row again.
n=0
tail -n +2 /tmp/tasks.csv | while IFS=, read -r name pri stat; do
  n=$((n + 1))
  KEY=$(echo -n "import-2026-05-07:$DBID:$n:$name" | sha256sum | cut -d' ' -f1)
  hoody --computer "$C" notes records create --notebook-id "$NBID" --database-id "$DBID" \
    --idempotency-key "$KEY" \
    --name "$name" \
    --fields "f_priority=$(jq -nc --argjson p "$pri" '{type:"number",value:$p}')" \
    --fields "f_status=$(jq -nc --arg s "$stat" '{type:"text",value:$s}')" \
    --fields 'f_done={"type":"boolean","value":false}' >/dev/null
done
```

### 9. Export a page to HTML — short-lived ticket flow

**Goal:** publish a static HTML snapshot of a page. `hoody notes document get` with `--format html` requires a short-lived export `ticket` (markdown via `--format md` does NOT — it returns text directly with no ticket). Each ticket allows 3 uses and expires after 2 minutes. Anyone with the kit URL and the ticket can download until the uses are spent or it expires, as long as the person who created it still has access to the page.

**Step 1 — create a ticket.**

```bash
TICKET=$(hoody --computer "$C" notes document exporttickets create --notebook-id "$NBID" --node-id "$PAGE" \
  --theme-mode light --include-comments appendix -o json | jq -r .ticket)   # output defaults to html
```

**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
# global -o raw writes the body as-is; the command's --format picks the export format
hoody --computer "$C" -o raw notes document get --notebook-id "$NBID" --node-id "$PAGE" \
  --format html --ticket "$TICKET" > /tmp/page.html
```

### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. The section and notebook steps are only for the separate notebook Example 1 created. If you wrote into the default notebook from `hoody notes whoami` (Example 1's alternative) or any other notebook you did not create here, delete only the records, the database and the page these examples created, and stop: deleting that notebook's `Home` section or the notebook itself removes content that was there before, including the shared default notebook's starter pages. Order matters: deleting a `section` cascades to every descendant page/database/record under it; other sections and their descendants remain. Then `hoody notes notebooks delete` removes the notebook itself.

`hoody notes notebooks delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `hoody notes notebooks list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
hoody --computer "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" -o json \
  | jq -r '.records[].id' | while read RID; do
      hoody --computer "$C" notes records delete --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID"
    done
hoody --computer "$C" notes nodes delete --notebook-id "$NBID" --node-id "$DBID"
```

Then, in the default notebook or any notebook you did not create here, delete the page and stop:

```bash
hoody --computer "$C" notes nodes delete --notebook-id "$NBID" --node-id "$PAGE"
```

Or, only in the separate notebook Example 1 created, delete the section and the notebook:

```bash
hoody --computer "$C" notes nodes delete --notebook-id "$NBID" --node-id "$SEC"
# rename only if the delete failed (a deleted notebook is Inactive and rejects updates)
hoody --computer "$C" notes notebooks delete --notebook-id "$NBID" \
  || hoody --computer "$C" notes notebooks update --notebook-id "$NBID" --name team-wiki-DELETED
```

## Reference

### `hoody notes` (55) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes avatars download` |  | read | Download an avatar image by id | `notes.avatars.download` | `hoody notes avatars download --avatar-id abc-123` |
| `hoody notes avatars upload` |  | write | Upload an avatar image and get its id (JPEG, PNG or WebP; scaled down to fit within 500x500, keeping its aspect ratio and never enlarged) | `notes.avatars.upload` | `hoody notes avatars upload --input ./local-file` |
| `hoody notes collaborators add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collaborators add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collaborators list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collaborators list --notebook-id abc-123 --node-id 1 --watch 2s` |
| `hoody notes collaborators remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collaborators remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collaborators role set` |  | write | Update a collaborator's role on a node | `notes.collaborators.setRole` | `hoody notes collaborators role set --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comments anchors list` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comments anchors list --limit 500 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments anchors set` |  | write | Move a comment thread to a new anchor in the document. Re-anchoring is off by default and then answers 409 | `notes.comments.setAnchor` | `hoody notes comments anchors set --notebook-id abc-123 --node-id 1 --comment-id abc-123 --anchor-type document --expected-version 10` |
| `hoody notes comments create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comments create --notebook-id abc-123 --node-id 1 --content Hello` |
| `hoody notes comments delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comments delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comments list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comments list --limit 100 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comments resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes comments update` |  | write | Edit a comment's body | `notes.comments.update` | `hoody notes comments update --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content Hello --expected-version 10` |
| `hoody notes document append` |  | write | Append blocks to the end of a node's document (creates the document if absent) | `notes.document.append` | `hoody notes document append --notebook-id abc-123 --node-id 1 --text Hello` |
| `hoody notes document blocks export` |  | read | Render a drawing block from a node's document as SVG | `notes.document.exportBlock` | `hoody notes document blocks export --scale 10 --notebook-id abc-123 --node-id 1 --block-id abc-123` |
| `hoody notes document exporttickets create` |  | action | Mint a ticket for an HTML export of a node's document, valid for three uses within two minutes | `notes.document.createExportTicket` | `hoody notes document exporttickets create --notebook-id abc-123 --node-id 1 --include-comments none --include-background` |
| `hoody notes document get` |  | read | Get document content for a node (rich-text body) | `notes.document.get` | `hoody notes document get --lines 100 --format json --notebook-id abc-123 --node-id 1` |
| `hoody notes document set` |  | write | Create or replace a node's document content (full overwrite) | `notes.document.set` | `hoody notes document set --notebook-id abc-123 --node-id 1 --content @doc.json` |
| `hoody notes document update` |  | write | Merge changes into a node's document content | `notes.document.update` | `hoody notes document update --notebook-id abc-123 --node-id 1 --content @doc.json` |
| `hoody notes files download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes files download --notebook-id abc-123 --file-id abc-123` |
| `hoody notes files list` |  | read | List file attachments in a notebook | `notes.files.list` | `hoody notes files list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes health` |  | read | Show Notes service health and runtime info | `notes.kit.getHealth` | `hoody notes health` |
| `hoody notes members invite` |  | write | Invite users to a notebook by username and assign their role | `notes.members.invite` | `hoody notes members invite --notebook-id abc-123 --users username=alice,role=owner` |
| `hoody notes members role set` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.members.setRole` | `hoody notes members role set --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes nodes children list` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes nodes children list --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes nodes create --notebook-id abc-123 --type page --parent-id abc-123 --attributes name=Runbook` |
| `hoody notes nodes delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes nodes delete --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes nodes get --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes nodes list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes nodes markopened` |  | action | Record that the current user has opened a node | `notes.nodes.markOpened` | `hoody notes nodes markopened --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes markseen` |  | action | Record that the current user has seen a node | `notes.nodes.markSeen` | `hoody notes nodes markseen --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes resolve` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.resolve` | `hoody notes nodes resolve --notebook-id abc-123 --alias my-resource` |
| `hoody notes nodes update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes nodes update --notebook-id abc-123 --node-id 1 --attributes key=hello` |
| `hoody notes notebooks create` |  | write | Create a new notebook | `notes.notebooks.create` | `hoody notes notebooks create --name my-resource --description 'My description' --avatar 019d3a7c5e2b4f81a0c3d716` |
| `hoody notes notebooks delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebooks delete --notebook-id abc-123` |
| `hoody notes notebooks export` |  | read | Download a ZIP of a notebook, section, folder, page or database as Markdown or HTML | `notes.notebooks.export` | `hoody notes notebooks export --node-id 64f1a2b3c4d5e6f7a8b9c0d1 --format md --notebook-id abc-123` |
| `hoody notes notebooks get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebooks get --notebook-id abc-123` |
| `hoody notes notebooks list` |  | read | List notebooks the current user has access to | `notes.notebooks.list` | `hoody notes notebooks list --watch 2s` |
| `hoody notes notebooks update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebooks update --notebook-id abc-123 --name my-resource --description 'My description' --avatar 019d3a7c5e2b4f81a0c3d716` |
| `hoody notes open` |  | action | Open the Notes kit in your browser |  | `hoody notes open` |
| `hoody notes reactions add` |  | write | Add an emoji reaction to a message node (other node types refuse reactions) | `notes.reactions.add` | `hoody notes reactions add --notebook-id abc-123 --node-id 1 --reaction '👍'` |
| `hoody notes reactions list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reactions list --notebook-id abc-123 --node-id 1 --watch 2s` |
| `hoody notes reactions remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reactions remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes records create` |  | write | Create a new record in a database node | `notes.records.create` | `hoody notes records create --notebook-id abc-123 --database-id abc-123 --name Untitled --avatar 019d3a7c5e2b4f81a0c3d716` |
| `hoody notes records delete` |  | destructive | Delete a database record | `notes.records.delete` | `hoody notes records delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records get` |  | read | Get a database record by id | `notes.records.get` | `hoody notes records get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records list` |  | read | List records in a database node | `notes.records.list` | `hoody notes records list --filters @filters.json --sorts @sorts.json --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records search` |  | read | Search records in a database node | `notes.records.search` | `hoody notes records search --exclude '[]' --notebook-id abc-123 --database-id abc-123 --watch 2s` |
| `hoody notes records update` |  | write | Update a database record's fields | `notes.records.update` | `hoody notes records update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar 019d3a7c5e2b4f81a0c3d716` |
| `hoody notes versions create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes versions create --notebook-id abc-123 --node-id 1` |
| `hoody notes versions delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes versions delete --notebook-id abc-123 --node-id 1 --version-id abc-123 -y` |
| `hoody notes versions get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes versions get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes versions list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes versions list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes versions restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes versions restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.whoami` | `hoody notes whoami` |

