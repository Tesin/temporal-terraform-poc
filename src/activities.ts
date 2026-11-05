import { spawn } from 'node:child_process';
import { Context, heartbeat, log, sleep } from '@temporalio/activity';
import { APPROVERS, GITHUB_REPO } from './config';
import { closeIssue, commentOnIssue, createIssue, findApproval, getIssue, listComments } from './github';
import type { ApprovalIssue, ApprovalResult, PlanResult } from './shared';

// The saved plan lives in the Terraform working directory, so apply can run exactly what plan showed.
const PLAN_FILE = 'tfplan';

// How often waitForApproval checks the issue for a response.
const APPROVAL_POLL_INTERVAL_MS = 15_000;

// GitHub rejects issue and comment bodies longer than 65,536 characters.
const MAX_GITHUB_TEXT = 60_000;

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** The Worker's environment, minus credentials that Terraform has no use for. */
function terraformEnv(): NodeJS.ProcessEnv {
  // TF_IN_AUTOMATION trims hints that only make sense to a person at a terminal.
  const env: NodeJS.ProcessEnv = { ...process.env, TF_IN_AUTOMATION: '1' };
  delete env.GITHUB_TOKEN;
  for (const name of Object.keys(env)) {
    if (name.startsWith('TEMPORAL_')) delete env[name];
  }
  return env;
}

/** Runs one terraform command in workingDir, streaming its output to the Worker's console. */
function terraform(workingDir: string, args: string[]): Promise<CommandResult> {
  log.info(`Running: terraform ${args.join(' ')}`, { workingDir });
  return new Promise((resolve, reject) => {
    const child = spawn('terraform', args, { cwd: workingDir, env: terraformEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', reject); // e.g. terraform isn't installed, or workingDir doesn't exist
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function commandFailed(command: string, result: CommandResult): Error {
  return new Error(`terraform ${command} exited with code ${result.exitCode}:\n${result.stderr || result.stdout}`);
}

function truncate(text: string): string {
  if (text.length <= MAX_GITHUB_TEXT) return text;
  return `${text.slice(0, MAX_GITHUB_TEXT)}\n... (truncated; the full output is in the Temporal UI)`;
}

/** The Workflow run that called the current Activity. These Activities are only ever called by a Workflow. */
function callingWorkflow(): { workflowId: string; runId: string } {
  const execution = Context.current().info.workflowExecution;
  if (!execution) throw new Error('This Activity must be called from a Workflow');
  return execution;
}

export async function terraformInit(workingDir: string): Promise<string> {
  const result = await terraform(workingDir, ['init', '-input=false', '-no-color']);
  if (result.exitCode !== 0) throw commandFailed('init', result);
  return result.stdout;
}

export async function terraformPlan(workingDir: string, vars: Record<string, string>): Promise<PlanResult> {
  const varArgs = Object.entries(vars).map(([name, value]) => `-var=${name}=${value}`);
  // With -detailed-exitcode, plan exits 0 for no changes, 2 for changes, and 1 for errors.
  const result = await terraform(workingDir, [
    'plan',
    '-input=false',
    '-no-color',
    '-detailed-exitcode',
    `-out=${PLAN_FILE}`,
    ...varArgs,
  ]);
  if (result.exitCode !== 0 && result.exitCode !== 2) throw commandFailed('plan', result);
  return { hasChanges: result.exitCode === 2, planFile: PLAN_FILE, output: result.stdout };
}

export async function terraformApply(workingDir: string, planFile: string): Promise<string> {
  // Applying a saved plan doesn't prompt for approval, and Terraform refuses if the plan is stale.
  const result = await terraform(workingDir, ['apply', '-input=false', '-no-color', planFile]);
  if (result.exitCode !== 0) throw commandFailed('apply', result);
  return result.stdout;
}

export async function openApprovalIssue(planOutput: string): Promise<ApprovalIssue> {
  const { workflowId, runId } = callingWorkflow();
  const summary = planOutput.match(/^Plan: (.*)\.$/m)?.[1] ?? 'changes';
  const body = [
    `Temporal Workflow \`${workflowId}\` (run \`${runId}\`) wants to apply this Terraform plan.`,
    '',
    `- **To approve:** comment \`Approved\`. Only comments from ${APPROVERS.map((login) => `@${login}`).join(', ')} count.`,
    '- **To reject:** close this issue.',
    '',
    '```text',
    truncate(planOutput),
    '```',
  ].join('\n');

  const issue = await createIssue(GITHUB_REPO, `Approve Terraform plan for ${workflowId}: ${summary}`, body);
  log.info(`Opened approval issue ${issue.html_url}`);
  return { number: issue.number, url: issue.html_url };
}

/** Checks the issue until an approver comments "Approved" or someone closes it. */
export async function waitForApproval(issueNumber: number): Promise<ApprovalResult> {
  for (;;) {
    const approvedBy = findApproval(await listComments(GITHUB_REPO, issueNumber), APPROVERS);
    if (approvedBy) return { approved: true, approvedBy };

    const issue = await getIssue(GITHUB_REPO, issueNumber);
    if (issue.state === 'closed') return { approved: false };

    // Heartbeats tell Temporal this Activity is still alive, and carry cancellation back to it.
    heartbeat();
    await sleep(APPROVAL_POLL_INTERVAL_MS); // throws if the Workflow is cancelled
  }
}

export async function closeApprovalIssue(issueNumber: number, applyOutput: string): Promise<void> {
  const { runId } = callingWorkflow();
  const body = [`Applied by run \`${runId}\`:`, '', '```text', truncate(applyOutput), '```'].join('\n');
  await commentOnIssue(GITHUB_REPO, issueNumber, body);
  await closeIssue(GITHUB_REPO, issueNumber);
}
