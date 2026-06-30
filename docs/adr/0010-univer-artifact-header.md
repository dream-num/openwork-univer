# Univer artifact header

OpenWork will render `.univer` artifacts with a dedicated `Univer Artifact Header` instead of reusing the generic artifact titlebar action priority. The header is owned by OpenWork, uses the currently rendered unit as the primary title when available, treats the `.univer` file as secondary context, and keeps file-level actions such as download and reveal as secondary fallback actions. `Open externally` is not part of the normal `.univer` header path; external opening remains a development or fallback path consistent with the embedded collab-client decision.

The header will be driven by a thin `Univer Artifact Header View Model`, not a persisted store or generic artifact header framework. Step 1 introduces the `.univer`-specific header skeleton and removes the default external-open button. Step 2 wires the view model to `@univer/cowork` content surface data for scope, edit gate, preview/original toggle, merge, and discard controls.
