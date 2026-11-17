// The connect forms of the storage types the page has no hand-made form for, generated from the files program's
// openapi (its openapi.json, POST /api/v1/backends/<type>: one flat schema per type). The output is checked in
// as providers.gen.json and read by providers.ts; generate.test.ts fails when it no longer matches the openapi, and
// writes it again with HUB_STORAGE_REGEN=1 (see that test). Pure: no file or network access here.
//
// Mapping: string / integer / boolean → text / int / boolean; enum → select; a one-value enum is
// fixed (the program takes nothing else: sent when required, otherwise left out and not shown); required → required
// and first; a text field is secret (masked, never prefilled, cleared like a password, a secret of the connect route)
// unless it is an address or its name is on the one reviewed plain list (PLAIN_TEXT, with the program's own
// IDENTIFIER_KEYS): a field nobody reviewed fails closed. format password and the program's CREDENTIAL_KEYS (both
// lists copied from the files program's source and checked against it) are secret whatever the list says;
// an address (the program's host and URL fields) refuses a password written inside it; a description that starts "OAuth token, as a JSON object" → token (rclone authorize); x-examples →
// suggestions, never a closed list; default and description → hint. A property of any other shape stops the
// generator: a person decides how the form takes it.

export type GenKind = 'text' | 'secret' | 'int' | 'boolean' | 'select' | 'token';
export interface GenField {
  key: string;
  kind: GenKind;
  label: string;
  required?: true;
  /** Shown first, above "More options" (required, the token, and the account, address and credential fields). */
  main?: true;
  options?: string[];
  suggest?: string[];
  /** The program's default, shown in the hint and never sent (an empty field leaves it to the program). */
  default?: string | number | boolean;
  hint?: string;
  address?: true;
  name?: true;
  needs?: string;
}
export interface GenType {
  id: string;
  label: string;
  token?: true;
  fields: GenField[];
  /** One-value enums the program requires: sent as they are, never shown. */
  fixed?: Record<string, string>;
}
export interface GenS3Choice {
  /** What the S3 form's provider field is set to; `type` instead opens that type's own form. */
  provider?: string;
  type?: string;
  label: string;
}
export interface GenTable {
  /** Every type the openapi can connect, hand-made forms included (the coverage test reads it). */
  types: string[];
  generated: GenType[];
  /** The S3-compatible services offered as their own choices in the picker. */
  s3: GenS3Choice[];
}

/** The types with a hand-made form (providers.ts). */
export const HAND_TYPES: readonly string[] = ['s3', 'sftp', 'webdav', 'mega', 'smb', 'ftp', 'drive', 'dropbox', 'onedrive', 'pcloud', 'box'];

/** The files program's credential names: option names the program always treats as secret. */
export const CREDENTIAL_KEYS: readonly string[] = [
  'pass', 'password', 'api_password', 'client_certificate_password', 'file_password', 'folder_password', 'link_password',
  'mailbox_password', 'key', 'key_pem', 'key_file_pass', 'passphrase', 'private_key', 'private_access_key', 'secret',
  'secret_key', 'secret_access_key', 'session_token', 'otp_secret_key', 'sse_customer_key', 'sse_customer_key_base64',
  'sse_customer_key_md5', 'token', 'access_token', 'refresh_token', 'auth_token', 'bearer_token', 'permanent_token',
  'app_token', 'authorization', 'api_key', 'api_secret', 'application_credential_secret', 'client_secret', 'sas_url',
  'connection_string', 'service_account_credentials', 'config_credentials', 'ibm_api_key', 'web_token',
  'sse_customer_key_sha256',
];
/** The files program's identifier names: names of the account, principal, server or folder. Never secret; shown first. */
export const IDENTIFIER_KEYS: readonly string[] = [
  'host', 'url', 'api_url', 'namenode', 'user', 'username', 'user_id', 'email', 'apple_id', 'account', 'account_id',
  'access_key_id', 'public_key', 'app_id', 'client_id', 'tenant', 'tenant_id', 'tenant_domain', 'domain', 'spn',
  'service_principal_name', 'msi_object_id', 'msi_client_id', 'msi_mi_res_id', 'application_credential_id',
  'application_credential_name', 'impersonate', 'impersonate_admin', 'cloud_name', 'namespace', 'compartment',
  'project_number', 'user_project', 'drive_id', 'team_drive', 'root_folder_id', 'root_folder_slug', 'root_id',
  'deleted_id', 'sse_kms_key_id',
];
/** The one reviewed list of text fields that hold no secret (beyond the program's IDENTIFIER_KEYS): names, places,
 *  sizes, modes, times. Every other text field of every form is secret. A name the program treats as a credential never
 *  belongs here (the tests walk every field of every form against this list). Not here on purpose: protondrive
 *  client_uid and pikpak device_id (rclone marks them sensitive; hoody-files keeps them out of a backend's identity). */
export const PLAIN_TEXT: readonly string[] = [
  // hand-made forms
  'provider', 'region', 'port', 'vendor', 'drive_type',
  // generated forms
  'access', 'access_tier', 'app_version', 'authorization_expiry', 'batch_mode', 'bucket_acl', 'chunk_size', 'copy_cutoff',
  'data_transfer_protection', 'description', 'effective_upload_time', 'encoding', 'endpoint_type', 'hash_memory_limit',
  'item_metadata', 'library', 'location', 'max_stream_size', 'maximal_summary_chunk_size', 'md5_memory_limit',
  'media_extensions', 'minimal_chunk_size', 'mountid', 'object_acl', 'protocol', 'public_access', 'root_prefix',
  'scope_access', 'scope_role', 'service', 'share_name', 'shared_folder', 'speedup_file_patterns', 'speedup_max_disk',
  'speedup_max_memory', 'sse_customer_algorithm', 'storage_class', 'storage_policy', 'storage_tier', 'test_mode',
  'token_expiry', 'tpslimit', 'upload_cutoff', 'upload_preset', 'upload_resume_limit', 'upload_tags',
  'use_segments_container', 'user_agent', 'version', 'version_at', 'zone',
];
/** A text field holding no secret: on the reviewed list or one of the program's identifiers (neither list names a
 *  credential of the program: generate.test.ts checks both). */
export const plainKey = (key: string): boolean => PLAIN_TEXT.includes(key) || IDENTIFIER_KEYS.includes(key);
/** Not shown first even though they name an account or credential: rarely needed. */
const NOT_MAIN = /^(sse_|msi_|impersonate|deleted_id$|client_certificate_password$|root_folder_|root_id$|team_drive$)/;
/** Shown first when the type has them. */
const MAIN_EXTRA: readonly string[] = ['endpoint', 'auth', 'region'];
/** An address: a password or token written inside it is refused (logic.ts addressHasCredentials). */
const ADDRESS = /(^|_)(url|host|hostname|endpoint|server|namenode)$|^auth$/;
/** The files program's two lists of host fields (copied, and checked against its source): fields that
 *  hold a host or URL. With its URL-option rule (url, endpoint, auth, *_url, *_endpoint) they are addresses. */
export const HOST_FIELDS: readonly string[] = [
  'host', 'url', 'endpoint', 'server', 'auth', 'sas_url', 'hostname', 'namenode', 'storage_url', 'api_url', 'download_url',
  'upload_prefix', 'satellite_address', 'site', 'socks_proxy', 'proxy', 'sts_endpoint', 'front_endpoint', 'http_proxy',
  'ibm_iam_endpoint', 'tenant_url', 'token_url', 'auth_url',
];
export const isAddressKey = (key: string): boolean => ADDRESS.test(key) || HOST_FIELDS.includes(key) || /(_url|_endpoint)$/.test(key);
// The program's wording for its OAuth token field, and the one it had before.
const OAUTH_TOKEN = /^OAuth (?:token, as a JSON object|Access Token as a JSON blob)/;

/** S3 provider names as people know them; a provider missing here stops the generator (the test names it). */
export const S3_NAMES: Readonly<Record<string, string>> = {
  AWS: 'Amazon S3', Alibaba: 'Alibaba Cloud OSS', ArvanCloud: 'ArvanCloud', BizflyCloud: 'Bizfly Cloud', Ceph: 'Ceph',
  ChinaMobile: 'China Mobile Ecloud', Cloudflare: 'Cloudflare R2', Cubbit: 'Cubbit', DigitalOcean: 'DigitalOcean Spaces',
  Dreamhost: 'DreamHost DreamObjects', Exaba: 'Exaba', Fastly: 'Fastly Object Storage', FileLu: 'FileLu S5',
  FlashBlade: 'Pure Storage FlashBlade', GCS: 'Google Cloud Storage (S3 API)', HCP: 'Hitachi Content Platform',
  Hetzner: 'Hetzner Object Storage', HuaweiOBS: 'Huawei OBS', IBMCOS: 'IBM Cloud Object Storage', IDrive: 'IDrive e2',
  ImpossibleCloud: 'Impossible Cloud', Intercolo: 'Intercolo', IONOS: 'IONOS Cloud', Leviia: 'Leviia', Liara: 'Liara',
  Linode: 'Linode Object Storage', LyveCloud: 'Seagate Lyve Cloud', Magalu: 'Magalu Cloud', Mega: 'MEGA S4',
  Minio: 'MinIO', Netease: 'Netease NOS', Outscale: 'Outscale OOS', OVHcloud: 'OVHcloud Object Storage',
  Petabox: 'Petabox', Qiniu: 'Qiniu Kodo', Rabata: 'Rabata', RackCorp: 'RackCorp', Scaleway: 'Scaleway',
  Scality: 'Scality', SeaweedFS: 'SeaweedFS', Selectel: 'Selectel', Servercore: 'Servercore',
  SpectraLogic: 'Spectra Logic', Storj: 'Storj', Synology: 'Synology C2', TencentCOS: 'Tencent COS', US3: 'UCloud US3',
  Wasabi: 'Wasabi', Zadara: 'Zadara', Zata: 'Zata', ZeroServices: 'Zero Services', Other: 'Other S3-compatible service',
};
/** Not offered: the platform's own storage. */
export const S3_HIDDEN: readonly string[] = ['Hoody-VFS'];
/** Offered under S3 but opening another type's own form, named as that type (Backblaze B2 opens b2). */
export const S3_EXTRA: readonly string[] = ['b2'];

const ACRONYMS: Readonly<Record<string, string>> = {
  api: 'API', url: 'URL', id: 'ID', ids: 'IDs', sse: 'SSE', kms: 'KMS', md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256',
  sas: 'SAS', otp: 'OTP', http: 'HTTP', https: 'HTTPS', oauth: 'OAuth', msi: 'MSI', spn: 'SPN', tls: 'TLS', ssl: 'SSL',
  ca: 'CA', acl: 'ACL', s3: 'S3', aws: 'AWS', dns: 'DNS', ip: 'IP', uri: 'URI', pem: 'PEM', jwt: 'JWT', cdn: 'CDN',
  az: 'Azure CLI', gcs: 'GCS', iam: 'IAM', sts: 'STS', ibm: 'IBM', utc: 'UTC', ttl: 'TTL', ua: 'User agent', b2: 'B2',
};

export class GenerateError extends Error {}
const fail = (msg: string): never => { throw new GenerateError(msg); };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `chunk_size` → "Chunk size"; `sse_kms_key_id` → "SSE KMS key ID". */
export function labelOf(key: string): string {
  const words = key.split(/[_-]+/).filter(Boolean).map((w) => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase());
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The first paragraph of an openapi description, on one line, cut at a sentence end within 200 characters. */
export function hintOf(description: unknown): string {
  if (typeof description !== 'string') return '';
  const para = (description.split(/\n\s*\n/)[0] ?? '').replace(/\s+/g, ' ').trim();
  if (para.length <= 200) return para;
  const cut = para.slice(0, 200);
  const end = cut.lastIndexOf('. ');
  return end > 40 ? cut.slice(0, end + 1) : `${cut.slice(0, 199).trimEnd()}…`;
}

/** A type's name from its operation description: "Google Cloud Storage (this is not Google Drive)" → "Google Cloud
 *  Storage"; a long list is cut at its first comma; lower-case names get a capital. */
export function typeLabelOf(description: unknown, id: string): string {
  let s = (typeof description === 'string' ? description.split('\n')[0] ?? '' : '').replace(/\s*\(.*$/, '').trim();
  if (s.length > 40 && s.includes(',')) s = s.slice(0, s.indexOf(',')).trim();
  if (!s) s = id;
  // "seafile" → "Seafile"; "iCloud …" and "premiumize.me" stay as written.
  return /^[a-z]+(\s|$)/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function isSecretKey(key: string, prop: Record<string, unknown>): boolean {
  if (prop.format === 'password') return true;
  if (CREDENTIAL_KEYS.includes(key)) return true;
  if (prop.type !== 'string') return false;
  return !plainKey(key) && !isAddressKey(key);
}

function fieldOf(type: string, key: string, prop: unknown, required: boolean): GenField | { fixed: string } | null {
  if (!isObj(prop)) return fail(`${type}.${key}: not an object`);
  const t = prop.type;
  if (t !== 'string' && t !== 'integer' && t !== 'boolean') return fail(`${type}.${key}: type ${String(t)} has no form field`);
  const f: GenField = { key, kind: t === 'integer' ? 'int' : t === 'boolean' ? 'boolean' : 'text', label: labelOf(key) };
  if (prop.enum !== undefined) {
    if (!Array.isArray(prop.enum) || prop.enum.length === 0 || prop.enum.some((v) => typeof v !== (t === 'integer' ? 'number' : t))) return fail(`${type}.${key}: enum does not match its type`);
    // One value: the program takes nothing else. Required → sent as it is; otherwise left to the program.
    if (prop.enum.length === 1) return required ? (t === 'string' ? { fixed: prop.enum[0] as string } : fail(`${type}.${key}: required one-value ${t}`)) : null;
    if (t !== 'string') return fail(`${type}.${key}: a ${t} enum of several values`);
    f.kind = 'select';
    f.options = (prop.enum as string[]).filter((v) => v !== '');
  }
  if (t === 'string' && OAUTH_TOKEN.test(String(prop.description ?? ''))) f.kind = 'token';
  else if (f.kind === 'text' && isSecretKey(key, prop)) f.kind = 'secret';
  else if (t !== 'string' && isSecretKey(key, prop) && prop.format === 'password') return fail(`${type}.${key}: a secret that is not text`);
  if (required) f.required = true;
  const ex = prop['x-examples'];
  if (Array.isArray(ex) && f.kind === 'text') {
    const sug = ex.filter((v): v is string => typeof v === 'string' && v !== '');
    if (sug.length) f.suggest = sug;
  }
  const d = prop.default;
  if (f.kind !== 'secret' && f.kind !== 'token' && d !== undefined && d !== '' && d !== null) {
    if (typeof d !== (t === 'integer' ? 'number' : t)) return fail(`${type}.${key}: default does not match its type`);
    f.default = d as string | number | boolean;
  }
  const hint = hintOf(prop.description);
  if (hint) f.hint = hint;
  if ((f.kind === 'text' || f.kind === 'select') && isAddressKey(key)) f.address = true;
  return f;
}

/** The forms of every type in `openapi` without a hand-made one. Throws GenerateError on a shape it cannot express. */
export function generate(openapi: unknown): GenTable {
  const paths = isObj(openapi) && isObj(openapi.paths) ? openapi.paths : fail('no paths');
  const types: string[] = [];
  const generated: GenType[] = [];
  let s3Providers: string[] = [];
  for (const [path, item] of Object.entries(paths)) {
    const m = /^\/api\/v1\/backends\/([a-z0-9][a-z0-9-]*)$/.exec(path);
    if (!m || !isObj(item) || !isObj(item.post)) continue;
    const id = m[1]!;
    const op = item.post;
    const schema = isObj(op.requestBody) && isObj(op.requestBody.content) && isObj(op.requestBody.content['application/json']) ? op.requestBody.content['application/json'].schema : undefined;
    if (!isObj(schema) || !isObj(schema.properties)) fail(`${id}: no body schema`);
    const props = (schema as { properties: Record<string, unknown> }).properties;
    const req = Array.isArray((schema as Record<string, unknown>).required) ? ((schema as Record<string, unknown>).required as unknown[]).map(String) : [];
    for (const r of req) if (!(r in props)) fail(`${id}: required ${r} is not a property`);
    types.push(id);
    if (id === 's3') {
      const ex = isObj(props.provider) ? props.provider['x-examples'] : undefined;
      s3Providers = Array.isArray(ex) ? ex.filter((v): v is string => typeof v === 'string') : fail('s3: no provider examples');
    }
    if (HAND_TYPES.includes(id)) continue;
    const fields: GenField[] = [];
    const fixed: Record<string, string> = {};
    for (const [key, prop] of Object.entries(props)) {
      const f = fieldOf(id, key, prop, req.includes(key));
      if (!f) continue;
      if ('fixed' in f) fixed[key] = f.fixed;
      else fields.push(f);
    }
    const token = fields.some((f) => f.kind === 'token');
    for (const f of fields) {
      if (f.required || f.kind === 'token' || (MAIN_EXTRA.includes(f.key) || ((CREDENTIAL_KEYS.includes(f.key) || IDENTIFIER_KEYS.includes(f.key) || f.kind === 'secret') && !NOT_MAIN.test(f.key)))) f.main = true;
      // Signed in with an rclone token: the client id is shown inside the rclone command (a plain name), and an own
      // client id and secret go together (a token is refreshed with both).
      if (token && f.key === 'client_id') { f.name = true; if (fields.some((x) => x.key === 'client_secret')) f.needs = 'client_secret'; }
      if (token && f.key === 'client_secret' && fields.some((x) => x.key === 'client_id')) f.needs = 'client_id';
    }
    const rank = (f: GenField) => (f.required ? 0 : f.kind === 'token' ? 1 : f.main ? 2 : 3);
    fields.sort((a, b) => rank(a) - rank(b));
    generated.push({ id, label: typeLabelOf(op.description, id), ...(token ? { token: true as const } : {}), fields, ...(Object.keys(fixed).length ? { fixed } : {}) });
  }
  for (const h of HAND_TYPES) if (!types.includes(h)) fail(`hand-made type ${h} is not in the openapi`);
  const s3: GenS3Choice[] = [];
  for (const p of s3Providers) {
    if (S3_HIDDEN.includes(p)) continue;
    const label = S3_NAMES[p] ?? fail(`s3 provider ${p} has no name in S3_NAMES`);
    s3.push({ provider: p, label });
  }
  for (const x of S3_EXTRA) {
    const g = generated.find((t) => t.id === x);
    if (g) s3.push({ type: x, label: g.label });
  }
  return { types: [...types].sort(), generated: generated.sort((a, b) => a.id.localeCompare(b.id)), s3 };
}
