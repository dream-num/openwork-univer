## 1. Domain and Spec

- [x] 1.1 Define General-to-Univer Task Promotion in `CONTEXT.md`.
- [x] 1.2 Define General-only Univerfile Creation Promotion in `CONTEXT.md`.
- [x] 1.3 Resolve how composer `@` distinguishes primary-file intent from source/reference intent.
- [x] 1.4 Resolve multiple direct `.univer` `@` mentions in one General Session task.
- [x] 1.5 Resolve whether client or server owns `univer new` session promotion.
- [x] 1.6 Define stable Session Navigation Sections in `CONTEXT.md`.
- [x] 1.7 Run `pnpm exec openspec validate promote-general-sessions-to-univer-tasks --strict`.

## 2. Promotion from Composer Mentions

- [x] 2.1 Detect direct `.univer` composer `@` mentions at task submission.
- [x] 2.2 Promote a General Session to a bound Univer Task Session before the agent run when exactly one direct `.univer` mention is present.
- [x] 2.3 Keep weak file mentions and passive previews from promoting a General Session.
- [x] 2.4 Require a pre-run user choice when multiple direct `.univer` mentions appear in a General Session.
- [x] 2.5 Do not trigger the multiple-mention choice gate in already bound Univer Task Sessions.

## 3. Promotion from `univer new`

- [x] 3.1 Detect successful `univer new` creation events from structured tool metadata.
- [x] 3.2 Promote a General Session to the created `.univer` when the session is still General at creation time.
- [x] 3.3 Do not promote from generic assistant prose or file search output.
- [x] 3.4 Add duplicate/ambiguous creation handling when one task creates multiple `.univer` files.
- [x] 3.5 Apply returned `univer new` lifecycle metadata to the active client's local session list so the sidebar moves immediately.
- [x] 3.6 Mark direct-mention promotions from General Sessions as General-origin first-stage context.
- [x] 3.7 Create or reuse a bound `B.univer` task session when a General-origin first-stage run later emits `univer new B.univer`.
- [x] 3.8 Switch the active client to the created/reused `B.univer` session and clear the source session lifecycle marker.
- [x] 3.9 Ignore `univer new` targets that already existed before the direct `@A.univer` first-stage binding.

## 4. Bound Session No-Op Boundary

- [x] 4.1 Prevent `univer new` from switching an already bound session's Primary Univerfile.
- [x] 4.2 Do not create, open, or switch to a new Univer Task Session from an ordinary bound session's `univer new` signal.
- [x] 4.3 Keep the source session and source Univerfile unchanged when a bound session emits a different `.univer` creation signal.
- [x] 4.4 Update Univer Session Context to distinguish ordinary bound sessions from General-origin first-stage context.
- [x] 4.5 Implement promotion, General-origin handoff, and ordinary bound-session no-op as server/API-owned lifecycle semantics, with the client handling only choice UI and focus.

## 5. Validation

- [x] 5.1 Add focused tests for promotion from direct `.univer` `@` mention.
- [x] 5.2 Add focused tests for promotion from `univer new`.
- [x] 5.3 Add focused tests for no promotion from weak signals.
- [x] 5.4 Add focused tests for bound-session `univer new` no-op.
- [x] 5.5 Add focused tests for multiple direct `.univer` mentions requiring user choice.
- [x] 5.6 Add focused tests for multiple direct `.univer` mentions in a bound session not blocking submit.
- [x] 5.7 Add focused tests for empty General Sessions, Univerfiles, and Unavailable Univerfiles sections staying visible.
- [x] 5.8 Add focused server tests proving promotion and bound-session no-op cannot be bypassed through non-client metadata updates.
- [x] 5.9 Add focused tests proving bound source sessions do not acquire the new file's worktree/review state.
- [x] 5.10 Add focused tests for General-origin `@A` then `univer new B` creating/reusing and focusing a `B.univer` session.
- [x] 5.11 Add focused tests for ordinary bound sessions still treating `univer new B` as no-op.
- [x] 5.12 Run focused app/server tests for session metadata and task routing.
- [x] 5.13 Produce fraimz evidence for the first-run General Session to Univerfile Row lifecycle.
- [x] 5.14 Re-run fraimz after local sidebar metadata application and verify empty General Sessions remains visible with count 0.
- [x] 5.15 Produce fraimz evidence for the General-origin `@A` then `univer new B` handoff lifecycle.
