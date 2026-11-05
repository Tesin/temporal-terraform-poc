// Approval settings. None of these are secrets: the GitHub token comes from the Worker's environment.

/** Repository where the Workflow opens approval issues. */
export const GITHUB_REPO = 'Tesin/temporal-terraform-poc';

/**
 * GitHub users whose "Approved" comment lets apply run. The repository is public, so anyone can
 * comment on its issues. Only comments from these users count.
 */
export const APPROVERS = ['Tesin'];
