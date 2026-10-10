> _**SDK skill · `notes` namespace** · ~23,456 tokens · hoody-sdk v1.0.0-beta.17_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-container notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, container fs → `files`, desktop notifs → `notifications`, cross-container identity → `api`, scheduled writes → `cron`.

## Prerequisites

- **To add a note, create a page in a notebook you already have; do not create a notebook for it.** Your default notebook (the `notebookId` from `notes.whoami`) and every new notebook come with a `Home` section. A page is `nodes.create` with `type:"page"`, `parentId:<Home section id>` (from `nodes.list` with `type:"section"`) and `attributes:{name}`; then write its text with `document.append`.
- `notebookId` on every notebook-scoped call (identity and notebook list/create take none). Without a Bearer token or export ticket, identity comes from the `?username=` / `?role=` query parameters on each request (default username `user`, default role `owner`). The first request for a username adds that user to the container's single shared default notebook (`Hoody Notes`); every query-identity user joins that same notebook, so it is not private. Use `notebooks.create` for a separate notebook.
- The HTTP API honours `X-Idempotency-Key` on node create, record create, document append, collaborator add, reactions and interactions. Notebook create, comment create and version create ignore it, so retrying those can create duplicates. Node create takes the key in its third argument, `nodes.create(nbId, body, { XIdempotencyKey: key })`; without one the SDK sends a fresh key per call, so its own retries are safe but a rerun of your code is not. Record create takes it as a per-call header in its last argument, `requestOptions.headers`: `records.create(nbId, dbId, body, undefined, { headers: { 'X-Idempotency-Key': key } })` (the `undefined` is the container-coordinates argument). `document.append` takes it as `options.XIdempotencyKey`, so the recommended document-writing path is retry-safe from the SDK. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `document.set`/`document.update`/`document.append` reject viewers and read-only collaborators with `403`. Documents attach only to `page` and `record` nodes; `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `nodes.list` `type:"section"` → pick `Home` → `nodes.create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `document.append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `document.set`. Creates the document if absent; pass an idempotency key (`options.XIdempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `notes.whoami` → `{userId,username,role,notebookId}`. The `notebookId` is the container's shared default notebook (`Hoody Notes`, with a `Home` section and starter pages), which every query-identity username joins; create your own with `notebooks.create` when the content must not be shared. `notebooks.list`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `document.set`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `document.set` OVERWRITES the whole document; `document.update` merges: top-level keys replace the stored ones, and `content.blocks` merges by block id (each sent block replaces the stored block with that id wholesale, omitted blocks are kept; removing a block takes `document.set`). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real block `type` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 2.
4. **Database CRUD** — `nodes.create` `type:"database"`; then `records.create`/`records.list`/`records.search`/`records.update` (merges `fields`)/`records.delete`. Page with `page`/`count` on `records.list` (count max 100). `records.listIterator` and `records.listAll` walk those pages for you (they advance `page` and size pages with `count`).
5. **Collaborators, comments + versions** — before sharing a node with someone new to the notebook, call `members.invite(notebookId, { users: [{ username, role: 'guest' }] })`, check the returned `errors`, and use the created user's `id` as the `collaboratorId` for `collaborators.add` (`admin`/`editor`/`collaborator`/`viewer`; managing node collaborators needs admin permission): a collaborator who is not yet a member of that notebook is refused with `404 user_not_found`. `comments.create` (top-level, anchored, or reply); `comments.update` / `comments.delete` / `comments.resolve` accept optional `expectedVersion` for optimistic concurrency. `versions.create`/`list`/`get`/`restore`.
6. **TUS upload + download** — the `fileId` is an input, not something the upload returns. First create the file node yourself: `nodes.create` with `type: 'file'` (without an `id`, the kit gives the node a file id, which ends in `18`, the only shape the upload routes accept; an `id` you pass yourself must be 22 lowercase hex chars + `'18'`), `parentId` (a node where you have editor rights), and `attributes: { subtype: 'image'|'video'|'audio'|'pdf'|'other', name, originalName, mimeType, extension: '' or '.ext', size, version: <22 lowercase hex chars> + '03', status: 0 }`. Only that node's creator can upload to it. Then run the TUS calls on that id. Send `Tus-Resumable: 1.0.0` on every one of them (POST, PATCH, HEAD and DELETE); any other value is refused with `412`. On `…/files/{fileId}/tus`: create the upload with `POST` and `Upload-Length`, send chunks with `PATCH` plus `Upload-Offset` and `Content-Type: application/offset+octet-stream`, check the resume offset with `HEAD`, or cancel with `DELETE`. Download with `files.download`. `files.upload(notebookId, data, { parentId, name })` does the whole sequence: it creates the file node with a valid `…18` id, sends the bytes over TUS and resolves once the file is ready. If it rejects after the node exists, `files.resumeUpload(notebookId, fileId, data)` continues from the offset the server holds (the id comes from the `onFileId` option or `err.fileId`), and `files.uploads.cancel(notebookId, fileId, { TusResumable: '1.0.0' })` abandons the upload (the options argument is required). A result with `alreadyUploaded: true` means the file was already recorded: the final response was lost, or another caller finished it. The helpers reject with `code` `NOTES_UPLOAD_LENGTH_MISMATCH`, `NOTES_UPLOAD_SIZE_MISMATCH`, `NOTES_UPLOAD_NOT_READY` or `NOTES_UPLOAD_NOT_A_FILE`; server refusals surface as `ApiError` with the notes code. `files.download` takes `(notebookId, fileId)`, notebook id first.{22}18$/.test(fileId)"]

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — a value the kit cannot repair stores silently but renders blank.** The valid block types are: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. `document.set` and `document.update` repair the unambiguous mistakes before validating: known type aliases (`code`, `quote`, `bullet_list_item`, `numbered_list_item`, `h1`, …) become the real type, with flat list items wrapped in a list, and `props` becomes `attrs` when the block has no `attrs`. Other write paths skip this repair, and it leaves anything ambiguous alone (an unknown type, a bare `list_item`). The block schema is loose (`type:z.string()`, `attrs:z.record`), so an unrepaired bad `type`/`props` is accepted with `200` and stored — the block is validated on the way in, but the ORIGINAL object is what gets written, so the junk key persists — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id. `document.set`/`document.update` move text found directly on a container with no children into a new child paragraph, but text on a container that already has children is left there and renders empty. See §Examples 0 and 2 for the exact nesting.
- **Prefer `document.append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types that do not support documents (only `page`/`record` do) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`document.set` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **A page needs a parent and a `name`: `nodes.create` with `type:"page"`, `parentId` and `attributes.name`.** The parent is the `Home` section (its id from `nodes.list` with `type:"section"`) or another page you can edit. With no `parentId` the kit answers `400 parent_required`: add the parent rather than creating a notebook. A `403 forbidden` is a real permission refusal (your role on the parent does not allow the create). The label is `name`; there is no `title` attribute, and a page without `name` fails with `500 unknown`.
- **`nodes.create` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — attribute validation throws before the create transaction's error handling can map it to a status (an unknown type or a `parentId` that does not exist gives `400`; no `parentId` for a node that needs one gives `400 parent_required`; a parent you cannot edit gives `403`). A section is root-only (a `parentId` gives `400 section_must_be_root`). If `attributes.collaborators` is omitted, the server adds the creator as `admin`; a map you send yourself must name you as `admin`, or the create is a `403` !== 'admin') {"]. For a note, reuse the auto-provisioned `Home` section.
- **`notebooks.create` always makes a new, separate notebook; it is not how you add a note.** It takes only `name` (plus optional `description`/`avatar`) and no parent: a notebook is top-level. It ignores `X-Idempotency-Key`, and names are not unique, so a retry or a second call with the same name makes a duplicate. Run `notebooks.list` first and reuse a notebook that has the name; to add a note, create a page in an existing notebook with `nodes.create`.
- Authentication re-anchors identity to the `notebookId` in the URL, so one bearer token reaches any notebook the username has joined.
- Cross-client convergence is **mutation-stream-driven** via the `mutations.sync` route + WS feed: each mutation type (`document.update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `document.set` is a last-writer-wins overwrite of the same store. `document.update` re-applies its merge to the current document when a concurrent write lands first, so two PATCHes that send different blocks both survive; two that send the same block id are last-writer-wins for that block, and a `document.set` racing a PATCH still overwrites whatever it omits.
- `notes.whoami` with `?username=&role=` does NOT create a per-user notebook: the first request for a username adds that user to the container's single shared default notebook (`Hoody Notes`, seeded with starting content) with the role from that request (default `owner`), and notebook routes then use that stored role. Every query-identity username shares that notebook, so use `notebooks.create` for private content. The `username`/`role`/`ticket` query parameters are read on every route, although the generated Reference does not list them. Priority Bearer → `ticket` → `?username=&role=`. Only a notes Bearer token (base64url JSON with `userId`, `notebookId`, `username`, `role`) is read: one that decodes to a JSON object but is malformed returns `401` with no fallback, while a JWT, an opaque token or another scheme is ignored and resolution continues with `ticket` or the query identity. An export `ticket` is accepted only on the HTML document export (`GET …/document?output=html`); on any other route it is a `400`. **Without a notes Bearer token, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=<name>` on every unauthenticated call, or attach a valid notes Bearer identity. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes** — content reads still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`. The TUS upload route refuses every method on a readonly notebook, the `HEAD` offset check included.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409. Only routes that implement it honour the header (see Prerequisites); notebook create does not.
- `records.update` merges `fields`. Database access uses the shared node-access check: it starts from your collaboration on the notebook **root** node (or your notebook role when there is none), returns `403` if an ancestor is a private `section` or a `channel` whose `collaborators` map omits you, and then applies the deepest explicit collaboration on the database's ancestor chain, so a role granted lower in the tree overrides the root one. Notebook owners/admins skip the privacy checks and keep their root-level role. A root collaboration alone is therefore NOT sufficient under such an ancestor, and a write refusal can come from a deeper collaboration. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.{22}18$/.test(fileId)"]
- `document.get` with `output=html` needs a short-lived export `ticket` (3 uses, 2 minutes) on `GET .../document`. `document.set` overwrites; `document.update` merges: top-level keys replace the stored ones, and `content.blocks` (a map by block id, or a list of blocks with distinct ids) merges by block id — a sent block replaces the stored block with that id, every other block is kept, and removing blocks takes a `document.set`. Any other `blocks` shape is a `400`. `comments.update` / `comments.delete` / `comments.resolve` accept optional `expectedVersion`.
- `records.search` matches against record names AND field values (not just names).
- Text filter operators in `records.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). The file node must already exist with a `…18` id (workflow 6). The generated `files.uploads.writeChunk` sends one chunk, but its response envelope hides the `Upload-Offset` header the next chunk needs, so use `files.upload` / `files.resumeUpload`, which track the offset.

## Common errors

- `400 validation_error` for request-schema failures (the only 400 that carries `details[]`); `400 bad_request` for checks inside a handler (no `details`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.{22}18$/.test(fileId)"]
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (a database write needs a collaboration granting you create rights).
- `404 not_found` — node/comment/version missing, or it does not belong to the `notebookId` given in the path. File routes use their own codes: `files.download` answers `400 file_not_found` for a missing file node or one outside the notebook, `400 file_not_ready` / `400 file_upload_not_found` for an upload that has not finished, and `404 file_not_found` when the stored bytes are missing; the TUS route answers `404 file_not_found` for a missing file node. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. The examples send no `?username=`, Bearer token or ticket, so every call runs as the default username `user`; to act as another user, add the same `?username=<name>` to every request (a username that appears on only some calls splits ownership between two users).

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
  `tableHeader`/`tableCell` → `paragraph`. The child's `parentId` is the container's id.
- `index` is a lexicographic ordering string per sibling group (server uses
  fractional indexing). For a brand-new document, monotonically increasing strings
  (`a0`,`a1`,`a2`,…) sort correctly. To INSERT between two existing blocks you need a
  key that sorts strictly between them — another reason to prefer append.
- Inline `content` leaves are `{ "type":"text", "text":"…", "marks?":[…] }`. Marks:
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
// identity.get takes no args. Without a Bearer identity, SDK calls send no ?username=,
// so they resolve as the default username "user" (as do the HTTP and CLI forms here).
const me = await client.notes.whoami();
const nb = await client.notes.notebooks.create({ name: 'team-wiki', description: 'engineering docs' });
const nbId = nb.data!.id;
```

**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `nodes.create` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```typescript
const list = await client.notes.nodes.list(nbId, { limit: 100 });
const sec = list.data!.nodes.find(n => n.type === 'section')!.id as string;   // node fields are typed unknown
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
`horizontalRule` only; containers (lists/tables) need `document.set` (Example 2).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```typescript
// One block from plain text. The idempotency key is passed via options.XIdempotencyKey
// (document.append exposes the X-Idempotency-Key header as an option).
await client.notes.document.append(
  nbId, pageId,
  { type: 'heading1', text: 'Runbook' },
  { XIdempotencyKey: 'runbook-h1' },
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
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
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

**Step 2 — mutate locally + PUT back.** Select the target block by its id (`B2` / `b2` from example 2) and leave every other block as it is; matching on `type` would also rewrite the paragraphs inside the list items. `index` orders a block among the children of the same parent only, by plain code-unit string comparison. The editor treats it as a fractional index, so give the block a key that sorts before its first sibling and is still a valid key: before `a0` that is `Zz`. An invalid key such as `_a0` is not stored as sent: a full-document PUT re-keys every sibling group that holds one (fresh `a0`, `a1`, … in the current order, so every sibling's `index` changes), and a PATCH that sends a new invalid index is refused with `400`.

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

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `nodes.create` for `type:"database"` requires an `attributes.fields` map (`{}` is valid while the database has no columns yet) — without the map the kit returns `500`, because attribute validation throws before the create transaction's error handling can map it to a status — a permission failure would be a `403`. Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

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

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

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

A simpler full-text alternative is `records.search?q=...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `records.update` PATCH MERGES `fields` (sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

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

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `records.create` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). From the SDK, pass it in `records.create`'s last argument: `{ headers: { 'X-Idempotency-Key': key } }`.

```typescript
import { createHash } from 'crypto';
// The rows to import: a header line, then name,priority,status per task
// (or read your own file with fs.readFileSync).
const csv = `name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress`;
const rows = csv.trim().split('\n').slice(1);
for (const row of rows) {
  const [name, pri, stat] = row.split(',');
  if (name === undefined || pri === undefined || stat === undefined) {
    throw new Error(`Expected name,priority,status: ${row}`);
  }
  const key = createHash('sha256').update(`import-2026-05-07:${name}`).digest('hex');
  // A rerun replays the saved response for the same key instead of adding a duplicate.
  await client.notes.records.create(nbId, dbId, {
    name,
    fields: {
      f_priority: { type: 'number',  value: Number(pri) },
      f_status:   { type: 'text',    value: stat },
      f_done:     { type: 'boolean', value: false },
    },
  }, undefined, { headers: { 'X-Idempotency-Key': key } });
}
```

### 9. Export a page to HTML — short-lived ticket flow

**Goal:** publish a static HTML snapshot of a page. `document.get` with `output=html` requires a short-lived export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Each ticket allows 3 uses and expires after 2 minutes. Anyone with the kit URL + ticket can download until it expires.

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
```

### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (one DELETE on the section empties the notebook). Then `notebooks.delete` removes the notebook itself.

`notebooks.delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `notebooks.list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```typescript
const recs = await client.notes.records.list(nbId, dbId, { count: 100 });
for (const r of recs.data!.records) {
  await client.notes.records.delete(nbId, dbId, r.id as string);
}
await client.notes.nodes.delete(nbId, dbId);
await client.notes.nodes.delete(nbId, sec);
try { await client.notes.notebooks.delete(nbId); }
catch { await client.notes.notebooks.update(nbId, { name: 'team-wiki-DELETED' }); }
```

## Reference

**Accessor:** `client.notes`  |  **Import:** `import * as notes from 'hoody-sdk/notes'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.notes.avatars` (2) — avatars

#### `download` — Download an avatar image

```typescript
client.notes.avatars.download(avatarId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `avatarId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/avatars/{avatarId}`
**CLI:** `hoody notes avatars download`

---

#### `upload` — Upload an avatar image

```typescript
client.notes.avatars.upload(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, _templateVars?: { projectId?: string; containerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, requestOptions?: { contentType?: 'image/jpeg' | 'image/png' | 'image/webp' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array> \| string` | body | Yes |  |

**Returns:** `Promise<NotesAvatarsUploadResponse>`  |  **HTTP:** `POST /api/v1/notes/avatars`
**CLI:** `hoody notes avatars upload`

---

### `client.notes.collaborators` (4) — collaborators

#### `add` — Add a collaborator

```typescript
client.notes.collaborators.add(notebookId: string, nodeId: string, data: NotesCollaboratorsAddRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesCollaboratorsAddRequest` | body | Yes |  |

**Body:** `{ collaboratorId*: string, role*: "admin" | "editor" | "collaborator" | "viewer" }`

**Returns:** `Promise<NotesCollaboratorsAddResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`
**CLI:** `hoody notes collaborators add`

---

#### `list` — List collaborators

```typescript
client.notes.collaborators.list(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesCollaboratorsListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`
**CLI:** `hoody notes collaborators list`

---

#### `remove` — Remove a collaborator

```typescript
client.notes.collaborators.remove(notebookId: string, nodeId: string, collaboratorId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `collaboratorId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesCollaboratorsRemoveResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`
**CLI:** `hoody notes collaborators remove`

---

#### `setRole` — Update collaborator role

```typescript
client.notes.collaborators.setRole(notebookId: string, nodeId: string, collaboratorId: string, data: NotesCollaboratorsSetRoleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `collaboratorId` | `string` | path | Yes |  |
| `data` | `NotesCollaboratorsSetRoleRequest` | body | Yes |  |

**Body:** `{ role*: "admin" | "editor" | "collaborator" | "viewer" }`

**Returns:** `Promise<NotesCollaboratorsSetRoleResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`
**CLI:** `hoody notes collaborators role set`

---

### `client.notes.comments` (11) — comments

#### `create` — Create a comment

```typescript
client.notes.comments.create(notebookId: string, nodeId: string, data: NotesCommentsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesCommentsCreateRequest` | body | Yes |  |

**Body:** `{ content*: string, parentId: string, anchorBlockId: string, anchor: object }`

**Returns:** `Promise<NotesCommentsCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments create`

---

#### `delete` — Delete a comment

```typescript
client.notes.comments.delete(notebookId: string, nodeId: string, commentId: string, options?: { expectedVersion?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `expectedVersion` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesCommentsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`
**CLI:** `hoody notes comments delete`

---

#### `list` — List comments

```typescript
client.notes.comments.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesCommentsListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments list`

---

#### `listAll` — List comments (collect all pages)

```typescript
client.notes.comments.listAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesCommentsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { comments?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.comments`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments list`

---

#### `listAnchors` — List comment anchors

```typescript
client.notes.comments.listAnchors(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesCommentsListAnchorsResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comments anchors list`

---

#### `listAnchorsAll` — List comment anchors (collect all pages)

```typescript
client.notes.comments.listAnchorsAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesCommentsListAnchorsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { anchors?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.anchors`, all pages collected (`listAnchors()` fetches one page). `listAnchorsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comments anchors list`

---

#### `listAnchorsIterator` — List comment anchors (async iterator)

```typescript
client.notes.comments.listAnchorsIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesCommentsListAnchorsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { anchors?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.anchors` per step, next page fetched on demand (`listAnchors()` fetches one page).  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comments anchors list`

---

#### `listIterator` — List comments (async iterator)

```typescript
client.notes.comments.listIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesCommentsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { comments?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.comments` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comments list`

---

#### `resolve` — Resolve a comment

```typescript
client.notes.comments.resolve(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsResolveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |
| `data` | `NotesCommentsResolveRequest` | body | Yes |  |

**Body:** `{ expectedVersion: int }`

**Returns:** `Promise<NotesCommentsResolveResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve`
**CLI:** `hoody notes comments resolve`

---

#### `setAnchor` — Re-anchor a comment thread

```typescript
client.notes.comments.setAnchor(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsSetAnchorRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |
| `data` | `NotesCommentsSetAnchorRequest` | body | Yes |  |

**Body:** `{ anchor*: object, expectedVersion: int }`

**Returns:** `Promise<NotesCommentsSetAnchorResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`
**CLI:** `hoody notes comments anchor set`

---

#### `update` — Edit a comment

```typescript
client.notes.comments.update(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |
| `data` | `NotesCommentsUpdateRequest` | body | Yes |  |

**Body:** `{ content*: string, expectedVersion: int }`

**Returns:** `Promise<NotesCommentsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`
**CLI:** `hoody notes comments update`

---

### `client.notes.document` (6) — documents

#### `append` — Append blocks to a document

```typescript
client.notes.document.append(notebookId: string, nodeId: string, data: NotesDocumentAppendRequest, options?: { IfMatch?: string; XIdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `IfMatch` | `string` | header `If-Match` | No | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). |
| `XIdempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409. |
| `data` | `NotesDocumentAppendRequest` | body | Yes |  |

**Body:** `{ text*: string, type: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"="paragraph", attrs: object|null } | { blocks*: object[] }`

**Returns:** `Promise<NotesDocumentAppendResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
**CLI:** `hoody notes document append`

---

#### `createExportTicket` — Create secure HTML export ticket

```typescript
client.notes.document.createExportTicket(notebookId: string, nodeId: string, data: NotesDocumentCreateExportTicketRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesDocumentCreateExportTicketRequest` | body | Yes |  |

**Body:** `{ output: "html"="html", includeComments: "none" | "appendix"="none", includeBackground: bool=true, themeMode: "light" | "dark"="dark", themeId: string|null, themeVariables: { [key: string]: string }, fileName: string }`

**Returns:** `Promise<NotesDocumentCreateExportTicketResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket`
**CLI:** `hoody notes document tickets create`

---

#### `exportBlock` — Export drawing block as SVG

```typescript
client.notes.document.exportBlock(notebookId: string, nodeId: string, blockId: string, options?: { bg?: string; scale?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `bg` | `string` | query | No |  |
| `scale` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `blockId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg`
**CLI:** `hoody notes document blocks export`

---

#### `get` — Get document content

```typescript
client.notes.document.get(notebookId: string, nodeId: string, options?: { blockIds?: string; lines?: string; output?: "json" | "md" | "html"; includeComments?: "none" | "appendix"; ticket?: string; IfNoneMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `blockIds` | `string` | query | No |  |
| `lines` | `string` | query | No |  |
| `output` | `"json" \| "md" \| "html"` | query | No |  |
| `includeComments` | `"none" \| "appendix"` | query | No |  |
| `ticket` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `IfNoneMatch` | `string` | header `If-None-Match` | No | Optional (RFC 9110): ETags of copies the caller already holds, or `*`. When the document is still at one of them the JSON output answers 304 with no body. Ignored by the Markdown and HTML outputs. |

**Returns:** `Promise<NotesDocumentGetResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes document get`

---

#### `set` — Create or replace document

```typescript
client.notes.document.set(notebookId: string, nodeId: string, data: NotesDocumentSetRequest, options?: { IfMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `IfMatch` | `string` | header `If-Match` | No | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). |
| `data` | `NotesDocumentSetRequest` | body | Yes |  |

**Body:** `{ content*: { [key: string]: any } }`

**Returns:** `Promise<NotesDocumentSetResponse>`  |  **HTTP:** `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes document set`

---

#### `update` — Merge document content

```typescript
client.notes.document.update(notebookId: string, nodeId: string, data: NotesDocumentUpdateRequest, options?: { IfMatch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `IfMatch` | `string` | header `If-Match` | No | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). |
| `data` | `NotesDocumentUpdateRequest` | body | Yes |  |

**Body:** `{ content*: { [key: string]: any } }`

**Returns:** `Promise<NotesDocumentUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes document update`

---

### `client.notes.files` (4) — files

#### `download` — Download a file

```typescript
client.notes.files.download(notebookId: string, fileId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}`
**CLI:** `hoody notes files download`

---

#### `list` — List all uploaded files

```typescript
client.notes.files.list(notebookId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesFilesListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes files list`

---

#### `listAll` — List all uploaded files (collect all pages)

```typescript
client.notes.files.listAll(notebookId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesFilesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { files?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.files`, all pages collected (`list()` fetches one page). Each item is `{ id*: string, name*: string, mimeType*: string, size*: number, createdAt*: string, createdBy*: string, documentId*: string, documentName*: string|null }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes files list`

---

#### `listIterator` — List all uploaded files (async iterator)

```typescript
client.notes.files.listIterator(notebookId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesFilesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { files?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.files` per step, next page fetched on demand (`list()` fetches one page). Each item is `{ id*: string, name*: string, mimeType*: string, size*: number, createdAt*: string, createdBy*: string, documentId*: string, documentName*: string|null }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes files list`

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

#### `cancel` — Abort a TUS upload

```typescript
client.notes.files.uploads.cancel(notebookId: string, fileId: string, options: { TusResumable: "1.0.0" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |
| `TusResumable` | `"1.0.0"` | header `Tus-Resumable` | Yes | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `create` — Create a resumable (TUS) upload

```typescript
client.notes.files.uploads.create(notebookId: string, fileId: string, options: { TusResumable: "1.0.0"; UploadLength: number; UploadMetadata?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |
| `TusResumable` | `"1.0.0"` | header `Tus-Resumable` | Yes | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |
| `UploadLength` | `number` | header `Upload-Length` | Yes | Total size of the file in bytes. Must equal the file node's `size` (set when the node was created), which must not exceed the notebook's maximum file size. Upload-Defer-Length is not supported. |
| `UploadMetadata` | `string` | header `Upload-Metadata` | No | Optional TUS metadata: comma-separated `key base64(value)` pairs. |

**Returns:** `Promise<NotesFilesUploadsCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `getOffset` — Check a TUS upload's offset (for resuming)

```typescript
client.notes.files.uploads.getOffset(notebookId: string, fileId: string, options: { TusResumable: "1.0.0" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |
| `TusResumable` | `"1.0.0"` | header `Tus-Resumable` | Yes | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |

**Returns:** `Promise<ApiResponse<Record<string, string>>>`  |  **HTTP:** `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `writeChunk` — Upload a chunk to a TUS upload

```typescript
client.notes.files.uploads.writeChunk(notebookId: string, fileId: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { TusResumable: "1.0.0"; UploadOffset: number; contentType?: 'application/offset+octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |
| `TusResumable` | `"1.0.0"` | header `Tus-Resumable` | Yes | TUS protocol version. Every TUS request must send `1.0.0`; anything else is refused with 412. |
| `UploadOffset` | `number` | header `Upload-Offset` | Yes | Offset this chunk starts at — the value the HEAD check (or the previous chunk) returned. |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array> \| string` | body | Yes |  |

**Returns:** `Promise<NotesFilesUploadsWriteChunkResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

### `client.notes.kit` (1) — health

#### `getHealth` — Service health and runtime info

```typescript
client.notes.kit.getHealth()
```

**Returns:** `Promise<NotesKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/notes/health`
**CLI:** `hoody notes health`

---

### `client.notes.members` (2) — users

#### `invite` — Invite users to notebook

```typescript
client.notes.members.invite(notebookId: string, data: NotesMembersInviteRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `NotesMembersInviteRequest` | body | Yes |  |

**Body:** `{ users*: { username*: string, role*: "owner" | "admin" | "collaborator" | "guest" | "none" }[] }`

**Returns:** `Promise<NotesMembersInviteResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/users`
**CLI:** `hoody notes members invite`

---

#### `setRole` — Update user role

```typescript
client.notes.members.setRole(notebookId: string, userId: string, data: NotesMembersSetRoleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `userId` | `string` | path | Yes |  |
| `data` | `NotesMembersSetRoleRequest` | body | Yes |  |

**Body:** `{ role*: "owner" | "admin" | "collaborator" | "guest" | "none" }`

**Returns:** `Promise<NotesMembersSetRoleResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role`
**CLI:** `hoody notes members role set`

---

### `client.notes.mutations` (1) — mutations

#### `sync` — Sync client mutations

```typescript
client.notes.mutations.sync(notebookId: string, data: NotesMutationsSyncRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `NotesMutationsSyncRequest` | body | Yes |  |

**Body:** `{ mutations*: object[] }`

**Returns:** `Promise<NotesMutationsSyncResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/mutations`

---

### `client.notes.nodes` (13) — nodes

#### `create` — Create a node

```typescript
client.notes.nodes.create(notebookId: string, data: NotesNodesCreateRequest, options?: { XIdempotencyKey?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `XIdempotencyKey` | `string` | header `X-Idempotency-Key` | No | Optional idempotency key (max 256 chars), such as a random UUID per node. Reusing the same key with an identical request body replays the original response instead of creating a second node; reusing it with a different body returns 409. |
| `data` | `NotesNodesCreateRequest` | body | Yes |  |

**Body:** `{ id: string, type*: string, parentId: string, attributes*: { [key: string]: any } }`

**Returns:** `Promise<NotesNodesCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes create`

---

#### `delete` — Delete a node

```typescript
client.notes.nodes.delete(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNodesDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes nodes delete`

---

#### `get` — Get a node

```typescript
client.notes.nodes.get(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNodesGetResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes nodes get`

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
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNodesListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes list`

---

#### `listAll` — List nodes (collect all pages)

```typescript
client.notes.nodes.listAll(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `string` | query | No |  |
| `parentId` | `string` | query | No |  |
| `rootId` | `string` | query | No |  |
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesNodesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { nodes?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.nodes`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes list`

---

#### `listChildren` — List child nodes

```typescript
client.notes.nodes.listChildren(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNodesListChildrenResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes nodes children list`

---

#### `listChildrenAll` — List child nodes (collect all pages)

```typescript
client.notes.nodes.listChildrenAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesNodesListChildrenResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { nodes?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.nodes`, all pages collected (`listChildren()` fetches one page). Each item is `{ [key: string]: any }`. `listChildrenIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes nodes children list`

---

#### `listChildrenIterator` — List child nodes (async iterator)

```typescript
client.notes.nodes.listChildrenIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesNodesListChildrenResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { nodes?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.nodes` per step, next page fetched on demand (`listChildren()` fetches one page). Each item is `{ [key: string]: any }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes nodes children list`

---

#### `listIterator` — List nodes (async iterator)

```typescript
client.notes.nodes.listIterator(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `string` | query | No |  |
| `parentId` | `string` | query | No |  |
| `rootId` | `string` | query | No |  |
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesNodesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { nodes?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.nodes` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes nodes list`

---

#### `markOpened` — Mark node as opened

```typescript
client.notes.nodes.markOpened(notebookId: string, nodeId: string, data: NotesNodesMarkOpenedRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesNodesMarkOpenedRequest` | body | Yes |  |

**Body:** `{ openedAt: string }`

**Returns:** `Promise<NotesNodesMarkOpenedResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`
**CLI:** `hoody notes nodes mark opened`

---

#### `markSeen` — Mark node as seen

```typescript
client.notes.nodes.markSeen(notebookId: string, nodeId: string, data: NotesNodesMarkSeenRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesNodesMarkSeenRequest` | body | Yes |  |

**Body:** `{ seenAt: string }`

**Returns:** `Promise<NotesNodesMarkSeenResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`
**CLI:** `hoody notes nodes mark seen`

---

#### `resolve` — Resolve page by alias

```typescript
client.notes.nodes.resolve(notebookId: string, alias: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `alias` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNodesResolveResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}`
**CLI:** `hoody notes nodes resolve`

---

#### `update` — Update a node

```typescript
client.notes.nodes.update(notebookId: string, nodeId: string, data: NotesNodesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesNodesUpdateRequest` | body | Yes |  |

**Body:** `{ attributes*: { [key: string]: any } }`

**Returns:** `Promise<NotesNodesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes nodes update`

---

### `client.notes.notebooks` (5) — notebooks

#### `create` — Create a notebook

```typescript
client.notes.notebooks.create(data: NotesNotebooksCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `NotesNotebooksCreateRequest` | body | Yes |  |

**Body:** `{ name*: string, description: string|null, avatar: string|null }`

**Returns:** `Promise<NotesNotebooksCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks`
**CLI:** `hoody notes notebooks create`

---

#### `delete` — Delete a notebook

```typescript
client.notes.notebooks.delete(notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNotebooksDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebooks delete`

---

#### `get` — Get notebook details

```typescript
client.notes.notebooks.get(notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesNotebooksGetResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebooks get`

---

#### `list` — List notebooks

```typescript
client.notes.notebooks.list()
```

**Returns:** `Promise<NotesNotebooksListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks`
**CLI:** `hoody notes notebooks list`

---

#### `update` — Update notebook settings

```typescript
client.notes.notebooks.update(notebookId: string, data: NotesNotebooksUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `NotesNotebooksUpdateRequest` | body | Yes |  |

**Body:** `{ name*: string, description: string|null, avatar: string|null }`

**Returns:** `Promise<NotesNotebooksUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebooks update`

---

### `client.notes` (1) — identity

#### `whoami` — Get current identity

```typescript
client.notes.whoami()
```

**Returns:** `Promise<NotesWhoamiResponse>`  |  **HTTP:** `GET /api/v1/notes/me`
**CLI:** `hoody notes whoami`

---

### `client.notes.reactions` (3) — reactions

#### `add` — Add a reaction

```typescript
client.notes.reactions.add(notebookId: string, nodeId: string, data: NotesReactionsAddRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `NotesReactionsAddRequest` | body | Yes |  |

**Body:** `{ reaction*: string }`

**Returns:** `Promise<NotesReactionsAddResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`
**CLI:** `hoody notes reactions add`

---

#### `list` — List reactions

```typescript
client.notes.reactions.list(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesReactionsListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`
**CLI:** `hoody notes reactions list`

---

#### `remove` — Remove a reaction

```typescript
client.notes.reactions.remove(notebookId: string, nodeId: string, reaction: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `reaction` | `string` | path | Yes |  |

**Returns:** `Promise<NotesReactionsRemoveResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}`
**CLI:** `hoody notes reactions remove`

---

### `client.notes.records` (8) — databases

#### `create` — Create a database record

```typescript
client.notes.records.create(notebookId: string, databaseId: string, data: NotesRecordsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `data` | `NotesRecordsCreateRequest` | body | Yes |  |

**Body:** `{ id: string, name: string="Untitled", avatar: string|null, fields: { [key: string]: object } }`

**Returns:** `Promise<NotesRecordsCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records create`

---

#### `delete` — Delete a database record

```typescript
client.notes.records.delete(notebookId: string, databaseId: string, recordId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesRecordsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes records delete`

---

#### `get` — Get a database record

```typescript
client.notes.records.get(notebookId: string, databaseId: string, recordId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesRecordsGetResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes records get`

---

#### `list` — List database records

```typescript
client.notes.records.list(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No |  |
| `sorts` | `string` | query | No |  |
| `page` | `number` | query | No |  |
| `count` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesRecordsListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records list`

---

#### `listAll` — List database records (collect all pages)

```typescript
client.notes.records.listAll(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No |  |
| `sorts` | `string` | query | No |  |
| `page` | `number` | query | No |  |
| `count` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesRecordsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { records?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.records`, all pages collected (`list()` fetches one page). Each item is `{ [key: string]: any }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records list`

---

#### `listIterator` — List database records (async iterator)

```typescript
client.notes.records.listIterator(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No |  |
| `sorts` | `string` | query | No |  |
| `page` | `number` | query | No |  |
| `count` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesRecordsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { records?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.records` per step, next page fetched on demand (`list()` fetches one page). Each item is `{ [key: string]: any }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes records list`

---

#### `search` — Search database records

```typescript
client.notes.records.search(notebookId: string, databaseId: string, options?: { q?: string; exclude?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `q` | `string` | query | No |  |
| `exclude` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesRecordsSearchResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`
**CLI:** `hoody notes records search`

---

#### `update` — Update a database record

```typescript
client.notes.records.update(notebookId: string, databaseId: string, recordId: string, data: NotesRecordsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |
| `data` | `NotesRecordsUpdateRequest` | body | Yes |  |

**Body:** `{ name: string, avatar: string|null, fields: { [key: string]: object } }`

**Returns:** `Promise<NotesRecordsUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes records update`

---

### `client.notes.sockets` (2) — sockets

#### `connect` — Open a WebSocket connection

```typescript
client.notes.sockets.connect(socketId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `socketId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesOpenSocketWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/notes/sockets/{socketId}`

---

#### `create` — Initialize a WebSocket session

```typescript
client.notes.sockets.create()
```

**Returns:** `Promise<NotesSocketsCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/sockets`

---

### `client.notes.versions` (7) — versions

#### `create` — Create a document version snapshot

```typescript
client.notes.versions.create(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesVersionsCreateResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions create`

---

#### `delete` — Delete a document version

```typescript
client.notes.versions.delete(notebookId: string, nodeId: string, versionId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `versionId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesVersionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`
**CLI:** `hoody notes versions delete`

---

#### `get` — Get a specific document version

```typescript
client.notes.versions.get(notebookId: string, nodeId: string, versionId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `versionId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesVersionsGetResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`
**CLI:** `hoody notes versions get`

---

#### `list` — List document versions

```typescript
client.notes.versions.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesVersionsListResponse>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions list`

---

#### `listAll` — List document versions (collect all pages)

```typescript
client.notes.versions.listAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<NotesVersionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { versions?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.versions`, all pages collected (`list()` fetches one page). Each item is `{ id*: string, documentId*: string, revision*: number, createdAt*: string, createdBy*: string }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions list`

---

#### `listIterator` — List document versions (async iterator)

```typescript
client.notes.versions.listIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<NotesVersionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { versions?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.versions` per step, next page fetched on demand (`list()` fetches one page). Each item is `{ id*: string, documentId*: string, revision*: number, createdAt*: string, createdBy*: string }`.  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes versions list`

---

#### `restore` — Restore a document version

```typescript
client.notes.versions.restore(notebookId: string, nodeId: string, versionId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `versionId` | `string` | path | Yes |  |

**Returns:** `Promise<NotesVersionsRestoreResponse>`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`
**CLI:** `hoody notes versions restore`

