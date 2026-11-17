// The __ID__ page: a wizard (layout `wizard`). Three steps kept in the URL (?step=)
// so Back walks them, a summary rail with the choices so far, and the create on the last step.
//
// The standard pieces, all from the kit:
//   WizardPage + useWizardStep   steps, the summary rail, the sticky footer (Back · Next/Create)
//   Form                         wraps the step body: Enter goes on, and every field locks while
//                                the create is in flight or unknown
//   Outcome                      the create's C9 line on the last step: "This may have gone
//                                through" + Check again, which reads back and never resends
//   EmptyState / ErrorState size="compact" inside a step; the page states for the whole page
// One accent at a time: Next on the first steps, Create on the last.
import {
  Button,
  EmptyState,
  ErrorState,
  Facts,
  Form,
  Outcome,
  RadioGroup,
  Section,
  Skeleton,
  TextButton,
  TextField,
  WizardPage,
  useStrings,
  useWizardStep,
} from '@kit';
import { useState } from 'react';
import { usePlans, useCreate, useExisting } from './data';
import { formatPrice, nameProblem, settle } from './logic';
import strings from './strings.en.json';

export default function __PASCAL__Page() {
  const t = useStrings(strings);
  const plans = usePlans();
  const existing = useExisting();
  const create = useCreate();
  const steps = [
    { id: 'name', label: t('step.name') },
    { id: 'plan', label: t('step.plan') },
    { id: 'review', label: t('step.review') },
  ];
  const [step, setStep] = useWizardStep(steps);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<string | undefined>(undefined);
  const [tried, setTried] = useState(false);

  const header = { title: t('title'), subtitle: t('subtitle') };
  if (plans.isPending) {
    return (
      <WizardPage header={header} steps={steps} current={0}>
      <Skeleton variant="card" rows={3} />
      </WizardPage>
    );
  }
  if (plans.isError) {
    return (
      <WizardPage header={header} steps={steps} current={0}>
        <ErrorState title={t('error.title')} body={t('error.body')} onRetry={() => void plans.refetch()} retrying={plans.isFetching} />
      </WizardPage>
    );
  }

  const options = plans.data ?? [];
  const plan = options.find((p) => p.id === planId) ?? options[0];
  const problem = nameProblem(name, existing.data ?? []);
  const outcome = settle(create.data?.outcome ?? (create.isError ? 'failed' : undefined), name, existing.data);
  // Once a create may have gone through (or did), the wizard is locked: no step changes, no resend.
  const sent = outcome === 'pending' || outcome === 'done';
  const last = step === steps.length - 1;

  // A step the URL names but whose earlier steps are not filled in starts over at the first.
  const current = step > 0 && problem !== undefined && !sent ? 0 : step;
  const next = () => {
    if (current === 0 && problem !== undefined) return setTried(true);
    if (current === 1 && !plan) return;
    setStep(current + 1);
  };
  const submit = () => {
    if (last && plan && problem === undefined && !sent) create.mutate({ name: name.trim(), planId: plan.id });
  };
  // Check again only READS the list: a create that shows up there is done (settle() sees it);
  // one that does not lifts the lock so the user can create again. It never resends.
  const check = async () => {
    const fresh = await existing.refetch();
    if (!fresh.data?.some((e) => e.name === name.trim())) create.reset();
  };

  return (
    <WizardPage
      header={header}
      steps={steps}
      current={current}
      onStep={sent ? undefined : setStep}
      summary={
        <Section title={t('summary.title')}>
          <Facts
            columns={1}
            items={[
              { label: t('summary.name'), value: name.trim() || t('summary.none') },
              { label: t('summary.plan'), value: current > 0 && plan ? plan.name : t('summary.none') },
              { label: t('summary.price'), value: current > 0 && plan ? t('plan.price', { price: formatPrice(plan.priceCents) }) : t('summary.none') },
            ]}
          />
        </Section>
      }
      footer={
        <>
          {current > 0 && (
            <Button icon="arrow-left" isDisabled={sent || create.isPending} onPress={() => setStep(current - 1)}>
              {t('back')}
            </Button>
          )}
          {last ? (
            <Button variant="primary" busy={create.isPending} isDisabled={sent || !plan} onPress={submit}>
              {create.isPending ? t('creating') : t('create')}
            </Button>
          ) : (
            <Button variant="primary" iconEnd="arrow-right" isDisabled={current === 1 && !plan} onPress={next}>
              {t('next')}
            </Button>
          )}
        </>
      }
    >
      <Form onSubmit={last ? submit : next} busy={create.isPending} outcome={outcome} onCheck={check}>
        {current === 0 && (
          <TextField
            label={t('name.label')}
            description={t('name.help')}
            value={name}
            onChange={setName}
            errorMessage={tried && problem ? t(problem) : undefined}
            focusOnError
            reserveError
          />
        )}
        {current === 1 &&
          (options.length === 0 ? (
            <EmptyState size="compact" icon="warn" title={t('plan.empty')} action={<TextButton onPress={() => void plans.refetch()}>{t('plan.retry')}</TextButton>} />
          ) : (
            <RadioGroup
              label={t('plan.label')}
              variant="cards"
              options={options.map((p) => ({ value: p.id, label: p.name, description: t('plan.option', { detail: p.detail, price: formatPrice(p.priceCents) }) }))}
              value={plan?.id}
              onChange={setPlanId}
            />
          ))}
        {current === 2 && (
          <Section title={t('review.title')} description={t('review.body')}>
            <Outcome outcome={outcome} onCheck={check} doneText={t('created')} variant="block" />
          </Section>
        )}
      </Form>
    </WizardPage>
  );
}
