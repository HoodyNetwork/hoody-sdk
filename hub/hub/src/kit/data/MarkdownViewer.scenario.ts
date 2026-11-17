// Behaviour contract of MarkdownViewer (web and terminal): a named region holding the document, Rendered or Raw; one
// loading state that wins over a source; an empty file says so; a failed read offers Try again; facts above the body.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { MarkdownViewer } from './MarkdownViewer';

const DOC = '# Deploy skill\n\nUse this skill to **deploy** a service.\n';

export default scenarios('MarkdownViewer', loose(MarkdownViewer), {
  ignored: {},
  unsupported: {
    fileName: 'the Download name: a terminal host saves no file, so the action is left out there (core/host-env.ts files); the web side is pinned in MarkdownViewer.test.tsx',
    height: 'a size: the region\'s most rows; drawing facts are pinned in MarkdownViewer.term.test.tsx',
  },
  cases: [
    {
      name: 'the document reads in a region named after the file, rendered',
      props: { label: 'SKILL.md', source: DOC },
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'region', name: 'SKILL.md' } },
          { target: { role: 'radio', name: 'Rendered' }, states: { checked: true } },
          { target: { text: /Use this skill to/ } },
          { target: { text: /\*\*deploy\*\*/ }, absent: true },
        ],
      },
    },
    {
      name: 'Raw shows the text as written',
      props: { label: 'SKILL.md', source: DOC },
      steps: [{ press: { role: 'radio', name: 'Raw' } }],
      expect: { nodes: [{ target: { role: 'radio', name: 'Raw' }, states: { checked: true } }, { target: { text: /\*\*deploy\*\*/ } }] },
    },
    {
      name: 'loading wins over a source: no document, no actions',
      props: { label: 'SKILL.md', source: DOC, loading: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'region', name: 'SKILL.md' }, absent: true }, { target: { role: 'radio', name: 'Raw' }, absent: true }, { target: { text: /Use this skill to/ }, absent: true }] },
    },
    {
      name: 'an empty file says so and has no actions',
      props: { label: 'SKILL.md', source: '' },
      steps: [],
      expect: { nodes: [{ target: { text: 'This file is empty' } }, { target: { role: 'radio', name: 'Raw' }, absent: true }] },
    },
    {
      name: 'a failed read is never an empty file, and Try again reads it again, once',
      props: (s) => ({ label: 'SKILL.md', source: DOC, error: new Error('lost'), onRetry: s.fn('onRetry') }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { text: /Couldn't read this file/ } }, { target: { text: 'This file is empty' }, absent: true }, { target: { text: /Use this skill to/ }, absent: true }] },
    },
    {
      name: 'facts show above the body, in order',
      props: { label: 'SKILL.md', source: DOC, frontmatter: [['name', 'deploy-service'], ['version', '1.4.2']] },
      steps: [],
      expect: { nodes: [{ target: { text: 'deploy-service' } }, { target: { text: '1.4.2' } }] },
    },
  ],
});
