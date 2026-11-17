// The example prompts under Describe it: what a script on a Hoody computer does well, each one the assistant can build
// as written. Each example names what its script uses on the computer, and examples.test.ts checks every name against
// the real surface: the runtime's `ai` helper and magic comments (hoody-exec), the computer's kits through the `hoody`
// client (the SDK's generated services), and the script's secret values. An example whose words promise something the
// runtime does not have fails there, never in front of the person.

/** `ai.<helper>` (the runtime's AI helper), `@<comment>` (a magic comment), `sdk:<kit>/<service>.<method>` (a kit
 *  method of the `hoody` client), `env` (a secret value the script reads from its environment). */
export type ExampleUse = `ai.${string}` | `@${string}` | `sdk:${string}/${string}.${string}` | 'env';

export const EXAMPLES = ['summary', 'sitecheck', 'chat', 'extract', 'todo', 'docs'] as const;
export type ExampleId = (typeof EXAMPLES)[number];

export const EXAMPLE_USES: Readonly<Record<ExampleId, readonly ExampleUse[]>> = {
  summary: ['sdk:browser/page.getMarkdown', 'ai.generate'],
  sitecheck: ['@schedule', 'sdk:browser/page.getText', 'ai.object', 'sdk:notifications/notifications.send'],
  chat: ['@token', 'ai.generate', 'env'],
  extract: ['ai.object'],
  todo: ['@token', 'sdk:sqlite/kv.set', 'sdk:sqlite/kv.get', 'sdk:sqlite/kv.list', 'sdk:sqlite/kv.delete'],
  docs: ['sdk:files/files.glob', 'sdk:files/files.get', 'ai.generate'],
};
