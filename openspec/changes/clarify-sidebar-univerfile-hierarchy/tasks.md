## 1. Domain and Spec

- [x] 1.1 Define Session Navigation Tree in `CONTEXT.md`.
- [x] 1.2 Add OpenSpec proposal/design/tasks for sidebar hierarchy clarification.
- [x] 1.3 Add `univer-target-session-workflow` spec deltas for contiguous section bodies and hierarchy states.
- [x] 1.4 Run `pnpm exec openspec validate clarify-sidebar-univerfile-hierarchy --strict`.

## 2. Sidebar Structure

- [ ] 2.1 Ensure `General Sessions`, `Univerfiles`, and `Unavailable Univerfiles` render as stable top-level Session Navigation Sections.
- [ ] 2.2 Ensure expanded `Univerfiles` rows render immediately after the `Univerfiles` header and before `Unavailable Univerfiles`.
- [ ] 2.3 Ensure empty stable sections render quiet headers without filler rows.
- [ ] 2.4 Keep `Unavailable Univerfiles` collapsed and quiet by default.

## 3. Visual Hierarchy

- [ ] 3.1 Make the workspace header visually distinct from Session Navigation Sections.
- [ ] 3.2 Make Univerfile Rows visually subordinate to the `Univerfiles` section through indentation and spacing.
- [ ] 3.3 Make nested task rows visually subordinate to the owning Univerfile Row.
- [ ] 3.4 Use file-specific icon language for Univerfile Rows rather than workspace/avatar-style identity.
- [ ] 3.5 Separate expanded, selected, hover, and keyboard focus states.

## 4. Validation

- [ ] 4.1 Add focused tests for section order and contiguous expanded section bodies.
- [ ] 4.2 Add focused tests for empty section headers and unavailable section default collapsed behavior.
- [ ] 4.3 Run focused sidebar tests.
- [ ] 4.4 Produce fraimz evidence for the updated sidebar hierarchy after implementation.
