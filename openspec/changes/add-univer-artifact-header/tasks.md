## 1. Domain and Design

- [x] 1.1 Add glossary entries for `Univer Artifact Header` and `Univer Artifact Header View Model`.
- [x] 1.2 Record ADR `0010-univer-artifact-header`.
- [x] 1.3 Confirm `.univer` gets a dedicated header and non-`.univer` artifacts keep the generic titlebar.
- [x] 1.4 Confirm file-level actions are secondary/fallback actions.
- [x] 1.5 Confirm Step 1 removes normal `Open externally` instead of adding an overflow menu.
- [x] 1.6 Confirm the header is driven by a thin view model, not a store or generic framework.
- [x] 1.7 Confirm implementation is staged: skeleton first, cowork content controls second.

## 2. Step 1: Header Skeleton

- [x] 2.1 Add `UniverArtifactHeader` for `target.preview === "univer"`.
- [x] 2.2 Add pure `deriveUniverArtifactHeaderViewModel`.
- [x] 2.3 Preserve generic artifact header behavior for non-`.univer` artifacts.
- [x] 2.4 Render fallback title from the `.univer` file when unit state is unavailable.
- [x] 2.5 Keep `.univer` file name/path/size as secondary context where appropriate.
- [x] 2.6 Remove normal `.univer` `Open externally` from the header.
- [x] 2.7 Keep `Close`, local `Reveal in folder`, and secondary `Download` according to workspace/file availability.
- [x] 2.8 Reserve layout zones for future content actions without rendering empty placeholder controls.

## 3. Step 2: Cowork Content Surface Integration

- [x] 3.1 Feed cowork content surface state into the header view model.
- [x] 3.2 Promote current unit plus scope to the primary header title when available.
- [x] 3.3 Render edit gate state and action.
- [x] 3.4 Render preview/original scope toggle when available.
- [x] 3.5 Render merge/discard actions for reviewable worktrees.
- [x] 3.6 Keep embedded collab-client viewer route aligned with viewer request state.

## 4. Validation

- [x] 4.1 Add unit tests for the view model title fallback and action policy.
- [x] 4.2 Add UI tests proving `.univer` omits normal `Open externally` while non-`.univer` artifacts retain generic behavior.
- [x] 4.3 Run `pnpm --filter @openwork/app typecheck`.
- [x] 4.4 Run focused app tests for artifact header behavior.
- [x] 4.5 Create fraimz evidence for opening a `.univer` artifact and verifying the dedicated header.
- [x] 4.6 Run `openspec validate add-univer-artifact-header --strict`.

Fraimz evidence: `pnpm fraimz --flow univer-artifact-collab-surface --cdp-url http://127.0.0.1:9841` passed against an isolated Electron profile. Report: `evals/results/2026-06-30T09-56-14-829Z/report.md`; frame proof: `evals/results/2026-06-30T09-56-14-829Z/fraimz.html`.

Fraimz environment note: default CDP probing failed because the sandbox could not reach local Electron ports and the default dev Electron instance hit the existing single-instance lock. The passing run used a separate Vite port, `OPENWORK_ELECTRON_APP_IDENTIFIER`, `OPENWORK_ELECTRON_USERDATA`, `OPENWORK_DATA_DIR`, and `OPENWORK_ELECTRON_REMOTE_DEBUG_PORT=9841`.
