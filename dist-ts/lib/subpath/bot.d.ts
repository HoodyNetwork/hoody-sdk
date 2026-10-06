/**
 * Subpath entry for `hoody-sdk/bot` — the chat-channel kit's SDK surface.
 *
 * Re-exports the generated `bot` namespace (registrations, health) and adds the
 * two manifest constants a consumer needs BEFORE it has a manifest in hand.
 *
 * WHY A HAND-WRITTEN SUBPATH RATHER THAN A DIRECT `generated/bot` EXPORT: the
 * hoody-bot kit consumes this package to drive its own control surface, and the
 * first thing it does at boot is decide whether the chat manifest baked into
 * the build is one it can run. That decision
 * needs the schema major and the name of the field excluded from the digest —
 * neither of which the OpenAPI spec carries, so neither of which the generator
 * can emit. They live here, next to the surface they qualify.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT EXPORT: a canonicaliser, a hashing
 * helper, or a verification function. The kit recomputes the manifest digest
 * with its OWN RFC 8785 implementation and the CLI with a third, precisely so
 * that a bug in one canonicaliser cannot cancel itself on both sides of the
 * comparison. Exporting
 * a shared helper from here would turn the kit's boot check into a tautology —
 * it would be comparing a value against itself. If a future change makes that
 * look like welcome deduplication, it is not: it is the deletion of the check.
 */
/**
 * The chat manifest schema major this SDK release speaks (`schema_version` in
 * `chat-manifest.json`). A consumer that reads a different major must refuse
 * the manifest rather than interpret it — the field is a major precisely
 * because there is no compatible reading across a change to it.
 */
export declare const MANIFEST_MAJOR = "1";
/**
 * The one manifest field excluded from its own digest.
 *
 * `manifest_sha256` is JCS over the whole document with this key ABSENT — not
 * blanked, not zeroed. A document carrying `"manifest_sha256": ""` is a
 * different document from one without the key, and canonicalises differently.
 */
export declare const MANIFEST_DIGEST_FIELD = "manifest_sha256";
export * from '../../generated/bot/index.js';
