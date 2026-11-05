import path from 'node:path';
import { Client, Connection } from '@temporalio/client';
import { loadClientConnectConfig } from '@temporalio/envconfig';
import { GITHUB_REPO } from './config';
import { TASK_QUEUE } from './shared';
import { runTerraform } from './workflows';

async function run() {
  const config = loadClientConnectConfig();
  const connection = await Connection.connect(config.connectionOptions);
  const client = new Client({ connection, namespace: config.namespace });

  const handle = await client.workflow.start(runTerraform, {
    taskQueue: TASK_QUEUE,
    // One Workflow ID per Terraform stack. Temporal allows only one running execution per ID,
    // so two runs can never apply to this stack at the same time.
    workflowId: 'terraform-poc',
    args: [{ workingDir: path.resolve(__dirname, '../terraform') }],
  });
  console.log(`Started workflow ${handle.workflowId}, run ${handle.firstExecutionRunId}`);
  console.log(`If the plan has changes, approve the issue it opens in https://github.com/${GITHUB_REPO}/issues`);

  const result = await handle.result();
  if (result.applied) {
    console.log(`\nApplied after ${result.approvedBy} approved ${result.approvalIssue}:\n`);
    console.log(result.applyOutput);
  } else if (result.approvalIssue) {
    console.log(`\nNot applied: ${result.approvalIssue} was closed without approval.`);
  } else {
    console.log('\nNo changes, so there was nothing to approve.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
