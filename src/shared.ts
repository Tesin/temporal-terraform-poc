// Names and types shared by the Workflow, Activities, Worker and Client.

export const TASK_QUEUE = 'terraform';

export interface TerraformInput {
  /** Absolute path to the Terraform root module. It must exist on the Worker's machine. */
  workingDir: string;
  /** Passed to `terraform plan` as -var flags. Stored in Workflow history, so never put secrets here. */
  vars?: Record<string, string>;
}

export interface PlanResult {
  hasChanges: boolean;
  /** Saved plan file, relative to workingDir. Apply runs exactly this plan. */
  planFile: string;
  /** Human-readable plan output. */
  output: string;
}

export interface ApprovalIssue {
  number: number;
  url: string;
}

export interface ApprovalResult {
  approved: boolean;
  /** GitHub login of the person who approved. */
  approvedBy?: string;
}

export interface TerraformRunResult {
  applied: boolean;
  planOutput: string;
  applyOutput?: string;
  /** The GitHub issue that asked for approval. Only set if the plan had changes. */
  approvalIssue?: string;
  approvedBy?: string;
}
