## 1. Domain and Decisions

- [x] 1.1 Update glossary so `Univer Surface Breadcrumb` stops at `<Univerfile> / <Unit>`.
- [x] 1.2 Add glossary entries for `Univer Content View Selector` and `Univer Edit Gate`.
- [x] 1.3 Record ADR-0018 and supersede ADR-0017.
- [x] 1.4 Confirm overflow is action-only, not status detail.
- [x] 1.5 Confirm review actions appear only for pending-change content views.

## 2. Spec

- [x] 2.1 Add OpenSpec proposal for the Univer Artifact Header IA refinement.
- [x] 2.2 Add design notes for route/view/status/action zones.
- [x] 2.3 Add spec scenarios for breadcrumb, content view selector, edit gate, review actions, and overflow menu behavior.
- [x] 2.4 Validate the OpenSpec change with `openspec validate refine-univer-artifact-header-ia --strict`.

## 3. Implementation Plan

- [x] 3.1 Update the header view model so breadcrumb data excludes worktree/content scope.
- [x] 3.2 Add content view selector data for current version, original changes, and merge preview.
- [x] 3.3 Render edit gate as status only and remove status-only overflow content.
- [x] 3.4 Scope merge/discard rendering to pending-change content views.
- [x] 3.5 Hide overflow when it has no executable commands.

## 4. Validation Plan

- [x] 4.1 Update focused header tests for breadcrumb/view/status/action separation.
- [x] 4.2 Add or update fraimz evidence covering no status-only overflow menu.
- [x] 4.3 Add or update fraimz evidence covering breadcrumb spacing and content view selector placement.
- [x] 4.4 Run `pnpm --filter @openwork/app typecheck`.
- [x] 4.5 Run focused app tests for Univer artifact header behavior.
