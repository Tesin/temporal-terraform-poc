import { NativeConnection, Worker } from '@temporalio/worker';
import { loadClientConnectConfig } from '@temporalio/envconfig';
import * as activities from './activities';
import { TASK_QUEUE } from './shared';

async function run() {
  // Connection settings come from your Temporal config profile (TEMPORAL_PROFILE).
  // With no profile set, this connects to a local dev server at localhost:7233.
  const config = loadClientConnectConfig();
  const connection = await NativeConnection.connect(config.connectionOptions);
  try {
    const worker = await Worker.create({
      connection,
      namespace: config.namespace,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
