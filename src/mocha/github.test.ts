import assert from 'assert';
import { describe, it } from 'mocha';
import { findApproval, type IssueComment } from '../github';

const comment = (login: string, body: string): IssueComment => ({ user: { login }, body });

describe('findApproval', () => {
  const approvers = ['alice'];

  it('accepts "Approved" from an approver, ignoring case and surrounding whitespace', () => {
    assert.equal(findApproval([comment('alice', '  aPPROVED \n')], approvers), 'alice');
  });

  it('matches approver logins case-insensitively', () => {
    assert.equal(findApproval([comment('Alice', 'Approved')], approvers), 'Alice');
  });

  it('ignores "Approved" from anyone who is not an approver', () => {
    assert.equal(findApproval([comment('mallory', 'Approved')], approvers), undefined);
  });

  it('ignores comments that merely contain the word', () => {
    const comments = [
      comment('alice', 'Not approved'),
      comment('alice', 'Approved?'),
      comment('alice', 'approved by me'),
    ];
    assert.equal(findApproval(comments, approvers), undefined);
  });

  it('ignores comments from deleted users', () => {
    assert.equal(findApproval([{ user: null, body: 'Approved' }], approvers), undefined);
  });
});
