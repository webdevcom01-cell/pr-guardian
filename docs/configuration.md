# Repository Configuration

PR Guardian can be configured per-repository by placing a `.pr-guardian.yml` file in the root of the connected repository. The file is fetched from the default branch before each review.

If no config file is present, the default configuration is used.

---

## Full example

```yaml
# .pr-guardian.yml

# Paths to exclude from review.
# Accepts glob patterns (micromatch syntax).
# Matched files are stripped from the diff before the AI sees it.
exclude:
  - "**/*.lock"
  - "**/*.lockb"
  - "pnpm-lock.yaml"
  - "package-lock.json"
  - "dist/**"
  - "build/**"
  - ".next/**"
  - "coverage/**"
  - "**/*.min.js"
  - "**/*.min.css"
  - "**/*.map"
  - "migrations/**"
  - "prisma/migrations/**"

# Minimum severity level for issues to appear in the review comment.
# Issues below this threshold are collected but not shown.
# Options: LOW | MEDIUM | HIGH | CRITICAL
# Default: LOW (all issues shown)
severityThreshold: LOW

# Decisions that cause the PR commit status check to be set to "failure".
# PRs that trigger a listed decision will be blocked from merging
# if branch protection requires the pr-guardian/review check to pass.
# Options: any combination of CRITICAL | HIGH | MEDIUM | LOW
# Default: [CRITICAL, HIGH]
blockOn:
  - CRITICAL
  - HIGH

# Maximum number of issues to include in a single review comment.
# If more issues are found, they are truncated with a note.
# Range: 1–50
# Default: 20
maxIssues: 20
```

---

## Options reference

### `exclude`

Type: `string[]`  
Default: `[]`

A list of glob patterns. Any file in the PR diff whose path matches one of these patterns is removed before review. The review is skipped entirely (commit status set to `success`, `All files excluded`) if filtering leaves no diff content.

Patterns use [micromatch](https://github.com/micromatch/micromatch) syntax:

| Pattern | Matches |
|---|---|
| `**/*.lock` | Any `.lock` file in any directory |
| `dist/**` | Everything inside `dist/` |
| `src/generated/**` | Everything inside `src/generated/` |
| `*.config.js` | Config files in the root only |

---

### `severityThreshold`

Type: `"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"`  
Default: `"LOW"`

Issues with severity below this value are excluded from the review comment but still counted in the score calculation. Use `HIGH` or `CRITICAL` to keep comments focused on the most important findings.

---

### `blockOn`

Type: `Array<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">`  
Default: `["CRITICAL", "HIGH"]`

Controls which review decisions set the GitHub commit status to `failure`. The `decision` field in a review is derived from the highest-severity issues found:

| Decision | When |
|---|---|
| `APPROVE` | No issues at or above `blockOn` thresholds |
| `APPROVE_WITH_NOTES` | Issues found but none reach `blockOn` thresholds |
| `BLOCK` | At least one issue at a severity listed in `blockOn` |

To disable blocking entirely (status always `success`), set `blockOn: []`.

---

### `maxIssues`

Type: `number`  
Default: `20`

Caps the number of individual issues included in the review comment. The composite score still reflects all issues found, but only the top `maxIssues` (sorted by severity) appear in the comment. A note is appended when issues are truncated.

---

## Branch protection setup

To require PR Guardian reviews before merging:

1. Go to your repository → **Settings → Branches → Branch protection rules**.
2. Add a rule for your default branch (e.g., `main`).
3. Enable **Require status checks to pass before merging**.
4. Search for and select `pr-guardian/review`.
5. Save the rule.

Once enabled, PRs with a `failure` status from PR Guardian cannot be merged until the issues are resolved and a new commit triggers a passing review.
