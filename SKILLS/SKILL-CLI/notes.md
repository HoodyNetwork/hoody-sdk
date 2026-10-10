> _**CLI skill · `notes` namespace** · ~12,369 tokens · hoody-sdk v1.0.0-beta.17_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-container notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, container fs → `files`, desktop notifs → `notifications`, cross-container identity → `api`, scheduled writes → `cron`.

## Prerequisites

- **To add a note, create a page in a notebook you already have; do not create a notebook for it.** Your default notebook (the `notebookId` from `hoody notes whoami`) and every new notebook come with a `Home` section. A page is `hoody notes nodes create` with `type:"page"`, `parentId:<Home section id>` (from `hoody notes nodes list` with `type:"section"`) and `attributes:{name}`; then write its text with `hoody notes document append`.
- `notebookId` on every notebook-scoped call (identity and notebook list/create take none). Notebook-scoped commands fall back to your default notebook when `--notebook-id` is omitted. Without a Bearer token or export ticket, identity comes from the `?username=` / `?role=` query parameters on each request (default username `user`, default role `owner`). The first request for a username adds that user to the container's single shared default notebook (`Hoody Notes`); every query-identity user joins that same notebook, so it is not private. Use `hoody notes notebooks create` for a separate notebook.
- `hoody notes document append` and `hoody notes nodes create` take `--x-idempotency-key <key>`, so the recommended document-writing path and node creation are retry-safe from the CLI. Most other commands have no idempotency flag; use raw HTTP with an `X-Idempotency-Key` header when you need a retry-safe record create. Notebook create, comment create and version create ignore that header, so retrying those can create duplicates. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `hoody notes document set`/`hoody notes document update`/`hoody notes document append` reject viewers and read-only collaborators with `403`. Documents attach only to `page` and `record` nodes; `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `hoody notes nodes list` `type:"section"` → pick `Home` → `hoody notes nodes create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `hoody notes document append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `hoody notes document set`. Creates the document if absent; pass an idempotency key (`--x-idempotency-key`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `hoody notes whoami` → `{userId,username,role,notebookId}`. The `notebookId` is the container's shared default notebook (`Hoody Notes`, with a `Home` section and starter pages), which every query-identity username joins; create your own with `hoody notes notebooks create` when the content must not be shared. `hoody notes notebooks list`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `hoody notes document set`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `hoody notes document set` OVERWRITES the whole document; `hoody notes document update` merges: top-level keys replace the stored ones, and `content.blocks` merges by block id (each sent block replaces the stored block with that id wholesale, omitted blocks are kept; removing a block takes `hoody notes document set`). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real block `type` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 2.
4. **Database CRUD** — `hoody notes nodes create` `type:"database"`; then `hoody notes records create`/`hoody notes records list`/`hoody notes records search`/`hoody notes records update` (merges `fields`)/`hoody notes records delete`. Page with `page`/`count` on `hoody notes records list` (count max 100).
5. **Collaborators, comments + versions** — before sharing a node with someone new to the notebook, call `hoody notes members invite --users <users>`, check the returned `errors`, and use the created user's `id` as the `collaboratorId` for `hoody notes collaborators add` (`admin`/`editor`/`collaborator`/`viewer`; managing node collaborators needs admin permission): a collaborator who is not yet a member of that notebook is refused with `404 user_not_found`. `hoody notes comments create` (top-level, anchored, or reply); `hoody notes comments update` / `hoody notes comments delete` / `hoody notes comments resolve` accept optional `expectedVersion` for optimistic concurrency. `hoody notes versions create`/`list`/`get`/`hoody notes versions restore`.
6. **TUS upload + download** — the `fileId` is an input, not something the upload returns. First create the file node yourself: `hoody notes nodes create` with `type: 'file'` (without an `id`, the kit gives the node a file id, which ends in `18`, the only shape the upload routes accept; an `id` you pass yourself must be 22 lowercase hex chars + `'18'`), `parentId` (a node where you have editor rights), and `attributes: { subtype: 'image'|'video'|'audio'|'pdf'|'other', name, originalName, mimeType, extension: '' or '.ext', size, version: <22 lowercase hex chars> + '03', status: 0 }`. Only that node's creator can upload to it. Then run the TUS calls on that id. Send `Tus-Resumable: 1.0.0` on every one of them (POST, PATCH, HEAD and DELETE); any other value is refused with `412`. On `…/files/{fileId}/tus`: create the upload with `POST` and `Upload-Length`, send chunks with `PATCH` plus `Upload-Offset` and `Content-Type: application/offset+octet-stream`, check the resume offset with `HEAD`, or cancel with `DELETE`. Download with `hoody notes files download`. The CLI has no TUS commands (`hoody notes files` only lists and downloads), so upload over HTTP.{22}18$/.test(fileId)"]

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — a value the kit cannot repair stores silently but renders blank.** The valid block types are: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. `hoody notes document set` and `hoody notes document update` repair the unambiguous mistakes before validating: known type aliases (`code`, `quote`, `bullet_list_item`, `numbered_list_item`, `h1`, …) become the real type, with flat list items wrapped in a list, and `props` becomes `attrs` when the block has no `attrs`. Other write paths skip this repair, and it leaves anything ambiguous alone (an unknown type, a bare `list_item`). The block schema is loose (`type:z.string()`, `attrs:z.record`), so an unrepaired bad `type`/`props` is accepted with `200` and stored — the block is validated on the way in, but the ORIGINAL object is what gets written, so the junk key persists — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id. `hoody notes document set`/`hoody notes document update` move text found directly on a container with no children into a new child paragraph, but text on a container that already has children is left there and renders empty. See §Examples 0 and 2 for the exact nesting.
- **Prefer `hoody notes document append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types that do not support documents (only `page`/`record` do) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`hoody notes document set` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **A page needs a parent and a `name`: `hoody notes nodes create` with `type:"page"`, `parentId` and `attributes.name`.** The parent is the `Home` section (its id from `hoody notes nodes list` with `type:"section"`) or another page you can edit; in flags: `--type page --parent-id <sectionId> --attributes name=<name>`. With no `parentId` the kit answers `400 parent_required`: add the parent rather than creating a notebook. A `403 forbidden` is a real permission refusal (your role on the parent does not allow the create). The label is `name`; there is no `title` attribute, and a page without `name` fails with `500 unknown`.
- **`hoody notes nodes create` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — attribute validation throws before the create transaction's error handling can map it to a status (an unknown type or a `parentId` that does not exist gives `400`; no `parentId` for a node that needs one gives `400 parent_required`; a parent you cannot edit gives `403`). A section is root-only (a `parentId` gives `400 section_must_be_root`). If `attributes.collaborators` is omitted, the server adds the creator as `admin`; a map you send yourself must name you as `admin`, or the create is a `403` !== 'admin') {"]. For a note, reuse the auto-provisioned `Home` section.
- **`hoody notes notebooks create` always makes a new, separate notebook; it is not how you add a note.** It takes only `name` (plus optional `description`/`avatar`) and no parent: a notebook is top-level. It ignores `X-Idempotency-Key`, and names are not unique, so a retry or a second call with the same name makes a duplicate. Run `hoody notes notebooks list` first and reuse a notebook that has the name; to add a note, create a page in an existing notebook with `hoody notes nodes create`.
- **`hoody notes document set` and `hoody notes document update` take a rich-text document only from a file: `--content @/tmp/content.json`.** The file holds the content object itself, such as `{"type":"rich_text","blocks":{…}}`, without an outer `content` key; its values are sent as written, nested blocks included. `--content KEY=VALUE` sends each value as a plain string, which no document accepts (`set` is refused with `400`, `update` stores an extra key the page never shows). For plain text, `hoody notes document append --body '{"text":"…","type":"paragraph"}'` is simpler.
- **`hoody notes records create` and `hoody notes records update` take typed field values.** Each `--fields` VALUE is JSON, the `{type, value}` object keyed by the field id: `--fields 'f_done={"type":"boolean","value":true}'` (repeat the flag per field), or `--fields @/tmp/fields.json` for the whole fields map. A bare value such as `f_done=true` is not a field value and is refused.
- **Upload an avatar with `hoody --container "$C" notes avatars upload --input /tmp/avatar.jpg`** (or pipe the bytes on stdin). The body is the raw JPEG, PNG or WebP image, and the CLI sets `Content-Type` from the file's bytes; the response carries the avatar id for `--avatar`.
- Authentication re-anchors identity to the `notebookId` in the URL, so one bearer token reaches any notebook the username has joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` (HTTP only; no CLI command) route + WS feed: each mutation type (`hoody notes document update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `hoody notes document set` is a last-writer-wins overwrite of the same store. `hoody notes document update` re-applies its merge to the current document when a concurrent write lands first, so two PATCHes that send different blocks both survive; two that send the same block id are last-writer-wins for that block, and a `hoody notes document set` racing a PATCH still overwrites whatever it omits.
- `hoody notes whoami` with `?username=&role=` does NOT create a per-user notebook: the first request for a username adds that user to the container's single shared default notebook (`Hoody Notes`, seeded with starting content) with the role from that request (default `owner`), and notebook routes then use that stored role. Every query-identity username shares that notebook, so use `hoody notes notebooks create` for private content. The `username`/`role`/`ticket` query parameters are read on every route, although the generated Reference does not list them. Priority Bearer → `ticket` → `?username=&role=`. Only a notes Bearer token (base64url JSON with `userId`, `notebookId`, `username`, `role`) is read: one that decodes to a JSON object but is malformed returns `401` with no fallback, while a JWT, an opaque token or another scheme is ignored and resolution continues with `ticket` or the query identity. An export `ticket` is accepted only on the HTML document export (`GET …/document?output=html`); on any other route it is a `400`. **Without a notes Bearer token, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=<name>` on every unauthenticated call, or attach a valid notes Bearer identity. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes** — content reads still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`. The TUS upload route refuses every method on a readonly notebook, the `HEAD` offset check included.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409. Only routes that implement it honour the header (see Prerequisites); notebook create does not.
- `hoody notes records update` merges `fields`. Database access uses the shared node-access check: it starts from your collaboration on the notebook **root** node (or your notebook role when there is none), returns `403` if an ancestor is a private `section` or a `channel` whose `collaborators` map omits you, and then applies the deepest explicit collaboration on the database's ancestor chain, so a role granted lower in the tree overrides the root one. Notebook owners/admins skip the privacy checks and keep their root-level role. A root collaboration alone is therefore NOT sufficient under such an ancestor, and a write refusal can come from a deeper collaboration. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.{22}18$/.test(fileId)"]
- `hoody notes document get` with `output=html` needs a short-lived export `ticket` (3 uses, 2 minutes) on `GET .../document`. `hoody notes document set` overwrites; `hoody notes document update` merges: top-level keys replace the stored ones, and `content.blocks` (a map by block id, or a list of blocks with distinct ids) merges by block id — a sent block replaces the stored block with that id, every other block is kept, and removing blocks takes a `hoody notes document set`. Any other `blocks` shape is a `400`. `hoody notes comments update` / `hoody notes comments delete` / `hoody notes comments resolve` accept optional `expectedVersion`.
- `hoody notes records search` matches against record names AND field values (not just names).
- Text filter operators in `hoody notes records list --filters <filters>`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). The file node must already exist with a `…18` id (workflow 6). 

## Common errors

- `400 validation_error` for request-schema failures (the only 400 that carries `details[]`); `400 bad_request` for checks inside a handler (no `details`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.{22}18$/.test(fileId)"]
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (a database write needs a collaboration granting you create rights).
- `404 not_found` — node/comment/version missing, or it does not belong to the `notebookId` given in the path. File routes use their own codes: `hoody notes files download` answers `400 file_not_found` for a missing file node or one outside the notebook, `400 file_not_ready` / `400 file_upload_not_found` for an upload that has not finished, and `404 file_not_found` when the stored bytes are missing; the TUS route answers `404 file_not_found` for a missing file node. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK); nested documents and whole attribute maps go through a JSON file passed as `@file.json`. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The examples send no `?username=`, Bearer token or ticket, so every call runs as the default username `user`; to act as another user, add the same `?username=<name>` to every request (a username that appears on only some calls splits ownership between two users).

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
  `tableHeader`/`tableCell` → `paragraph`. The child's `parentId` is the container's id.
- `index` is a lexicographic ordering string per sibling group (server uses
  fractional indexing). For a brand-new document, monotonically increasing strings
  (`a0`,`a1`,`a2`,…) sort correctly. To INSERT between two existing blocks you need a
  key that sorts strictly between them — another reason to prefer append.
- Inline `content` leaves are `{ "type":"text", "text":"…", "marks?":[…] }`. Marks:
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
hoody --container "$C" notes whoami
NBID=$(hoody --container "$C" notes notebooks create \
  --name team-wiki --description 'engineering docs' -o json | jq -r .id)
```

**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `hoody notes nodes create` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(hoody --container "$C" notes nodes list --notebook-id "$NBID" -o json \
  | jq -r '.nodes[] | select(.type=="section") | .id' | head -1)
PAGE=$(hoody --container "$C" notes nodes create --notebook-id "$NBID" \
  --type page --parent-id "$SEC" --attributes name=Runbook -o json | jq -r .id)
```

**Step 3 — append the first content (recommended).** `hoody notes document append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `hoody notes document set` (Example 2).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```bash
# --body takes the raw JSON request body (one block or {"blocks":[...]})
hoody --container "$C" notes document append --notebook-id "$NBID" --node-id "$PAGE" \
  --x-idempotency-key runbook-h1 --body '{"type":"heading1","text":"Runbook"}'
```

### 2. Build a structured document with `hoody notes document set` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`). PUT
repairs the well-known aliases, but a wrong type it cannot map is stored silently and
renders blank (see Quirks). (2) `hoody notes document update` merges
by block id: each sent block replaces the stored block with that id wholesale and
omitted blocks are kept, so it can add or rewrite blocks but never remove one. To
remove blocks, `GET` the current blocks, mutate locally, `PUT` the result back (to
add plain blocks, `hoody notes document append` is simpler).

```bash
PAGE=...
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
hoody --container "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
```

### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```bash
DOC=$(hoody --container "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json)
echo "$DOC" | jq '.content.blocks | to_entries | map({k:.key,t:.value.type,i:.value.index})'
```

**Step 2 — mutate locally + PUT back.** Select the target block by its id (`B2` / `b2` from example 2) and leave every other block as it is; matching on `type` would also rewrite the paragraphs inside the list items. `index` orders a block among the children of the same parent only, by plain code-unit string comparison. The editor treats it as a fractional index, so give the block a key that sorts before its first sibling and is still a valid key: before `a0` that is `Zz`. An invalid key such as `_a0` is not stored as sent: a full-document PUT re-keys every sibling group that holds one (fresh `a0`, `a1`, … in the current order, so every sibling's `index` changes), and a PATCH that sends a new invalid index is refused with `400`.

```bash
# --content @file takes the content object itself (no outer "content" key)
echo "$DOC" | jq --arg id "$B2" --arg t "Updated intro paragraph (now first)." '
  .content.blocks
  | .[$id].index = "Zz"
  | .[$id].content = [{type:"text",text:$t}]
  | {type:"rich_text",blocks:.}' > /tmp/content.json
hoody --container "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
```

### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```bash
hoody --container "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json \
  | jq '{type:"rich_text",blocks:(.content.blocks | del(.["'"$B3"'"]))}' > /tmp/content.json
hoody --container "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
hoody --container "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json \
  | jq --arg p "$PAGE" '[.content.blocks[] | select(.parentId==$p)] | sort_by(.index) | map(.type)'
```

### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `hoody notes nodes create` for `type:"database"` requires an `attributes.fields` map (`{}` is valid while the database has no columns yet) — without the map the kit returns `500`, because attribute validation throws before the create transaction's error handling can map it to a status — a permission failure would be a `403`. Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
# The database's attributes (name + field definitions) come from a file.
cat > /tmp/db-attrs.json <<'EOF'
{"name":"Tasks","fields":{
  "f_status":{"id":"f_status","type":"text","name":"Status","index":"a0"},
  "f_priority":{"id":"f_priority","type":"number","name":"Priority","index":"a1"},
  "f_done":{"id":"f_done","type":"boolean","name":"Done","index":"a2"}
}}
EOF
DBID=$(hoody --container "$C" notes nodes create --notebook-id "$NBID" \
  --type database --parent-id "$SEC" --attributes @/tmp/db-attrs.json -o json | jq -r .id)

# Each --fields VALUE is the typed {type, value} JSON for that field id.
for i in 1 2 3; do
  hoody --container "$C" notes records create --notebook-id "$NBID" --database-id "$DBID" \
    --name "Task $i" \
    --fields 'f_status={"type":"text","value":"todo"}' \
    --fields "f_priority={\"type\":\"number\",\"value\":$i}" \
    --fields 'f_done={"type":"boolean","value":false}' >/dev/null
done
```

### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

```bash
hoody --container "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" \
  --filters '[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]' \
  --sorts '[{"id":"s1","fieldId":"f_priority","direction":"desc"}]' \
  --count 50 -o json | jq '.records[] | {n:.name,p:.fields.f_priority.value}'
```

A simpler full-text alternative is `hoody notes records search --q ...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `hoody notes records update` PATCH MERGES `fields` (sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```bash
RID=$(hoody --container "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" --count 50 -o json \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
hoody --container "$C" notes records update --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID" \
  --fields 'f_status={"type":"text","value":"done"}' \
  --fields 'f_done={"type":"boolean","value":true}' -o json | jq '.fields'
```

### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `hoody notes records create` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). 

```bash
cat > /tmp/tasks.csv <<EOF
name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress
EOF
# `records create` has no idempotency flag, so a rerun adds every row again;
# for a retry-safe import, send X-Idempotency-Key over HTTP instead.
tail -n +2 /tmp/tasks.csv | while IFS=, read -r name pri stat; do
  hoody --container "$C" notes records create --notebook-id "$NBID" --database-id "$DBID" \
    --name "$name" \
    --fields "f_priority=$(jq -nc --argjson p "$pri" '{type:"number",value:$p}')" \
    --fields "f_status=$(jq -nc --arg s "$stat" '{type:"text",value:$s}')" \
    --fields 'f_done={"type":"boolean","value":false}' >/dev/null
done
```

### 9. Export a page to HTML — short-lived ticket flow

**Goal:** publish a static HTML snapshot of a page. `hoody notes document get` with `output=html` requires a short-lived export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Each ticket allows 3 uses and expires after 2 minutes. Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

```bash
TICKET=$(hoody --container "$C" notes document tickets create --notebook-id "$NBID" --node-id "$PAGE" \
  --theme-mode light --include-comments appendix -o json | jq -r .ticket)   # output defaults to html
```

**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
# global -o raw writes the body as-is; the command's own --output picks the export format
hoody --container "$C" -o raw notes document get --notebook-id "$NBID" --node-id "$PAGE" \
  --output html --ticket "$TICKET" > /tmp/page.html
```

### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (one DELETE on the section empties the notebook). Then `hoody notes notebooks delete` removes the notebook itself.

`hoody notes notebooks delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `hoody notes notebooks list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
hoody --container "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" -o json \
  | jq -r '.records[].id' | while read RID; do
      hoody --container "$C" notes records delete --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID"
    done
hoody --container "$C" notes nodes delete --notebook-id "$NBID" --node-id "$DBID"
hoody --container "$C" notes nodes delete --notebook-id "$NBID" --node-id "$SEC"
# rename only if the delete failed (a deleted notebook is Inactive and rejects updates)
hoody --container "$C" notes notebooks delete --notebook-id "$NBID" \
  || hoody --container "$C" notes notebooks update --notebook-id "$NBID" --name team-wiki-DELETED
```

## Reference

### `hoody notes` (54) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes avatars download` |  | read | Download an avatar image by id | `notes.avatars.download` | `hoody notes avatars download --avatar-id abc-123` |
| `hoody notes avatars upload` |  | write | Upload an avatar image and get its id (JPEG, PNG or WebP; resized to 500x500) | `notes.avatars.upload` | `hoody notes avatars upload --input ./local-file` |
| `hoody notes collaborators add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collaborators add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collaborators list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collaborators list --notebook-id abc-123 --node-id 1` |
| `hoody notes collaborators remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collaborators remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collaborators role set` |  | write | Update a collaborator's role on a node | `notes.collaborators.setRole` | `hoody notes collaborators role set --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comments anchor set` |  | write | Move a comment thread to a new anchor in the document | `notes.comments.setAnchor` | `hoody notes comments anchor set --notebook-id abc-123 --node-id 1 --comment-id abc-123 --anchor-type document --expected-version 10` |
| `hoody notes comments anchors list` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comments anchors list --limit 500 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comments create --notebook-id abc-123 --node-id 1 --content Hello` |
| `hoody notes comments delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comments delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comments list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comments list --limit 100 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comments resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes comments update` |  | write | Edit a comment's body | `notes.comments.update` | `hoody notes comments update --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content Hello --expected-version 10` |
| `hoody notes document append` |  | write | Append blocks to the end of a node's document (creates the document if absent) | `notes.document.append` | `hoody notes document append --notebook-id abc-123 --node-id 1 --body '{"text":"Hello"}'` |
| `hoody notes document blocks export` |  | read | Render a drawing block from a node's document as SVG | `notes.document.exportBlock` | `hoody notes document blocks export --scale 10 --notebook-id abc-123 --node-id 1 --block-id abc-123` |
| `hoody notes document get` |  | read | Get document content for a node (rich-text body) | `notes.document.get` | `hoody notes document get --lines 100 --output json --notebook-id abc-123 --node-id 1` |
| `hoody notes document set` |  | write | Create or replace a node's document content (full overwrite) | `notes.document.set` | `hoody notes document set --notebook-id abc-123 --node-id 1 --content key=hello` |
| `hoody notes document tickets create` |  | action | Mint a single-use ticket for an HTML export of a node's document | `notes.document.createExportTicket` | `hoody notes document tickets create --notebook-id abc-123 --node-id 1 --include-comments none --include-background` |
| `hoody notes document update` |  | write | Merge changes into a node's document content | `notes.document.update` | `hoody notes document update --notebook-id abc-123 --node-id 1 --content key=hello` |
| `hoody notes files download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes files download --notebook-id abc-123 --file-id abc-123` |
| `hoody notes files list` |  | read | List file attachments in a notebook | `notes.files.list` | `hoody notes files list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes health` |  | read | Show Notes service health and runtime info | `notes.kit.getHealth` | `hoody notes health` |
| `hoody notes members invite` |  | write | Invite users to a notebook by username and assign their role | `notes.members.invite` | `hoody notes members invite --notebook-id abc-123 --users username=alice,role=owner` |
| `hoody notes members role set` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.members.setRole` | `hoody notes members role set --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes nodes children list` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes nodes children list --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes nodes create --notebook-id abc-123 --type <type> --attributes key=hello` |
| `hoody notes nodes delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes nodes delete --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes nodes get --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes nodes list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes nodes mark opened` |  | action | Record that the current user has opened a node | `notes.nodes.markOpened` | `hoody notes nodes mark opened --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes mark seen` |  | action | Record that the current user has seen a node | `notes.nodes.markSeen` | `hoody notes nodes mark seen --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes resolve` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.resolve` | `hoody notes nodes resolve --notebook-id abc-123 --alias my-resource` |
| `hoody notes nodes update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes nodes update --notebook-id abc-123 --node-id 1 --attributes key=hello` |
| `hoody notes notebooks create` |  | write | Create a new notebook (top-level workspace) | `notes.notebooks.create` | `hoody notes notebooks create --name my-resource --description 'My description' --avatar https://example.com/avatar.png` |
| `hoody notes notebooks delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebooks delete --notebook-id abc-123` |
| `hoody notes notebooks get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebooks get --notebook-id abc-123` |
| `hoody notes notebooks list` |  | read | List notebooks the current user has access to | `notes.notebooks.list` | `hoody notes notebooks list` |
| `hoody notes notebooks update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebooks update --notebook-id abc-123 --name my-resource --description 'My description' --avatar https://example.com/avatar.png` |
| `hoody notes open` |  | action | Open the Notes kit in your browser |  | `hoody notes open` |
| `hoody notes reactions add` |  | write | Add an emoji reaction to a node | `notes.reactions.add` | `hoody notes reactions add --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes reactions list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reactions list --notebook-id abc-123 --node-id 1` |
| `hoody notes reactions remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reactions remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes records create` |  | write | Create a new record in a database node | `notes.records.create` | `hoody notes records create --notebook-id abc-123 --database-id abc-123 --name Untitled --avatar https://example.com/avatar.png` |
| `hoody notes records delete` |  | destructive | Delete a database record | `notes.records.delete` | `hoody notes records delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records get` |  | read | Get a database record by id | `notes.records.get` | `hoody notes records get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records list` |  | read | List records in a database node | `notes.records.list` | `hoody notes records list --page 1 --count 50 --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records search` |  | read | Search records in a database node | `notes.records.search` | `hoody notes records search --exclude '*.ts' --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records update` |  | write | Update a database record's fields | `notes.records.update` | `hoody notes records update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar https://example.com/avatar.png` |
| `hoody notes versions create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes versions create --notebook-id abc-123 --node-id 1` |
| `hoody notes versions delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes versions delete --notebook-id abc-123 --node-id 1 --version-id abc-123 -y` |
| `hoody notes versions get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes versions get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes versions list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes versions list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes versions restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes versions restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.whoami` | `hoody notes whoami` |

