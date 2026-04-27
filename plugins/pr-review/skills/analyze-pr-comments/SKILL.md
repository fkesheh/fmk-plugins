---
name: analyze-pr-comments
description: Analyze and address all review comments on a pull request. Fetches unresolved comments via GitHub GraphQL API, reads code context for each, evaluates validity, makes necessary changes or drafts polite responses. Also handles replying to PR threads with auto-linkable commit hashes. TRIGGER on "analyze PR comments", "address PR review", "resolve PR feedback", "check PR comments", "reply to PR review".
---

# analyze-pr-comments — Analyze and Address PR Review Comments

Fetches unresolved, non-outdated PR review threads, evaluates each comment against real code, makes changes where needed, and optionally posts replies with auto-linkable commit hashes.

## Workflow

### Step 1 — Fetch PR comments

Fetch only unresolved, non-outdated review threads:

```bash
PR_NUM=$(gh pr view --json number -q .number) && \
OWNER=$(gh pr view --json headRepositoryOwner -q .headRepositoryOwner.login) && \
REPO=$(gh pr view --json headRepository -q .headRepository.name) && \
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        edges {
          node {
            id
            isResolved
            isOutdated
            comments(first: 10) {
              nodes {
                id
                author { login }
                body
                path
                line
                createdAt
              }
            }
          }
        }
      }
    }
  }
}' -f owner="$OWNER" -f repo="$REPO" -f pr="$PR_NUM" \
  --jq '.data.repository.pullRequest.reviewThreads.edges[]
        | select(.node.isResolved == false and .node.isOutdated == false)
        | .node.comments.nodes[]
        | {author: .author.login, body: .body, path: .path, line: .line, created: .createdAt}'
```

If the PR has many comments, also fetch with REST API as fallback:

```bash
gh api repos/:owner/:repo/pulls/$(gh pr view --json number -q .number)/comments \
  --jq '.[] | select(.pull_request_review_id != null)
         | {author: .user.login, body: .body, path: .path, line: .line, created: .created_at}'
```

### Step 2 — For each comment, analyze and address

For every unresolved comment, perform this loop:

#### 2.1 Read context
- Read the file at `path` and examine code around `line`
- If the file was modified in the PR, read the current version (not base)

#### 2.2 Evaluate
- **What's the concern?** Bug, style, performance, security, naming, architecture, test gap
- **Is it valid?** Does the code actually have this issue?
- **Is it actionable?** Can a concrete change be made?
- **Is it in scope?** Belongs to this PR or should be deferred?
- **Priority:** Critical / Important / Nice-to-have

#### 2.3 Determine action

| Determination | Action |
|---|---|
| **Change required** | Make the code change. Record file + what changed. |
| **Not required** | Draft a polite response explaining why. Include code references. |
| **Needs clarification** | Draft a question for the reviewer. |
| **Out of scope** | Acknowledge, suggest follow-up issue/PR, draft response. |
| **Already addressed** | Note what commit already fixed it. |

#### 2.4 Make changes
When a change is needed:
1. Edit the file(s) to address the feedback
2. Keep changes minimal — address only the specific concern
3. Verify the change doesn't break surrounding logic

### Step 3 — Summary

After all comments are processed, present:

- Total comments analyzed
- Changes made (with file list)
- Comments needing clarification
- Comments not requiring action (with reasons)
- Comments already addressed

### Step 4 — Reply to PR comments (Ask user first)

**Always ask before posting replies.** If user confirms:

#### 4.1 Fetch thread IDs

```bash
PR_NUM=$(gh pr view --json number -q .number) && \
OWNER=$(gh pr view --json headRepositoryOwner -q .headRepositoryOwner.login) && \
REPO=$(gh pr view --json headRepository -q .headRepository.name) && \
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        edges {
          node {
            id
            isResolved
            isOutdated
            comments(first: 1) {
              nodes { id body path line }
            }
          }
        }
      }
    }
  }
}' -f owner="$OWNER" -f repo="$REPO" -f pr="$PR_NUM" \
  --jq '.data.repository.pullRequest.reviewThreads.edges[]
        | select(.node.isResolved == false and .node.isOutdated == false)
        | {threadId: .node.id,
           path: .node.comments.nodes[0].path,
           line: .node.comments.nodes[0].line,
           body: .node.comments.nodes[0].body[0:80]}'
```

#### 4.2 Add reply

```bash
gh api graphql -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId,
    body: $body
  }) { comment { id } }
}' -f threadId="THREAD_ID_HERE" -f body="Your reply message"
```

#### 4.3 Commit hash formatting — CRITICAL

Commit hashes in replies MUST be bare (no backticks) for GitHub auto-linking:

| WRONG | CORRECT |
|---|---|
| `Fixed in \`abc123\`` | Fixed in abc123def456789012345678901234567890abcd |
| `Commit \`def456\`` | Commit def456789012345678901234567890abcd0123 |

Get full commit hashes before replying:

```bash
git log --format="%H %s" -5
```

#### 4.4 Reply template

```
✅ Addressed in commit <full-40-char-hash-no-backticks>

<Brief explanation of the fix in 1-2 sentences>
```

Then a follow-up reply with just the commit hash for clean linking:

```
Commit: <full-40-char-hash>
```

## Edge cases

| Scenario | Handling |
|---|---|
| File deleted in PR | Checkout base branch to read it: `git show origin/main:<path>` |
| Comment on unchanged line | Read line, compare with base — may have been affected by nearby changes |
| Multiple comments on same line | Address each independently; may need a single fix covering both |
| Thread already resolved | Skip — fetch only unresolved |
| Outdated diff context | Re-read current file, not diff — line numbers may have shifted |

## Notes

- Use `gh` CLI for ALL GitHub interactions — it handles auth automatically
- Prefer GraphQL API for fetching (fewer round trips), REST as fallback
- Make changes directly — don't ask for permission per change
- Keep fixes minimal and focused on the specific feedback
- Respect the reviewer's perspective but apply your own judgment
- When in doubt, flag the comment as "needs clarification" rather than guessing
