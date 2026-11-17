/**
 * The realm-alias rules the CLI uses (`--realm <alias>`, `hoody use`): the vault key that holds the Hub's alias map, how
 * two aliases are compared, which words are reserved, and how a stored map is read.
 *
 * These are the SDK sidecar's rules (`REALM_ALIASES_VAULT_KEY` .. `validateRealmAliases`), which the Hub's own copy
 * also mirrors. They are MIRRORED rather than imported
 * because the sidecar is not part of the SDK's or the CLI's typecheck, and importing it from `lib/` would pull all of it
 * into both. A unit test holds the two copies together: the constants are read out of the sidecar's source, and every
 * vector is run through both implementations.
 *
 * Imports nothing, so the CLI bundle takes it without the sidecar's dependencies.
 */
export const REALM_ALIASES_VAULT_KEY = 'hoody.realm-aliases';
export const REALM_ALIAS_MAX_LEN = 64;
// Words that name a scope rather than a realm: a realm LABELLED "all" would be a lie about what the button does.
// The comparison is CASE-INSENSITIVE, and invisibles plus surrounding whitespace are removed before comparing, because
// that is what a display does to the value.
const RESERVED_REALM_ALIASES = new Set(['all', 'none', 'every', 'any', 'global']);
// Bidi controls, zero-width characters, the BOM and friends, as CODE POINT RANGES and not as a regex with escapes: an
// escape typed into a source file can land as the raw byte, and an invisible inside a character class is a rule nobody
// can review.
const INVISIBLE_RANGES = [
    [0x00ad, 0x00ad],
    [0x061c, 0x061c],
    [0x180e, 0x180e],
    [0x200b, 0x200f],
    [0x2028, 0x2029],
    [0x202a, 0x202e],
    [0x2060, 0x2064],
    [0x2066, 0x2069],
    [0x3164, 0x3164],
    [0xfeff, 0xfeff],
    [0xe0000, 0xe007f],
];
function isInvisibleCodePoint(point) {
    return INVISIBLE_RANGES.some(([from, to]) => point >= from && point <= to);
}
/** The alias as the kit would COMPARE it: invisibles removed, trimmed, lowercased. */
export function foldRealmAlias(value) {
    const kept = [];
    for (const char of value) {
        if (!isInvisibleCodePoint(char.codePointAt(0)))
            kept.push(char);
    }
    return kept.join('').trim().toLowerCase();
}
function validAliasEntry(k, v) {
    return typeof k === 'string' && /^[0-9a-f]{24}$/.test(k)
        && typeof v === 'string' && v.length > 0 && v.length <= REALM_ALIAS_MAX_LEN
        // no control chars (they would corrupt the TUI); spaces are fine.
        // eslint-disable-next-line no-control-regex
        && !/[\x00-\x1f\x7f-\x9f]/.test(v);
}
/** The stored value (a JSON string) as a map. A corrupt or non-object value reads as `{}`; an invalid entry is dropped. */
export function parseRealmAliases(raw) {
    if (typeof raw !== 'string' || raw === '')
        return {};
    let obj;
    try {
        obj = JSON.parse(raw);
    }
    catch {
        return {};
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj))
        return {};
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (validAliasEntry(k, v))
            out[k] = v;
    }
    return out;
}
/** Throws on a reserved word, a bad id or a bad alias; an empty alias is a removal. Returns the accepted entries. */
export function validateRealmAliases(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw Object.assign(new Error('aliases must be an object of {realmId: alias}'), { code: 'bad_request', status: 400 });
    }
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (typeof k !== 'string' || !/^[0-9a-f]{24}$/.test(k)) {
            throw Object.assign(new Error(`invalid realm id ${JSON.stringify(k)} — expected 24-hex`), { code: 'bad_request', status: 400 });
        }
        if (v === '' || v == null)
            continue; // empty alias = remove the entry
        if (!validAliasEntry(k, v)) {
            throw Object.assign(new Error(`invalid alias for ${k} — printable string ≤ ${REALM_ALIAS_MAX_LEN} chars`), { code: 'bad_request', status: 400 });
        }
        const folded = foldRealmAlias(v);
        if (RESERVED_REALM_ALIASES.has(folded)) {
            throw Object.assign(new Error(`invalid alias for ${k} — ${JSON.stringify(folded)} is a reserved word (${[...RESERVED_REALM_ALIASES].join(', ')}); it names a scope, so a realm may not be called that`), { code: 'bad_request', status: 400 });
        }
        out[k] = v;
    }
    return out;
}
