// New script's starter text and its check (split out of StepWrite.tsx so the terminal build shares them; StepWrite.tsx
// re-exports both).


/** The code a new script starts with: Continue needs something else. */
export const STARTER = 'export default function (request: Request) {\n  return new Response("Hello from my script");\n}\n';
export const wroteSomething = (code: string): boolean => code.trim() !== '' && code !== STARTER;
