// OpenRouter sign-in on the AI page: the kit's OpenRouterSetup over the
// page's api and env. The page's own words for a refusal stay (errorText), and a finished sign-in re-reads the page
// before the step says signed in. Every rule of the sign-in (the code sent once, the field dropped at the send, a lost
// answer never sent again, "signed in" only from the job's own end) lives in the kit component.
import { OpenRouterSetup } from '@kit';
import { errorText } from '../words';
import { useAi } from './ctx';

export function OpenRouterStep({ onSigned, onBack }: { onSigned: () => void; onBack: () => void }) {
  const { api, env, reload } = useAi();
  return (
    <OpenRouterSetup
      api={api}
      env={env}
      failedText={(err) => errorText(err, { write: true }).text}
      onSigned={() => {
        reload();
        onSigned();
      }}
      onBack={onBack}
    />
  );
}
