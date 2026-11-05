// A minimal GitHub REST API client for approval issues. The token is read from the Worker's
// environment (GITHUB_TOKEN), so it never passes through Temporal or this repository.

const API_URL = 'https://api.github.com';

export interface Issue {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
}

export interface IssueComment {
  body?: string;
  user: { login: string } | null;
}

async function request<T>(method: string, path: string, body?: object): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set in the Worker environment');

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'temporal-terraform-runner',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} returned ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export function createIssue(repo: string, title: string, body: string): Promise<Issue> {
  return request<Issue>('POST', `/repos/${repo}/issues`, { title, body });
}

export function getIssue(repo: string, issueNumber: number): Promise<Issue> {
  return request<Issue>('GET', `/repos/${repo}/issues/${issueNumber}`);
}

export function listComments(repo: string, issueNumber: number): Promise<IssueComment[]> {
  // One page of 100 is plenty for an approval issue.
  return request<IssueComment[]>('GET', `/repos/${repo}/issues/${issueNumber}/comments?per_page=100`);
}

export async function commentOnIssue(repo: string, issueNumber: number, body: string): Promise<void> {
  await request('POST', `/repos/${repo}/issues/${issueNumber}/comments`, { body });
}

export async function closeIssue(repo: string, issueNumber: number): Promise<void> {
  await request('PATCH', `/repos/${repo}/issues/${issueNumber}`, { state: 'closed', state_reason: 'completed' });
}

/**
 * Returns the login of the first approver whose comment is exactly "Approved", ignoring case and
 * surrounding whitespace. Returns undefined if there's no such comment.
 */
export function findApproval(comments: IssueComment[], approvers: string[]): string | undefined {
  const allowed = new Set(approvers.map((login) => login.toLowerCase()));
  const approval = comments.find(
    (comment) =>
      comment.user !== null &&
      allowed.has(comment.user.login.toLowerCase()) &&
      comment.body?.trim().toLowerCase() === 'approved',
  );
  return approval?.user?.login;
}
