# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues at https://github.com/yasuhito/clearhead. Use the `gh` CLI for all operations.

## Conventions

The examples below infer the repository from `origin`. Outside this repository, pass `--repo yasuhito/clearhead` explicitly.

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use `--body-file` with a file or stdin for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`. Fetch structured details and labels with `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`, with appropriate `--label` and `--state` filters.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.

When enabled, use the `gh pr` equivalents to read, comment, label, and close PRs. Inspect changes with `gh pr diff <number>`. External requests have author association `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`; exclude `OWNER`, `MEMBER`, and `COLLABORATOR`.

GitHub shares one number space across issues and PRs. Resolve an ambiguous reference with `gh pr view <number>` and fall back to `gh issue view <number>`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
