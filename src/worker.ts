import { NativeConnection, Worker } from '@temporalio/worker';
import { loadClientConnectConfig } from '@temporalio/envconfig';
import * as activities from './activities';
import { TASK_QUEUE } from './shared';

async function run() {
  // The approval Activities need a GitHub token. It comes from the environment, so it never
  // touches this repository or Temporal.
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('Set GITHUB_TOKEN before starting the Worker, for example GITHUB_TOKEN="$(gh auth token)"');
  }

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
