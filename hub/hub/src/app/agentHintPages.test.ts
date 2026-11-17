// Every work page of a computer has "Use with your agent" in its page header: Schedules, Tunnels and Files as well as
// the pages that had it first. Read from each page's source (the header is built once per page), so a page that drops
// the control fails here whatever its fixtures show. What the drawer says: kit/widgets/AgentHint.test.tsx.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_HINT_PAGES, AGENT_HINT_REACH, AGENT_HINT_SCOPE } from '../kit/widgets/agentHints';

const view = (page: string) => readFileSync(join(import.meta.dirname, '..', 'pages', page, 'view.tsx'), 'utf8');

describe('agent hint: Schedules, Tunnels and Files', () => {
  it('each is a hint page that acts on one computer', () => {
    for (const page of ['schedules', 'tunnels', 'files'] as const) {
      expect(AGENT_HINT_PAGES, page).toContain(page);
      expect(AGENT_HINT_REACH[page], page).toBe('computer');
      expect(AGENT_HINT_SCOPE[page], page).toBe('computer');
    }
  });

  it('each page places the control in its header actions, with the page\'s scope facts', () => {
    for (const page of ['schedules', 'tunnels', 'files'] as const) {
      const src = view(page);
      expect(src, page).toContain(`<AgentHint page="${page}" facts={agentFacts} />`);
      expect(src, page).toMatch(/const agentFacts = useAgentScopeFacts\(/);
      expect(src, page).toMatch(/actions: <(AgentHint page|>\{hint\})/);
    }
  });

  it('Files names the computer its first pane shows, never the shell\'s computer', () => {
    // Pane A's listed row, else the id the link names (a computer past the list, which the pane reads by its id).
    expect(view('files')).toMatch(/const paneA = panesOf\(search\)\.a;\s*const agentFacts = useAgentScopeFacts\(paneComputer\(computers\.rows \?\? \[\], paneA\)\?\.id \?\? paneA\.id \?\? null\);/);
  });
});
