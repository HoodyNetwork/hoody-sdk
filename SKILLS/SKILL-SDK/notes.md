> _**SDK skill · `notes` namespace** · ~15,697 tokens · hoody-sdk v1.0.0-beta.11_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-container notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, container fs → `files`, desktop notifs → `notifications`, cross-container identity → `api`, scheduled writes → `cron`.

## Prerequisites

- `notebookId` per call; first `identity.get` auto-provisions notebook+user from `?username=` (default `user`).
- HTTP/raw fetch supports `X-Idempotency-Key` for retry-safe creates. **Most generated SDK service methods do NOT expose per-call request headers** (`requestOptions` has no `headers` field), so idempotency-keyed retries on those must use raw `fetch()` against the kit URL. **The exception is `documents.appendDocument`, which accepts the key as `options.XIdempotencyKey`** — so the recommended document-writing path is fully retry-safe from the SDK. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `documents.put`/`patch`/`appendDocument` resolve access via `getNodeAccess` and reject viewers/read-only collaborators with `403`. Documents attach only to `page` and `record` nodes (the node types that declare a `documentSchema`); `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `nodes.list` `type:"section"` → pick `Home` → `nodes.create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `documents.appendDocument` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `documents.put`. Creates the document if absent; pass `X-Idempotency-Key` (SDK `options.XIdempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `identity.get` → `{userId,username,role,notebookId}` (auto-provisions a notebook + `Home` section + starter pages). `notebooks.listNotebooks`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `documents.put`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `documents.put` OVERWRITES the whole document; `documents.patch` shallow-merges at the TOP level only (submitting `content.blocks` REPLACES the entire blocks map — it does NOT merge per-block). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real `EditorNodeTypes` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 3.
4. **Database CRUD** — `nodes.create` `type:"database"`; then `databases.create`/`databases.list`/`databases.search`/`databases.update` (merges `fields`)/`databases.delete`. Page with `page`/`count` on `databases.list` (count max 100). ⚠ SDK-only: the auto-pagination helpers (listIterator / listAll) are misconfigured upstream — they send `limit`/`offset` while the route accepts `page`/`count`; prefer manual paged list loops.
5. **Comments + versions** — `collaborators.add` (`admin`/`editor`/`collaborator`/`viewer`). `comments.create` (top-level, anchored, or reply); `edit`/`delete`/`resolve` accept optional `expectedVersion` for optimistic concurrency. `versions.create`/`list`/`get`/`restore`.
6. **TUS upload + download** — `files.tusCreateUpload` for `fileId`; `tusUploadChunk` `PATCH`+`Upload-Offset`; `tusCheckUpload` `HEAD` returns resume offset; `tusAbortUpload` cancels. `files.listIterator`, `files.download`.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — wrong values store silently but render blank.** Valid block types are the `EditorNodeTypes` values: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. The block schema is loose (`type:z.string()`, `attrs:z.record`), so a bad `type`/`props` is accepted with `200` and stored — the CRDT bridge validates with `safeParse` but writes the ORIGINAL object, persisting the junk key — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id; putting text directly on the container makes it render empty. See §Examples 0 and 3 for the exact nesting.
- **Prefer `documents.appendDocument` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types without a `documentSchema` (only `page`/`record`) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`documents.put` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **`nodes.create` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — `YDoc.update()` throws on the attribute `safeParse` before the create transaction's try/catch (unknown type / missing parent → `400`; permission/`canCreate` → `403`). A page needs `attributes.name` + `parentId` and cannot be root-level; a manually-created `section` must include `attributes.collaborators` with the creator as `admin` and is root-only — easiest is to reuse the auto-provisioned `Home` section.
- `notebookAuthenticator` re-anchors identity to URL `notebookId`; one bearer reaches any notebook the username joined.
- Cross-client convergence is **mutation-stream-driven** via the `mutations.sync` route + WS feed: each mutation type (`document.update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `documents.put`/`patch` are last-writer-wins JSON overlays on top of the same store; two concurrent PATCHes will clobber each other unless drivers coordinate via the WS mutation feed.
- `identity.get?username=&role=` creates user+notebook and runs `initializeNotebookContent`. Priority Bearer → `ticket` → `?username=&role=`; invalid Bearer = 401 even with fallback. **Without any of the three, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=` on every unauthenticated call, or attach Bearer / `ticket`. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes only** — read endpoints still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409.
- `databases.update` merges `fields`; access runs through `getNodeAccess(notebookId, databaseId, userId)`, which resolves your role from the `collaborations` row on the notebook **root** node, then walks the database's full ancestor chain and returns `403` if any ancestor is a private `section`, or a `channel` whose `attributes.collaborators` map omits you (notebook owner/admin bypasses the privacy walk). A root collaboration alone is therefore NOT sufficient. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.
- `documents.get?output=html` needs single-use export `ticket` on `GET .../document`. `documents.put` overwrites; `documents.patch` top-level spreads the request body over current content — submitting `content.blocks` REPLACES the blocks map, it does not merge per-block. For per-block CRDT merging use the `mutations.sync` WS feed instead. `comments.edit`/`delete`/`resolve` accept optional `expectedVersion`.
- `databases.search` matches against record names AND field values (not just names).
- Text filter operators in `databases.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). SDK-only: the generated tusUploadChunk method takes no chunk-body or Upload-Offset parameter, so drop to raw `@tus/client`/`fetch` for the actual byte transfer.

## Common errors

- `400 bad_request` validation (`details[]`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (db needs `collaborations` or `canCreate`).
- `404 not_found` — node/file/comment/version missing or `notebook_id` mismatch. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Every step in every example was live-tested against a real `notes-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first; bootstrap identity once with `GET /api/v1/notes/me?username=...&role=owner` to auto-provision `notebookId`.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `documents.put` body.** A document is
`{ "content": { "type": "rich_text", "blocks": { "<blockId>": <block> } } }`. Each
block is `{ id, type, parentId, index, content?, attrs? }`:

- `type` is one of the real `EditorNodeTypes` strings. There is **no** `code`,
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
  (`attrs:{highlight}`); `comment` (`attrs:{commentId}`). `mention` is an inline NODE
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

**Step 1 — bootstrap identity & create notebook.** First call to `identity.get` with `?username=&role=` auto-provisions a default notebook + Home section + Welcome page; pass it once per `username`. Then `notebooks.create` for a second, named one.

```typescript
// identity.get takes no args; auto-provision via the HTTP path with ?username=&role= query
// once on first contact, then call identity.get() in the SDK after the user/notebook exist.
const me = await client.notes.identity.get();
const nb = await client.notes.notebooks.create({ name: 'team-wiki', description: 'engineering docs' });
const nbId = nb.data!.id;
```
**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `nodes.create` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```typescript
const list = await client.notes.nodes.list(nbId, { limit: 100 });
const sec = list.data!.nodes.find(n => n.type === 'section')!.id;
const page = await client.notes.nodes.create(nbId, {
  type: 'page',
  parentId: sec,
  attributes: { name: 'Runbook' },
});
const pageId = page.data!.id;
```
**Step 3 — append the first content (recommended).** `documents.appendDocument`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `documents.put` (Example 3).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```typescript
// One block from plain text. The idempotency key is passed via options.XIdempotencyKey
// (appendDocument is the one generated method that exposes a per-call header).
await client.notes.documents.appendDocument(
  nbId, pageId,
  { type: 'heading1', text: 'Runbook' },
  { XIdempotencyKey: 'runbook-h1' },
);
// A batch of flat blocks:
await client.notes.documents.appendDocument(nbId, pageId, {
  blocks: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Run the deploy script:' }] },
    { type: 'codeBlock', attrs: { language: 'bash' },
      content: [{ type: 'text', text: './deploy.sh prod' }] },
  ],
});
```
### 2. Build a structured document with `documents.put` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`); a
wrong type/`props` is stored silently and renders blank. (2) `documents.patch` does
NOT merge by block id — it REPLACES the entire `blocks` map (live-verified). To add to
an existing doc, `GET` the current blocks, mutate locally, `PUT` the union back (or
just use `appendDocument`).

```typescript
const mk = () => randomBytes(12).toString('hex');
const [b1, b2, b3, bl, li1, li1p, li2, li2p] = Array.from({ length: 8 }, mk);
await client.notes.documents.put(nbId, pageId, {
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
const doc = await client.notes.documents.get(nbId, pageId);
const blocks = (doc.data!.content as any).blocks;
```
**Step 2 — mutate locally + PUT back.** Set the target block's `index` to a key that sorts FIRST (e.g. prefix `Z` → swap to `9`, or use a fresh small string like `_a0`); rewrite its `content`.

```typescript
for (const b of Object.values(blocks) as any[]) {
  if (b.type === 'paragraph') {
    b.index = '_a0';
    b.content = [{ type: 'text', text: 'Updated intro paragraph (now first).' }];
  }
}
await client.notes.documents.put(nbId, pageId, { content: { type: 'rich_text', blocks } });
```
### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```typescript
delete blocks[b3];
await client.notes.documents.put(nbId, pageId, { content: { type: 'rich_text', blocks } });
const after = await client.notes.documents.get(nbId, pageId);
const order = Object.values((after.data!.content as any).blocks)
  .sort((a: any, b: any) => a.index.localeCompare(b.index)).map((b: any) => b.type);
```
### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `nodes.create` for `type:"database"` REQUIRES `attributes.fields` populated — without it the kit returns `500` (the attribute `safeParse` throws inside `YDoc.update` before the create transaction's try/catch — a `canCreate` failure would be a `403`). Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

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
const dbId = db.data!.id;
for (let i = 1; i <= 3; i++) {
  await client.notes.databases.create(nbId, dbId, {
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
const r = await client.notes.databases.list(nbId, dbId, {
  filters: JSON.stringify([
    { id: 'f1', type: 'field', fieldId: 'f_priority', operator: 'is_greater_than', value: 1 },
  ]),
  sorts: JSON.stringify([
    { id: 's1', fieldId: 'f_priority', direction: 'desc' },
  ]),
  count: 50,
});
```
A simpler full-text alternative is `databases.search?q=...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `databases.update` PATCH MERGES `fields` (live-verified: sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```typescript
const list = await client.notes.databases.list(nbId, dbId, { count: 50 });
const recordId = (list.data as any).records.find((r: any) => r.name === 'Task 1').id;
await client.notes.databases.update(nbId, dbId, recordId, {
  fields: {
    f_status: { type: 'text',    value: 'done' },
    f_done:   { type: 'boolean', value: true },
  },
});
```
### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `databases.create` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). The **generated SDK service methods do not expose per-call headers**, so idempotency keys must be sent via raw `fetch()` (or `client.api.http.*` low-level if available).

```typescript
// Generated SDK has no per-call header hook — drop down to raw fetch for X-Idempotency-Key.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
const rows = readFileSync('/tmp/tasks.csv', 'utf8').trim().split('\n').slice(1);
for (const row of rows) {
  const [name, pri, stat] = row.split(',');
  const key = createHash('sha256').update(`import-2026-05-07:${name}`).digest('hex');
  await fetch(`${kitUrl}/api/v1/notes/notebooks/${nbId}/databases/${dbId}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': key,
    },
    body: JSON.stringify({
      name,
      fields: {
        f_priority: { type: 'number',  value: Number(pri) },
        f_status:   { type: 'text',    value: stat },
        f_done:     { type: 'boolean', value: false },
      },
    }),
  });
}
// (`client.notes.databases.create(nbId, dbId, body)` cannot carry per-call headers —
// drop to raw `fetch()` for `X-Idempotency-Key`.)
```
### 9. Export a page to HTML — single-use ticket flow

**Goal:** publish a static HTML snapshot of a page. `documents.get?output=html` requires a single-use export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Tickets default to 3 uses and expire in ~2 minutes (live-verified). Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

```typescript
const t = await client.notes.documents.createExportTicket(nbId, pageId, {
  output: 'html', themeMode: 'light', includeComments: 'appendix',
});
const ticket = t.data!.ticket;
```
**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```typescript
const html = await client.notes.documents.get(nbId, pageId, { output: 'html', ticket });
```
### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (live-verified — one DELETE on the section emptied the notebook). Then `notebooks.delete` removes the notebook itself.

`notebooks.delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `notebooks.listNotebooks` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```typescript
const recs = await client.notes.databases.list(nbId, dbId, { count: 100 });
for (const r of recs.data!.records) {
  await client.notes.databases.delete(nbId, dbId, r.id);
}
await client.notes.nodes.delete(nbId, dbId);
await client.notes.nodes.delete(nbId, sec);
try { await client.notes.notebooks.delete(nbId); }
catch { await client.notes.notebooks.update(nbId, { name: 'team-wiki-DELETED' }); }
```

## Reference

**Accessor:** `client.notes`  |  **Import:** `import * as notes from 'hoody-sdk/notes'`

### `client.notes.avatars` (2) — avatars

#### `download` — Download an avatar image

```typescript
client.notes.avatars.download(avatarId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `avatarId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/avatars/{avatarId}`

---

#### `upload` — Upload an avatar image

```typescript
client.notes.avatars.upload()
```

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/avatars`

---

### `client.notes.collaborators` (4) — collaborators

#### `add` — Add a collaborator

```typescript
client.notes.collaborators.add(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ collaboratorId*: string, role*: "admin" | "editor" | "collaborator" | "viewer" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`
**CLI:** `hoody notes collab add`

---

#### `list` — List collaborators

```typescript
client.notes.collaborators.list(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`
**CLI:** `hoody notes collab list`

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

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`
**CLI:** `hoody notes collab remove`

---

#### `update` — Update collaborator role

```typescript
client.notes.collaborators.update(notebookId: string, nodeId: string, collaboratorId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `collaboratorId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ role*: "admin" | "editor" | "collaborator" | "viewer" }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`
**CLI:** `hoody notes collab update`

---

### `client.notes.comments` (7) — comments

#### `create` — Create a comment

```typescript
client.notes.comments.create(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ content*: string, parentId: string, anchorBlockId: string, anchor: object }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comment create`

---

#### `delete` — Delete a comment

```typescript
client.notes.comments.delete(expectedVersion?: integer, notebookId: string, nodeId: string, commentId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `expectedVersion` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`
**CLI:** `hoody notes comment delete`

---

#### `edit` — Edit a comment

```typescript
client.notes.comments.edit(notebookId: string, nodeId: string, commentId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ content*: string, expectedVersion: int }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`
**CLI:** `hoody notes comment edit`

---

#### `list` — List comments

```typescript
client.notes.comments.list(limit?: integer, offset?: integer, cursor?: string, notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`
**CLI:** `hoody notes comment list`

---

#### `listAnchors` — List comment anchors

```typescript
client.notes.comments.listAnchors(limit?: integer, offset?: integer, cursor?: string, notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `cursor` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`
**CLI:** `hoody notes comment anchors`

---

#### `reanchor` — Re-anchor a comment thread

```typescript
client.notes.comments.reanchor(notebookId: string, nodeId: string, commentId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ anchor*: object, expectedVersion: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`

---

#### `resolve` — Resolve a comment

```typescript
client.notes.comments.resolve(notebookId: string, nodeId: string, commentId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `commentId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ expectedVersion: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve`
**CLI:** `hoody notes comment resolve`

---

### `client.notes.databases` (8) — databases

#### `create` — Create a database record

```typescript
client.notes.databases.create(notebookId: string, databaseId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ id: string, name: string="Untitled", avatar: string | null, fields: { [key: string]: any } }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes db create`

---

#### `delete` — Delete a database record

```typescript
client.notes.databases.delete(notebookId: string, databaseId: string, recordId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes db delete`

---

#### `get` — Get a database record

```typescript
client.notes.databases.get(notebookId: string, databaseId: string, recordId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes db get`

---

#### `list` — List database records

```typescript
client.notes.databases.list(filters?: string, sorts?: string, page?: integer, count?: integer, notebookId: string, databaseId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No |  |
| `sorts` | `string` | query | No |  |
| `page` | `integer` | query | No |  |
| `count` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes db list`

---

#### `listAll` — List database records (collect all pages)

```typescript
client.notes.databases.listAll(filters?: string, sorts?: string, page?: integer, count?: integer, notebookId: string, databaseId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No |  |
| `sorts` | `string` | query | No |  |
| `page` | `integer` | query | No |  |
| `count` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes db list`

---

#### `listIterator` — List database records (async iterator)

```typescript
client.notes.databases.listIterator(filters?: string, sorts?: string, page?: integer, count?: integer, notebookId: string, databaseId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `filters` | `string` | query | No |  |
| `sorts` | `string` | query | No |  |
| `page` | `integer` | query | No |  |
| `count` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`
**CLI:** `hoody notes db list`

---

#### `search` — Search database records

```typescript
client.notes.databases.search(q?: string, exclude?: string, notebookId: string, databaseId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `q` | `string` | query | No |  |
| `exclude` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`
**CLI:** `hoody notes db search`

---

#### `update` — Update a database record

```typescript
client.notes.databases.update(notebookId: string, databaseId: string, recordId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `databaseId` | `string` | path | Yes |  |
| `recordId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ name: string, avatar: string | null, fields: { [key: string]: object } }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`
**CLI:** `hoody notes db update`

---

### `client.notes.documents` (6) — documents

#### `appendDocument` — Append blocks to a document

```typescript
client.notes.documents.appendDocument(notebookId: string, nodeId: string, X-Idempotency-Key?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `X-Idempotency-Key` | `string` | header | No | Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409. |
| `data` | `object` | body | Yes |  |

**Body:** `{ text*: string, type: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"="paragraph", attrs: object | null } | { blocks*: object[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`

---

#### `createExportTicket` — Create secure HTML export ticket

```typescript
client.notes.documents.createExportTicket(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ output: "html"="html", includeComments: "none" | "appendix"="none", includeBackground: bool=true, themeMode: "light" | "dark"="dark", themeId: string | null, themeVariables: { [key: string]: string }, fileName: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket`

---

#### `exportBlockSvg` — Export drawing block as SVG

```typescript
client.notes.documents.exportBlockSvg(bg?: string, scale?: number, notebookId: string, nodeId: string, blockId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `bg` | `string` | query | No |  |
| `scale` | `number` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `blockId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg`

---

#### `get` — Get document content

```typescript
client.notes.documents.get(blockIds?: string, lines?: string, output?: string, includeComments?: string, ticket?: string, notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `blockIds` | `string` | query | No |  |
| `lines` | `string` | query | No |  |
| `output` | `string` | query | No |  |
| `includeComments` | `string` | query | No |  |
| `ticket` | `string` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes doc get`

---

#### `patch` — Merge document content

```typescript
client.notes.documents.patch(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ content*: { [key: string]: any } }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes doc patch`

---

#### `put` — Create or replace document

```typescript
client.notes.documents.put(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ content*: { [key: string]: any } }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`
**CLI:** `hoody notes doc put`

---

### `client.notes.files` (8) — files

#### `download` — Download a file

```typescript
client.notes.files.download(fileId: string, notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `fileId` | `string` | path | Yes |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}`
**CLI:** `hoody notes file download`

---

#### `list` — List all uploaded files

```typescript
client.notes.files.list(limit?: integer, offset?: integer, notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes file list`

---

#### `listAll` — List all uploaded files (collect all pages)

```typescript
client.notes.files.listAll(limit?: integer, offset?: integer, notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes file list`

---

#### `listIterator` — List all uploaded files (async iterator)

```typescript
client.notes.files.listIterator(limit?: integer, offset?: integer, notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/files`
**CLI:** `hoody notes file list`

---

#### `tusAbortUpload` — Abort a TUS upload

```typescript
client.notes.files.tusAbortUpload(notebookId: string, fileId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `tusCheckUpload` — Check a TUS upload's offset (for resuming)

```typescript
client.notes.files.tusCheckUpload(notebookId: string, fileId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `tusCreateUpload` — Create a resumable (TUS) upload

```typescript
client.notes.files.tusCreateUpload(notebookId: string, fileId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

#### `tusUploadChunk` — Upload a chunk to a TUS upload

```typescript
client.notes.files.tusUploadChunk(notebookId: string, fileId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `fileId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

---

### `client.notes.health` (1) — health

#### `check` — Service health and runtime info

```typescript
client.notes.health.check()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/health`

---

### `client.notes.identity` (1) — identity

#### `get` — Get current identity

```typescript
client.notes.identity.get()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/me`
**CLI:** `hoody notes whoami`

---

### `client.notes.interactions` (2) — interactions

#### `markOpened` — Mark node as opened

```typescript
client.notes.interactions.markOpened(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ openedAt: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`

---

#### `markSeen` — Mark node as seen

```typescript
client.notes.interactions.markSeen(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ seenAt: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`

---

### `client.notes.mutations` (1) — mutations

#### `sync` — Sync client mutations

```typescript
client.notes.mutations.sync(notebookId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ mutations*: object[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/mutations`

---

### `client.notes.nodes` (7) — nodes

#### `create` — Create a node

```typescript
client.notes.nodes.create(notebookId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ id: string, type*: string, parentId: string, attributes*: { [key: string]: any } }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes node create`

---

#### `delete` — Delete a node

```typescript
client.notes.nodes.delete(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes node delete`

---

#### `get` — Get a node

```typescript
client.notes.nodes.get(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes node get`

---

#### `getByAlias` — Resolve page by alias

```typescript
client.notes.nodes.getByAlias(notebookId: string, alias: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `alias` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}`
**CLI:** `hoody notes node get-by-alias`

---

#### `list` — List nodes

```typescript
client.notes.nodes.list(type?: string, parentId?: string, rootId?: string, limit?: integer, offset?: integer, notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `string` | query | No |  |
| `parentId` | `string` | query | No |  |
| `rootId` | `string` | query | No |  |
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes`
**CLI:** `hoody notes node list`

---

#### `listChildren` — List child nodes

```typescript
client.notes.nodes.listChildren(limit?: integer, offset?: integer, notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`
**CLI:** `hoody notes node children`

---

#### `update` — Update a node

```typescript
client.notes.nodes.update(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ attributes*: { [key: string]: any } }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`
**CLI:** `hoody notes node update`

---

### `client.notes.notebooks` (5) — notebooks

#### `create` — Create a notebook

```typescript
client.notes.notebooks.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, description: string | null, avatar: string | null }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks`
**CLI:** `hoody notes notebook create`

---

#### `delete` — Delete a notebook

```typescript
client.notes.notebooks.delete(notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebook delete`

---

#### `get` — Get notebook details

```typescript
client.notes.notebooks.get(notebookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebook get`

---

#### `listNotebooks` — List notebooks

```typescript
client.notes.notebooks.listNotebooks()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks`
**CLI:** `hoody notes notebook list`

---

#### `update` — Update notebook settings

```typescript
client.notes.notebooks.update(notebookId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, description: string | null, avatar: string | null }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}`
**CLI:** `hoody notes notebook update`

---

### `client.notes.reactions` (3) — reactions

#### `add` — Add a reaction

```typescript
client.notes.reactions.add(notebookId: string, nodeId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ reaction*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`
**CLI:** `hoody notes reaction add`

---

#### `list` — List reactions

```typescript
client.notes.reactions.list(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`
**CLI:** `hoody notes reaction list`

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

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}`
**CLI:** `hoody notes reaction remove`

---

### `client.notes.sockets` (2) — sockets

#### `init` — Initialize a WebSocket session

```typescript
client.notes.sockets.init()
```

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/sockets`

---

#### `open` — Open a WebSocket connection

```typescript
client.notes.sockets.open(socketId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `socketId` | `string` | path | Yes |  |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/notes/sockets/{socketId}`

---

### `client.notes.users` (2) — users

#### `invite` — Invite users to notebook

```typescript
client.notes.users.invite(notebookId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ users*: ({ username*: string, role*: "owner" | "admin" | "collaborator" | "guest" | "none" })[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/users`

---

#### `updateRole` — Update user role

```typescript
client.notes.users.updateRole(notebookId: string, userId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `userId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ role*: "owner" | "admin" | "collaborator" | "guest" | "none" }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role`
**CLI:** `hoody notes user set-role`

---

### `client.notes.versions` (5) — versions

#### `create` — Create a document version snapshot

```typescript
client.notes.versions.create(notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes version create`

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

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`
**CLI:** `hoody notes version delete`

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

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`
**CLI:** `hoody notes version get`

---

#### `list` — List document versions

```typescript
client.notes.versions.list(limit?: integer, offset?: integer, notebookId: string, nodeId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `notebookId` | `string` | path | Yes |  |
| `nodeId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`
**CLI:** `hoody notes version list`

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

**Returns:** `any`  |  **HTTP:** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`
**CLI:** `hoody notes version restore`

