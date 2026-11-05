import assert from 'assert';
import { after, before, describe, it } from 'mocha';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type * as activities from '../activities';
import { runTerraform } from '../workflows';

// These tests check the Workflow's logic with fake Activities, so they don't need Terraform.
describe('runTerraform workflow', () => {
  let testEnv: TestWorkflowEnvironment;

  before(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  after(async () => {
    await testEnv?.teardown();
  });

  async function runWithFakeActivities(planHasChanges: boolean) {
    const calls: string[] = [];
    const fakeActivities: typeof activities = {
      terraformInit: async () => {
        calls.push('init');
        return 'init output';
      },
      terraformPlan: async () => {
        calls.push('plan');
        return { hasChanges: planHasChanges, planFile: 'tfplan', output: 'plan output' };
      },
      terraformApply: async () => {
        calls.push('apply');
        return 'apply output';
      },
    };

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test',
      workflowsPath: require.resolve('../workflows'),
      activities: fakeActivities,
    });
    const result = await worker.runUntil(
      testEnv.client.workflow.execute(runTerraform, {
        args: [{ workingDir: 'unused-by-fakes' }],
        workflowId: `test-changes-${planHasChanges}`,
        taskQueue: 'test',
      }),
    );
    return { calls, result };
  }

  it('runs init, plan and apply when the plan has changes', async () => {
    const { calls, result } = await runWithFakeActivities(true);
    assert.deepEqual(calls, ['init', 'plan', 'apply']);
    assert.deepEqual(result, { applied: true, planOutput: 'plan output', applyOutput: 'apply output' });
  });

  it('skips apply when the plan has no changes', async () => {
    const { calls, result } = await runWithFakeActivities(false);
    assert.deepEqual(calls, ['init', 'plan']);
    assert.deepEqual(result, { applied: false, planOutput: 'plan output' });
  });
});
