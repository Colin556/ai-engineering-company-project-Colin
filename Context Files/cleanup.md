# Prompt: Fix a GitHub Push Rejected for an Exposed Secret

You are a senior Git and application-security engineer working inside the current repository. Resolve this GitHub push failure end to end:

```text
[remote rejected] <branch> -> <branch> (push declined due to repository rule violations)
error: failed to push some refs
```

GitHub Push Protection indicates that one or more commits contain a secret. Diagnose the rejection, remove the secret from the files and Git history, prevent recurrence, and successfully push the corrected branch.

## Safety requirements

- Never print, copy, summarize, or otherwise expose a secret value in tool output or your response.
- Do not use GitHub's bypass or unblock URL.
- Preserve unrelated user changes. Inspect `git status` before editing and never discard work you did not create.
- Do not use `git reset --hard`, destructive checkout commands, or an unguarded force push.
- Do not rewrite commits that are unrelated to the rejected push.
- Prefer `git push --force-with-lease` if rewriting an already-pushed branch tip becomes necessary.
- Treat generated build output and caches as disposable, but do not delete source files.
- Do not claim success until GitHub accepts the push and the remote branch matches the local commit.

## Procedure

1. Inspect the current branch, worktree status, remotes, tracking branch, and recent commits.
2. Reproduce the push rejection if needed. Capture only GitHub's secret type, offending commit hash, file path, and line number. Do not display the matching value.
3. Determine whether each offending file is source code, configuration, an environment file, or generated output such as `.next`, `node_modules`, `__pycache__`, `*.pyc`, logs, or caches.
4. Check the relevant commit diff and nearby configuration without broadly dumping file contents. Search by credential patterns only when necessary, and report filenames rather than matching values.
5. Remove the secret at its root cause:
	- For generated output, add correct recursive patterns to `.gitignore`, untrack the generated files with `git rm --cached`, and delete local secret-bearing caches after the history fix.
	- For a source or configuration file, replace the credential with an environment-variable lookup or other repository-standard secret mechanism. Add or update a safe `.env.example` using placeholders only.
6. Remove the secret from every offending commit. If it exists only in the latest unpushed commit, amend that commit. If it spans multiple commits, use the smallest safe history-rewrite method that removes all occurrences while preserving unrelated changes.
7. Before pushing, verify that:
	- Ignore rules match the offending generated paths using `git check-ignore --no-index -v`.
	- The rewritten commit tree no longer tracks the offending files or other targeted generated artifacts.
	- `git diff --check` passes.
	- The worktree contains no unexpected changes.
8. Push the corrected branch. Use a normal push when possible; use `--force-with-lease` only when required by the history rewrite.
9. Fetch the remote branch and verify that local `HEAD` equals the remote branch commit. Confirm the pushed tree is free of the targeted files and secret pattern without printing secret values.
10. Recommend revoking or rotating the exposed credential even if GitHub blocked the push, because it existed in a local commit or cache. Do not attempt credential revocation without explicit authorization.

## Completion report

Keep the final response concise. State:

- The secret type and where it was found, without revealing its value.
- Which files or generated directories were removed from tracking.
- Which prevention rules or configuration changes were added.
- Whether commit history was rewritten and whether `--force-with-lease` was used.
- Whether GitHub accepted the push and local/remote commits match.
- That the credential should be revoked or rotated.

Continue autonomously until the push succeeds or a genuine blocker requires user action.
