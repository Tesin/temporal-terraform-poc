import assert from 'assert';
import { after, before, describe, it } from 'mocha';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type * as activities from '../activities';
import type { ApprovalResult } from '../shared';
import { runTerraform } from '../workflows';

const ISSUE_URL = 'https://github.com/example/repo/issues/7';

// These tests check the Workflow's logic with fake Activities, so they need neither Terraform nor GitHub.
describe('runTerraform workflow', () => {
  let testEnv: TestWorkflowEnvironment;

  before(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  after(async () => {
    await testEnv?.teardown();
  });

  async function runWithFakeActivities(workflowId: string, planHasChanges: boolean, approval: ApprovalResult) {
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
      openApprovalIssue: async () => {
        calls.push('openApprovalIssue');
        return { number: 7, url: ISSUE_URL };
      },
      waitForApproval: async () => {
        calls.push('waitForApproval');
        return approval;
      },
      terraformApply: async () => {
        calls.push('apply');
        return 'apply output';
      },
      closeApprovalIssue: async () => {
        calls.push('closeApprovalIssue');
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
        workflowId,
        taskQueue: 'test',
      }),
    );
    return { calls, result };
  }

  it('waits for approval, then applies and closes the issue', async () => {
    const { calls, result } = await runWithFakeActivities('test-approved', true, {
      approved: true,
      approvedBy: 'alice',
    });
    assert.deepEqual(calls, ['init', 'plan', 'openApprovalIssue', 'waitForApproval', 'apply', 'closeApprovalIssue']);
    assert.deepEqual(result, {
      applied: true,
      planOutput: 'plan output',
      applyOutput: 'apply output',
      approvalIssue: ISSUE_URL,
      approvedBy: 'alice',
    });
  });

  it("doesn't apply when the approval issue is closed without approval", async () => {
    const { calls, result } = await runWithFakeActivities('test-rejected', true, { approved: false });
    assert.deepEqual(calls, ['init', 'plan', 'openApprovalIssue', 'waitForApproval']);
    assert.deepEqual(result, { applied: false, planOutput: 'plan output', approvalIssue: ISSUE_URL });
  });

  it('skips approval and apply when the plan has no changes', async () => {
    const { calls, result } = await runWithFakeActivities('test-no-changes', false, { approved: true });
    assert.deepEqual(calls, ['init', 'plan']);
    assert.deepEqual(result, { applied: false, planOutput: 'plan output' });
  });
});
