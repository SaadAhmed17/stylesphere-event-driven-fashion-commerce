# Contributing to StyleSphere

This document describes how development on this project works — branch
strategy, commit conventions, and the workflow for adding new code. Even as
a solo project, this is followed strictly, the same way it would be on a
real team.

## Branch strategy

We use **trunk-based development with short-lived feature branches**:

- `main` is always the source of truth. In a team setting, it would also
  always be deployable — for now, since this project is built in phases with
  intentionally incomplete states, `main` reflects "the current phase's
  progress" rather than "production-ready" until we reach Phase 12 (MVP
  deployment).
- Every phase (or significant piece of a phase) gets its own branch, named:

 Examples: `phase-2/auth-service`, `phase-8/frontend-shop-page`
- Work happens on the branch, gets committed in small logical steps, then
  merged into `main` via a Pull Request — even solo, opening a PR against
  your own branch is good practice, because it gives you a clean summary
  view of everything about to be merged.
- Delete the branch after merging. Branches are cheap and temporary; `main`
  is permanent.

## Commit message convention

We use [Conventional Commits](https://www.conventionalcommits.org/). Every
commit message follows this shape:

**Types used in this project:**

| Type | When to use it |
|---|---|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `docs` | Documentation only (README, ADRs, comments) |
| `chore` | Maintenance work — config, folder structure, dependency bumps |
| `refactor` | Restructuring code without changing its behavior |
| `test` | Adding or fixing tests |
| `ci` | Changes to GitHub Actions / CI pipeline |

**Examples:**
feat: add order creation endpoint to order-service
fix: correct stock rollback quantity in inventory-service
docs: add sequence diagram for checkout flow
chore: add dockerfile for auth-service

**Rules of thumb:**
- One logical change per commit. If your commit message needs the word
  "and," it's probably two commits.
- Write commit messages in the present tense, as an instruction: "add x,"
  not "added x" or "adds x."

## Pull Request process

1. Create a branch from `main` following the naming convention above
2. Make your commits
3. Push the branch and open a PR into `main`
4. PR title should describe the overall change (e.g. "Phase 2: Auth Service")
5. PR description should link the related GitHub Issue(s) and Milestone
6. Review the diff yourself before merging — catching an obvious mistake in
   review is a normal, expected part of the process, not a failure
7. Merge, then delete the branch

## Code style

*(Will be formalized with ESLint/Prettier configs once the first service is
built — tracked as part of Phase 2.)*

## Running the project locally

*(Will be documented here once the first runnable service exists — see the
main [README](./README.md) for current project status.)*