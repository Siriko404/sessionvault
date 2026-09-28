# Release procedure

This procedure is deliberately fail-closed around SessionVault's privacy and launch invariants.

## 1. Apply the shipping overlay

Extract `pvship_outputs.zip` and apply the files from its `overlay/` directory to the measured SessionVault working tree. Do not delete backend files that are absent from the overlay; the overlay is a patch set, not a standalone source snapshot.

## 2. Resolve publishing metadata before public release

Three choices are intentionally not guessed by this shipping pass:

1. Repository name — recommended default: `sessionvault`.
2. Visibility — recommended default: public only after a secret/private-transcript scan; otherwise keep private until that scan passes.
3. Project license for operator-authored additions — recommended default: MIT, which is simple and compatible with the retained upstream MIT code.

If choosing MIT, replace the root placeholder `LICENSE` with the desired MIT notice, set `package.json` `license` to `MIT`, and retain `NOTICE.md` plus `THIRD_PARTY_LICENSES/UPSTREAM_AI_SESSION_MANAGER_MIT.txt`.

## 3. Clean-tree checks

From the repository root:

```bash
node --version              # must be 24+
npm ci
npm run build
npm run verify:release
npm test
```

Every command must exit zero. `npm run verify:release` must end with `RESULT: PASS`.

## 4. Local install and live verification

```bash
./scripts/install-local.sh
sessionvault status
SESSIONVAULT_EXPECT_MIN_CONVOS=135 sessionvault verify
```

Use `SESSIONVAULT_EXPECT_MIN_CONVOS=135` only on the measured operator machine where the baseline was 135 conversations. On a different machine, omit the override.

The final verifier line must be:

```text
RESULT: PASS
```

The live verifier checks source/list/detail/search-status/usage/agents routes, unique conversation keys, the complete-transcript path, and a content-search witness when local data exposes a usable witness string.

## 5. One visual confirmation, not a debug session

After all machine checks pass, explicitly run `sessionvault open` or launch `sessionvault-app` and perform one confirmation pass:

- desktop width: top controls fit, filters are legible, cards/actions align;
- narrow width: filters scroll/wrap without clipping; controls stack; transcript remains readable;
- search: type rapidly changing queries and confirm stale prior transcript results do not reappear;
- filters/sort/star: pressed state and persistence are visible;
- detail: expand a small and a large conversation; large history starts with recent messages and exposes `Show earlier` rather than mounting everything;
- Agents/Stats: loading, success, retry/error, and empty states remain legible;
- keyboard: `/` or Ctrl/Cmd+K focuses search; Escape clears it; focus rings are visible.

Do not use this visual pass to compensate for a failed machine check. A machine failure blocks release.

## 6. Repository hygiene before push

Confirm no local transcript data, logs, caches, `.env` files, API tokens, home-directory paths, screenshots with private transcript text, `node_modules`, or `dist` are staged. Review `git status` and the complete diff.

## 7. Tag/release

After the operator has selected repository metadata/licensing and CI passes, create the release/tag according to the repository's chosen versioning policy. The current package version remains `1.0.0`; do not infer a new semantic version without an operator decision.

## Rollback

The local installer stages/builds before replacing the installed app. If a later release proves bad, check out the last known-good source and rerun `./scripts/install-local.sh`, then `sessionvault verify`.
