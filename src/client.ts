import path from 'node:path';
import { Client, Connection } from '@temporalio/client';
import { loadClientConnectConfig } from '@temporalio/envconfig';
import { TASK_QUEUE } from './shared';
import { runTerraform } from './workflows';

async function run() {
  // Usage: npm run workflow -- "some message"
  // Running again with the same message plans no changes, so apply is skipped.
  const message = process.argv[2] ?? 'Hello from Terraform, run by Temporal!';

  const config = loadClientConnectConfig();
  const connection = await Connection.connect(config.connectionOptions);
  const client = new Client({ connection, namespace: config.namespace });

  const handle = await client.workflow.start(runTerraform, {
    taskQueue: TASK_QUEUE,
    // One Workflow ID per Terraform stack. Temporal allows only one running execution per ID,
    // so two runs can never apply to this stack at the same time.
    workflowId: 'terraform-hello',
    args: [{ workingDir: path.resolve(__dirname, '../terraform'), vars: { message } }],
  });
  console.log(`Started workflow ${handle.workflowId}, run ${handle.firstExecutionRunId}`);

  const result = await handle.result();
  if (result.applied) {
    console.log('Applied the plan:\n');
    console.log(result.applyOutput);
  } else {
    console.log('No changes, so apply was skipped.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
