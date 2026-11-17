// Behaviour contract of ErrorDetails (web and terminal).
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { ErrorDetails } from './ErrorDetails';

export default scenarios('ErrorDetails', loose(ErrorDetails), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'Details unfolds the lines and says it is expanded',
      props: { error: { status: 503, code: 'SERVICE_UNAVAILABLE', traceId: 'abc123' } },
      steps: [{ press: { role: 'button', name: /Details/ } }],
      expect: { nodes: [{ target: { role: 'button', name: /Details/ }, states: { expanded: true } }] },
    },
    {
      name: "button mode: Details opens a dialog with the lines; Close closes it",
      props: { error: { status: 503, code: 'SERVICE_UNAVAILABLE', traceId: 'abc123' }, mode: 'button' },
      steps: [{ press: { role: 'button', name: 'Details' } }, { expect: { nodes: [{ target: { role: 'dialog' } }] } }, { key: 'escape' }],
      expect: { nodes: [{ target: { role: 'dialog' }, absent: true }] },
    },
    { name: 'nothing for no error', props: { error: null }, steps: [], expect: { nodes: [{ target: { role: 'button', name: /Details/ }, absent: true }] } },
  ],
});
