# Architecture decision records

These records capture the decisions made while reconstructing Panopticode and
expanding it into Panopticode NG. The initial set was recorded retrospectively
on 2026-11-05; that is the documentation date, not a claim about when each
implementation change occurred.

| Record | Decision | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-we-will-use-adrs.md) | We will use ADRs | Accepted |
| [ADR-002](ADR-002-panopticode-visual-approach.md) | Preserve Panopticode's visual approach | Accepted |
| [ADR-003](ADR-003-offline-reports.md) | Produce offline HTML and versioned JSON | Accepted |
| [ADR-004](ADR-004-separate-evidence.md) | Keep measurements and findings separate | Accepted |
| [ADR-005](ADR-005-ts-morph-measurements.md) | Use ts-morph for TypeScript measurements | Accepted |
| [ADR-006](ADR-006-integrated-analyzers.md) | Integrate ecosystem analyzers in separate passes | Accepted |
| [ADR-007](ADR-007-default-analysis.md) | Run all analysis passes by default | Accepted |
| [ADR-008](ADR-008-sonarjs-license-pin.md) | Pin SonarJS to the inspected LGPL release | Accepted |
| [ADR-009](ADR-009-language-monorepo.md) | Organize language packages in a monorepo | Accepted |

See [ADR-001](ADR-001-we-will-use-adrs.md) for the record format and lifecycle.
Operational handoff notes live in [docs/AGENTS](../AGENTS/README.md).
