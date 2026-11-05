import { spawn } from 'node:child_process';
import { log } from '@temporalio/activity';
import type { PlanResult } from './shared';

// The saved plan lives in the Terraform working directory, so apply can run exactly what plan showed.
const PLAN_FILE = 'tfplan';

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs one terraform command in workingDir, streaming its output to the Worker's console. */
function terraform(workingDir: string, args: string[]): Promise<CommandResult> {
  log.info(`Running: terraform ${args.join(' ')}`, { workingDir });
  return new Promise((resolve, reject) => {
    const child = spawn('terraform', args, {
      cwd: workingDir,
      // TF_IN_AUTOMATION trims hints that only make sense to a person at a terminal.
      env: { ...process.env, TF_IN_AUTOMATION: '1' },
    });
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
