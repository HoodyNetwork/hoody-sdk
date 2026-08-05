> _**CLI skill · `notes` namespace** · ~8,947 tokens · hoody-sdk v1.0.0-beta.11_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-container notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, container fs → `files`, desktop notifs → `notifications`, cross-container identity → `api`, scheduled writes → `cron`.

## Prerequisites

- `notebookId` per call; first `hoody notes whoami` auto-provisions notebook+user from `?username=` (default `user`).
- HTTP/raw fetch supports `X-Idempotency-Key` for retry-safe creates. **Most generated SDK service methods do NOT expose per-call request headers** (`requestOptions` has no `headers` field), so idempotency-keyed retries on those must use raw `fetch()` against the kit URL. **The exception is `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`, which accepts the key as `options.XIdempotencyKey`** — so the recommended document-writing path is fully retry-safe from the SDK. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `hoody notes doc put`/`hoody notes doc patch`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` resolve access via `getNodeAccess` and reject viewers/read-only collaborators with `403`. Documents attach only to `page` and `record` nodes (the node types that declare a `documentSchema`); `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `hoody notes node list` `type:"section"` → pick `Home` → `hoody notes node create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `hoody notes doc put`. Creates the document if absent; pass `X-Idempotency-Key` (SDK `options.XIdempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `hoody notes whoami` → `{userId,username,role,notebookId}` (auto-provisions a notebook + `Home` section + starter pages). `hoody notes notebook list`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `hoody notes doc put`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `hoody notes doc put` OVERWRITES the whole document; `hoody notes doc patch` shallow-merges at the TOP level only (submitting `content.blocks` REPLACES the entire blocks map — it does NOT merge per-block). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real `EditorNodeTypes` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 3.
4. **Database CRUD** — `hoody notes node create` `type:"database"`; then `hoody notes db create`/`hoody notes db list`/`hoody notes db search`/`hoody notes db update` (merges `fields`)/`hoody notes db delete`. Page with `page`/`count` on `hoody notes db list` (count max 100). ⚠ SDK-only: the auto-pagination helpers (listIterator / listAll) are misconfigured upstream — they send `limit`/`offset` while the route accepts `page`/`count`; prefer manual paged list loops.
5. **Comments + versions** — `hoody notes collab add` (`admin`/`editor`/`collaborator`/`viewer`). `hoody notes comment create` (top-level, anchored, or reply); `hoody notes comment edit`/`delete`/`hoody notes comment resolve` accept optional `expectedVersion` for optimistic concurrency. `hoody notes version create`/`list`/`get`/`hoody notes version restore`.
6. **TUS upload + download** — `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` for `fileId`; `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `PATCH`+`Upload-Offset`; `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `HEAD` returns resume offset; `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` cancels. `hoody notes file list`, `hoody notes file download`.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — wrong values store silently but render blank.** Valid block types are the `EditorNodeTypes` values: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. The block schema is loose (`type:z.string()`, `attrs:z.record`), so a bad `type`/`props` is accepted with `200` and stored — the CRDT bridge validates with `safeParse` but writes the ORIGINAL object, persisting the junk key — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id; putting text directly on the container makes it render empty. See §Examples 0 and 3 for the exact nesting.
- **Prefer `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types without a `documentSchema` (only `page`/`record`) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`hoody notes doc put` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **`hoody notes node create` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — `YDoc.update()` throws on the attribute `safeParse` before the create transaction's try/catch (unknown type / missing parent → `400`; permission/`canCreate` → `403`). A page needs `attributes.name` + `parentId` and cannot be root-level; a manually-created `section` must include `attributes.collaborators` with the creator as `admin` and is root-only — easiest is to reuse the auto-provisioned `Home` section.
- `notebookAuthenticator` re-anchors identity to URL `notebookId`; one bearer reaches any notebook the username joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` route + WS feed: each mutation type (`document.update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `hoody notes doc put`/`hoody notes doc patch` are last-writer-wins JSON overlays on top of the same store; two concurrent PATCHes will clobber each other unless drivers coordinate via the WS mutation feed.
- `identity.get?username=&role=` creates user+notebook and runs `initializeNotebookContent`. Priority Bearer → `ticket` → `?username=&role=`; invalid Bearer = 401 even with fallback. **Without any of the three, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=` on every unauthenticated call, or attach Bearer / `ticket`. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes only** — read endpoints still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409.
- `hoody notes db update` merges `fields`; access runs through `getNodeAccess(notebookId, databaseId, userId)`, which resolves your role from the `collaborations` row on the notebook **root** node, then walks the database's full ancestor chain and returns `403` if any ancestor is a private `section`, or a `channel` whose `attributes.collaborators` map omits you (notebook owner/admin bypasses the privacy walk). A root collaboration alone is therefore NOT sufficient. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.
- `documents.get?output=html` needs single-use export `ticket` on `GET .../document`. `hoody notes doc put` overwrites; `hoody notes doc patch` top-level spreads the request body over current content — submitting `content.blocks` REPLACES the blocks map, it does not merge per-block. For per-block CRDT merging use the `POST /api/v1/notes/notebooks/{notebookId}/mutations` WS feed instead. `hoody notes comment edit`/`delete`/`hoody notes comment resolve` accept optional `expectedVersion`.
- `hoody notes db search` matches against record names AND field values (not just names).
- Text filter operators in `databases.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). SDK-only: the generated tusUploadChunk method takes no chunk-body or Upload-Offset parameter, so drop to raw `@tus/client`/`fetch` for the actual byte transfer.

## Common errors

- `400 bad_request` validation (`details[]`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (db needs `collaborations` or `canCreate`).
- `404 not_found` — node/file/comment/version missing or `notebook_id` mismatch. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Every step in every example was live-tested against a real `notes-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first; bootstrap identity once with `GET /api/v1/notes/me?username=...&role=owner` to auto-provision `notebookId`.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `hoody notes doc put` body.** A document is
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

**Step 1 — bootstrap identity & create notebook.** First call to `hoody notes whoami` with `?username=&role=` auto-provisions a default notebook + Home section + Welcome page; pass it once per `username`. Then `hoody notes notebook create` for a second, named one.

```bash
hoody --container "$C" notes whoami
NBID=$(hoody --container "$C" notes notebook create \
  --name team-wiki --description 'engineering docs' -o json | jq -r .id)
```
**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `hoody notes node create` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(hoody --container "$C" notes node list --notebook-id "$NBID" -o json \
  | jq -r '.nodes[] | select(.type=="section") | .id' | head -1)
PAGE=$(hoody --container "$C" notes node create --notebook-id "$NBID" \
  --type page --parent-id "$SEC" --attributes name=Runbook -o json | jq -r .id)
```
**Step 3 — append the first content (recommended).** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `hoody notes doc put` (Example 3).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```bash
# There is no generated document-append CLI command (only doc get/put/patch), so
# use the kit HTTP endpoint directly:
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' \
  -d '{"type":"heading1","text":"Runbook"}'
```
### 2. Build a structured document with `hoody notes doc put` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`); a
wrong type/`props` is stored silently and renders blank. (2) `hoody notes doc patch` does
NOT merge by block id — it REPLACES the entire `blocks` map (live-verified). To add to
an existing doc, `GET` the current blocks, mutate locally, `PUT` the union back (or
just use `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`).

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
**Step 2 — mutate locally + PUT back.** Set the target block's `index` to a key that sorts FIRST (e.g. prefix `Z` → swap to `9`, or use a fresh small string like `_a0`); rewrite its `content`.

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `hoody notes node create` for `type:"database"` REQUIRES `attributes.fields` populated — without it the kit returns `500` (the attribute `safeParse` throws inside `YDoc.update` before the create transaction's try/catch — a `canCreate` failure would be a `403`). Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
# _(no native `hoody notes` shape)_ — `--fields` is a KEY=VALUE collector, so the
# JSON would be sent as a literal STRING and the server rejects the untyped value
# (`db create` 500s, `db update` 400s). Typed database fields are HTTP/SDK-only.
```
### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

```bash
hoody --container "$C" notes db list --notebook-id "$NBID" --database-id "$DBID" \
  --filters '[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]' \
  --sorts '[{"id":"s1","fieldId":"f_priority","direction":"desc"}]' \
  --count 50 -o json | jq '.records[] | {n:.name,p:.fields.f_priority.value}'
```
A simpler full-text alternative is `databases.search?q=...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `hoody notes db update` PATCH MERGES `fields` (live-verified: sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```bash
RID=$(hoody --container "$C" notes db list --notebook-id "$NBID" --database-id "$DBID" --count 50 -o json \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
# _(no native `hoody notes` shape for the update itself)_ — `--fields` is a KEY=VALUE
# collector and would send the typed union as a literal string (`400` at the route).
# Use the HTTP or SDK form below to write typed field values.
```
### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `hoody notes db create` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). The **generated SDK service methods do not expose per-call headers**, so idempotency keys must be sent via raw `fetch()` (or `client.api.http.*` low-level if available).

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 9. Export a page to HTML — single-use ticket flow

**Goal:** publish a static HTML snapshot of a page. `documents.get?output=html` requires a single-use export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Tickets default to 3 uses and expire in ~2 minutes (live-verified). Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
hoody --container "$C" notes doc get --notebook-id "$NBID" --node-id "$PAGE" \
  --output html --ticket "$TICKET" > /tmp/page.html
```
### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (live-verified — one DELETE on the section emptied the notebook). Then `hoody notes notebook delete` removes the notebook itself.

`hoody notes notebook delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `hoody notes notebook list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
hoody --container "$C" notes db list --notebook-id "$NBID" --database-id "$DBID" -o json \
  | jq -r '.records[].id' | while read RID; do
      hoody --container "$C" notes db delete --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID"
    done
hoody --container "$C" notes node delete --notebook-id "$NBID" --node-id "$DBID"
hoody --container "$C" notes node delete --notebook-id "$NBID" --node-id "$SEC"
hoody --container "$C" notes notebook delete --notebook-id "$NBID" || true
hoody --container "$C" notes notebook update --notebook-id "$NBID" --name team-wiki-DELETED
```

## Reference

### `hoody notes` (43) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes collab add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collab add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collab list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collab list --notebook-id abc-123 --node-id 1` |
| `hoody notes collab remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collab remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collab update` |  | write | Update a collaborator's role on a node | `notes.collaborators.update` | `hoody notes collab update --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comment anchors` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comment anchors --limit 500 --offset 0 --cursor <cursor> --notebook-id abc-123 --node-id 1` |
| `hoody notes comment create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comment create --notebook-id abc-123 --node-id 1 --content "Hello" --parent-id abc-123 --anchor-block-id abc-123 --anchor <anchor>` |
| `hoody notes comment delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comment delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comment edit` |  | write | Edit a comment's body | `notes.comments.edit` | `hoody notes comment edit --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content "Hello" --expected-version 10` |
| `hoody notes comment list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comment list --limit 100 --offset 0 --cursor <cursor> --notebook-id abc-123 --node-id 1` |
| `hoody notes comment resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comment resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes db create` |  | write | Create a new record in a database node | `notes.databases.create` | `hoody notes db create --notebook-id abc-123 --database-id abc-123 --id abc-123 --name Untitled --avatar https://example.com/avatar.png --fields <key=value>` |
| `hoody notes db delete` |  | destructive | Delete a database record | `notes.databases.delete` | `hoody notes db delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes db get` |  | read | Get a database record by id | `notes.databases.get` | `hoody notes db get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes db list` |  | read | List records in a database node | `notes.databases.listIterator` | `hoody notes db list --filters <filters> --sorts <sorts> --page 1 --count 50 --notebook-id abc-123 --database-id abc-123` |
| `hoody notes db search` |  | read | Search records in a database node | `notes.databases.search` | `hoody notes db search --q <q> --exclude "*.ts" --notebook-id abc-123 --database-id abc-123` |
| `hoody notes db update` |  | write | Update a database record's fields | `notes.databases.update` | `hoody notes db update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar https://example.com/avatar.png --fields <key=value>` |
| `hoody notes doc get` |  | read | Get document content for a node (rich-text body) | `notes.documents.get` | `hoody notes doc get --block-ids <block_ids> --lines 100 --include-comments none --ticket <ticket> --notebook-id abc-123 --node-id 1` |
| `hoody notes doc patch` |  | write | Merge changes into a node's document content | `notes.documents.patch` | `hoody notes doc patch --notebook-id abc-123 --node-id 1 --content <key=value>` |
| `hoody notes doc put` |  | write | Create or replace a node's document content (full overwrite) | `notes.documents.put` | `hoody notes doc put --notebook-id abc-123 --node-id 1 --content <key=value>` |
| `hoody notes file download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes file download --file-id abc-123 --notebook-id abc-123` |
| `hoody notes file list` |  | read | List file attachments in a notebook | `notes.files.listIterator` | `hoody notes file list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes node children` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes node children --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes node create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes node create --notebook-id abc-123 --id abc-123 --type default --parent-id abc-123 --attributes <key=value>` |
| `hoody notes node delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes node delete --notebook-id abc-123 --node-id 1` |
| `hoody notes node get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes node get --notebook-id abc-123 --node-id 1` |
| `hoody notes node get-by-alias` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.getByAlias` | `hoody notes node get-by-alias --notebook-id abc-123 --alias my-resource` |
| `hoody notes node list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes node list --type default --parent-id abc-123 --root-id abc-123 --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes node update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes node update --notebook-id abc-123 --node-id 1 --attributes <key=value>` |
| `hoody notes notebook create` |  | write | Create a new notebook (top-level workspace) | `notes.notebooks.create` | `hoody notes notebook create --name my-resource --description "My description" --avatar https://example.com/avatar.png` |
| `hoody notes notebook delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebook delete --notebook-id abc-123` |
| `hoody notes notebook get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebook get --notebook-id abc-123` |
| `hoody notes notebook list` |  | read | List notebooks the current user has access to | `notes.notebooks.listNotebooks` | `hoody notes notebook list` |
| `hoody notes notebook update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebook update --notebook-id abc-123 --name my-resource --description "My description" --avatar https://example.com/avatar.png` |
| `hoody notes reaction add` |  | write | Add an emoji reaction to a node | `notes.reactions.add` | `hoody notes reaction add --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes reaction list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reaction list --notebook-id abc-123 --node-id 1` |
| `hoody notes reaction remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reaction remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes user set-role` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.users.updateRole` | `hoody notes user set-role --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes version create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes version create --notebook-id abc-123 --node-id 1` |
| `hoody notes version delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes version delete --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes version get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes version get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes version list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes version list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes version restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes version restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.identity.get` | `hoody notes whoami` |

