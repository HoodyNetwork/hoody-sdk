// The phrase lines of an intro line: a break after each comma or full stop that is followed by a space.
// "Your own computers in the cloud, each with an AI agent. Reach them from anywhere." reads as three lines.

/** The line cut into its phrases, each keeping its closing mark; a line with no such mark is one phrase. */
export function phraseLines(line: string): string[] {
  return line
    .split(/(?<=[,.])\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}
