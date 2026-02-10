## Summary

### What changed

<!-- Describe the change in 2-5 bullets. -->

### Why this change

<!-- Explain the problem, motivation, or user impact. -->

## Scope

<!-- Mark every area touched by this PR. -->

- [ ] `contracts/**` (Cairo/Starknet contracts)
- [ ] `ui/**` (React client)
- [ ] `client/**` (frontend client)
- [ ] `indexer/**` (indexer pipeline)
- [ ] `api/**` (backend/API)
- [ ] Other (docs/chore/infra only)

## Change Type

- [ ] `feat` (new behavior)
- [ ] `fix` (bug fix)
- [ ] `refactor` (no behavior change)
- [ ] `perf` (performance improvement)
- [ ] `test` (tests only)
- [ ] `docs` (documentation only)
- [ ] `chore` (maintenance/tooling)

## Validation

### Commands run

<!-- Paste exact commands run and summarize results. -->

```bash
# example:
# cd ui && npm run lint && npm run build
```

### Area-specific verification

#### If `contracts/**` changed

- [ ] `cd contracts && sozo build`
- [ ] `cd contracts && sozo test` (or targeted tests listed below)
- [ ] Security-sensitive paths (auth, external calls, arithmetic, state transitions) reviewed

#### If `ui/**` or `client/**` changed

- [ ] `cd ui && npm run lint`
- [ ] `cd ui && npm run build`
- [ ] Manual smoke test completed for impacted routes/states
- [ ] Visual evidence attached for UI changes (screenshots/GIF)

#### If `indexer/**` or `api/**` changed

- [ ] Build/lint/test commands run (listed above)
- [ ] Schema/migration changes included when required
- [ ] Replay/idempotency/reorg or data-consistency impact reviewed

## Risk and Rollout

### Risk level

- [ ] Low
- [ ] Medium
- [ ] High

### Rollout / rollback plan

<!-- Describe deployment sequencing, feature flags, and rollback steps if needed. -->

## Breaking Changes

- [ ] No breaking changes
- [ ] Breaking changes included (describe below)

<!-- If breaking: include migration steps, compatibility notes, and owner notifications. -->

## Assumptions

<!-- List assumptions made while implementing this PR. Include how each was validated (or why it could not be validated). -->

- Assumption:
  Validation:

## Exceptions

<!-- List any deviations from normal standards/process (lint/test gaps, temporary policy exceptions, non-standard patterns). -->

- Exception:
  Reason:
  Approval/Context:

## Workarounds

<!-- List temporary fixes or compromises introduced to unblock delivery. -->

- Workaround:
  Why needed:
  Removal plan (owner + trigger/date):

## Linked Issues

<!-- Closes #123, Related #456 -->

## Reviewer Notes

<!-- Include anything reviewers should focus on first. -->

### Codex review routing reminder

- Cairo review: `contracts/**`
- Frontend review: `ui/**` + `client/**`
- Indexer/API review: `indexer/**` + `api/**`
