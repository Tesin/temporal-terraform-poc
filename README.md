# Terraform runner

A Temporal Workflow that runs Terraform against the stack in [terraform/](terraform/), which creates one private S3 bucket. Nothing changes until a person approves the plan on a GitHub issue.

## How it works

1. The Workflow runs `terraform init`, then `terraform plan`, which saves the plan to `terraform/tfplan`.
2. If the plan has no changes, the Workflow stops.
3. Otherwise it opens an issue in this repository showing the plan, then checks the issue every 15 seconds:
   - A comment that says just `Approved` (in any case) from a user listed in [src/config.ts](src/config.ts) approves the plan.
   - Closing the issue rejects the plan.
4. After approval, `terraform apply` runs the saved plan, so exactly what was approved gets applied. The Workflow then posts the result on the issue and closes it.

The Client always uses the Workflow ID `terraform-poc`. Temporal allows only one running execution per Workflow ID, so two runs can't change this stack at once.

The code is in [src/workflows.ts](src/workflows.ts) (the steps), [src/activities.ts](src/activities.ts) (running Terraform and the approval issue) and [src/github.ts](src/github.ts) (GitHub API calls).

## Secrets

No secrets are stored in this repository, and none pass through Temporal:

- The GitHub token and AWS credentials come from the Worker's environment.
- Terraform gets only the credentials it needs. The Worker removes `GITHUB_TOKEN` and all `TEMPORAL_*` variables from the environment Terraform runs in.
- `.gitignore` covers Terraform state, saved plans, `*.tfvars` files and common credential files.

This repository is public, which has two consequences:

- Anyone can comment on its issues, so only comments from the approvers in [src/config.ts](src/config.ts) count.
- The plan in each approval issue is public. That's fine for this bucket, but don't manage anything sensitive from a public repository.

## Setup

1. Run `npm install`.
2. Create `terraform/terraform.tfvars` containing the ID of the AWS account this stack belongs to, for example `aws_account_id = "123456789012"`. Git ignores this file. Terraform refuses to run with credentials for any other account.

## Running it

Start the Worker with credentials in its environment. Running it in a subshell keeps the AWS credentials out of your main shell:

```bash
(source <file that exports AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY> &&
  TEMPORAL_PROFILE=cloud GITHUB_TOKEN="$(gh auth token)" npm run start)
```

Use `npm run start` rather than `start.watch` here. The watch mode restarts the Worker whenever you edit a file in `src/`, and the restart signal also reaches Terraform and everything it runs. Terraform and its providers ignore that signal, but shell commands such as `local-exec` provisioners are killed by it, which fails the apply partway through.

In another shell, start a run with `TEMPORAL_PROFILE=cloud npm run workflow`. Then comment `Approved` on the issue it opens.

To use a local dev server instead of Temporal Cloud, run `temporal server start-dev` and leave out `TEMPORAL_PROFILE=cloud`.

`npm test` checks the Workflow's logic and the approval matching. It doesn't need Terraform, AWS or GitHub.

## Simplifications to revisit

These are deliberate shortcuts, to work through when handling failures:

- **Retries:** init, plan and the GitHub calls are retried up to 3 times on any error. Checking for approval is retried indefinitely. Apply is never retried.
- **No approval deadline:** the Workflow waits until someone approves, closes the issue, or cancels the run in Temporal. If the plan is approved after the infrastructure has changed, Terraform refuses to apply the stale plan.
- **Terraform steps don't heartbeat:** if a Worker crashes during a Terraform step, Temporal only notices at the timeout (10 minutes for init and plan, 30 for apply). Cancelling the Workflow doesn't stop a running `terraform` process, and a killed one can leave the state locked.
- **State lives on the Worker's disk:** `terraform.tfstate` and the saved plan sit next to the code. Losing that disk means losing track of real infrastructure, and only one Worker can run. Moving state to a remote backend, such as S3 with locking, should come early.
- **Output is stored in two places:** plan and apply output are Activity results in Workflow history, and they're also posted to the public approval issue.
- **GitHub edge cases:** if opening the issue times out after GitHub has created it, the retry opens a second issue. Only the first 100 comments on an issue are checked.
- **Personal GitHub token:** the Worker uses your own GitHub token. A fine-grained token limited to this repository's issues would be safer.
