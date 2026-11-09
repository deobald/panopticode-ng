# Agent guidance

Read this directory when resuming work on Panopticode NG. These notes are a
handoff, not a substitute for the user's current instructions or package docs.

Start with the [ADR index](../ADR/README.md), then read
[current state](current-state.md) and [engineering notes](engineering.md).
The [root design](../design.md) explains language boundaries;
[TypeScript analyzer documentation](../../ts/docs/analyzers.md) defines the
implemented behavior in more detail.

## User decisions to preserve

- The objective is clear visual explanations of codebase health, inspired by
  the original Java Panopticode from around 2006. Its old repository structure
  is not a template for this project.
- Discuss any additional metric or third-party analysis tool with the user,
  explaining its rationale, before adding it. The existing TypeScript metrics
  and bundled tools in the ADRs have already been approved. PHP tool choices
  are recorded in ADR-010. C# tool choices remain undecided.
- A normal CLI invocation runs all integrated passes, including typed lint,
  coverage, Knip, and dependency-cruiser. Offer `--no-*` controls. Do not revert
  to opt-in behavior or import-only lint/coverage.
- Measurements and findings are distinct. Avoid aggregate health scores and
  penalties that double-count overlapping findings. Unknown or failed evidence
  must never look like successful zero findings or zero coverage.
- Focus on code health and hygiene, not coding standards or style. PHP_CodeSniffer
  is excluded from PHP tool considerations. The two PHP applications are being
  hardened for eventual replacement with TypeScript. PDepend, PHPStan, ShipMonk,
  Clover coverage and jscpd are selected; Deptrac is excluded because it needs
  architectural rules.
- Keep reports offline, navigable, understandable, and responsive to the system
  light/dark theme. Use the self-report to guide real refactoring; do not make
  it look healthy by raising thresholds, dropping runtime code, or hiding
  missing evidence.

## Session boundary

These notes were recorded on 2026-11-05 before the user closes the session and
renames the repository/folder from `panopticode-ts` to `panopticode-ng`. Use
repository-relative paths; do not depend on the old absolute checkout path.
The TypeScript package name and binary remain `panopticode-ts`.

The relocation into `ts/` and these documentation additions have not been
committed by the agent. Git may display deletions at the old root paths and an
untracked `ts/` directory until the user stages the move. Preserve that work.
