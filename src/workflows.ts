import { log, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import type { TerraformInput, TerraformRunResult } from './shared';

// init and plan don't change infrastructure, so a few automatic retries are safe.
const { terraformInit, terraformPlan } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3 },
});

// apply changes real infrastructure, so for now it is never retried automatically.
// Deciding when a retry is safe is part of the failure-handling pass.
const { terraformApply } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: { maximumAttempts: 1 },
});

export async function runTerraform(input: TerraformInput): Promise<TerraformRunResult> {
  await terraformInit(input.workingDir);

  const plan = await terraformPlan(input.workingDir, input.vars ?? {});
  if (!plan.hasChanges) {
    log.info('Plan has no changes, so apply is skipped');
    return { applied: false, planOutput: plan.output };
  }

  const applyOutput = await terraformApply(input.workingDir, plan.planFile);
  return { applied: true, planOutput: plan.output, applyOutput };
}
