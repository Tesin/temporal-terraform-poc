# Terraform runner

A Temporal Workflow that runs `terraform init`, `terraform plan` and `terraform apply` against the stack in [terraform/](terraform/). For now that stack is a single dummy resource that runs `echo`.

## How it works

- The `runTerraform` Workflow ([src/workflows.ts](src/workflows.ts)) calls three Activities in order: init, plan, apply. Each Activity ([src/activities.ts](src/activities.ts)) runs the `terraform` CLI on the Worker's machine.
- Plan saves its result to `terraform/tfplan`, and apply runs that saved plan, so exactly what was planned gets applied.
- If the plan has no changes, the Workflow skips apply.
- The Client always uses the Workflow ID `terraform-hello`. Temporal allows only one running execution per Workflow ID, so two runs can't apply to the same stack at once.

## Running it

You need Node 20 and Terraform 1.4 or later. Run `npm install` first.

Against a local dev server:

1. `temporal server start-dev`
2. `npm run start.watch` to start the Worker.
3. In another shell, `npm run workflow -- "Hello, world"`.

Run step 3 again with the same message: the plan has no changes, so apply is skipped. Change the message and Terraform replaces the resource, so `echo` runs again.

Against Temporal Cloud, put `TEMPORAL_PROFILE=cloud` in front of steps 2 and 3, and skip step 1.

`npm test` checks the Workflow's logic with fake Activities, so it doesn't need Terraform.

## Simplifications to revisit

These are deliberate shortcuts for the first pass, to work through when handling failures:

- **Retries:** init and plan retry up to 3 times on any error. Apply is never retried.
- **No heartbeats:** if a Worker crashes mid-step, Temporal only notices when the Activity times out (10 minutes for init and plan, 30 minutes for apply). Cancelling the Workflow also doesn't stop a `terraform` process that's already running.
- **One machine only:** the state file (`terraform.tfstate`) and the saved plan are on the Worker's local disk, so this only works with a single Worker.
- **Output in Workflow history:** plan and apply output are returned as Activity results, so they're stored in Workflow history. History has size limits, and plan output can contain sensitive values. Workflow inputs, including `vars`, are stored there too.
- **No approval step:** apply runs as soon as plan finds changes.
