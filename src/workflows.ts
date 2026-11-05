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

const { openApprovalIssue, closeApprovalIssue } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 3 },
});

// waitForApproval checks GitHub every 15 seconds until someone responds. Its heartbeats let Temporal
// notice within 2 minutes if the Worker running it dies, and then retry it.
const { waitForApproval } = proxyActivities<typeof activities>({
  startToCloseTimeout: '7 days',
  heartbeatTimeout: '2 minutes',
});

export async function runTerraform(input: TerraformInput): Promise<TerraformRunResult> {
  await terraformInit(input.workingDir);

  const plan = await terraformPlan(input.workingDir, input.vars ?? {});
  if (!plan.hasChanges) {
    log.info('Plan has no changes, so approval and apply are skipped');
    return { applied: false, planOutput: plan.output };
  }

  // Nothing changes until a person approves the plan on GitHub.
  const issue = await openApprovalIssue(plan.output);
  const approval = await waitForApproval(issue.number);
  if (!approval.approved) {
    log.info('The approval issue was closed without approval, so apply is skipped');
    return { applied: false, planOutput: plan.output, approvalIssue: issue.url };
  }

  const applyOutput = await terraformApply(input.workingDir, plan.planFile);
  await closeApprovalIssue(issue.number, applyOutput);
  return {
    applied: true,
    planOutput: plan.output,
    applyOutput,
    approvalIssue: issue.url,
    approvedBy: approval.approvedBy,
  };
}
