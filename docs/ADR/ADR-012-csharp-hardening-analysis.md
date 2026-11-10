# ADR-012: Analyze C# with native .NET tools and explicit legacy limitations

## Status

Accepted. Recorded 2026-11-09.

## Context

C# support should provide interactive reports with structural, correctness and
security evidence. Legacy .NET Framework projects may require Windows-specific
build targets and test tooling. The analyzer should use native .NET tools where
practical.

## Decision

Build a native .NET 10 CLI in `csharp/`. Use pinned Roslyn Workspaces/MSBuild
packages for evaluated project loading and source semantics. Use Roslyn syntax
independently for an explicit source inventory, statements, syntax CCN, nesting,
parameter counts and type structure. Record its definitions and preprocessor
symbols; do not equate syntax CCN with Microsoft semantic CCN.

Use Microsoft.CodeAnalysis.Metrics through its managed public APIs for
source/executable lines, cyclomatic complexity, class coupling and inheritance
depth. Keep these in separate semantic evidence and omit maintainability index.
Use compiler diagnostics and a versioned correctness/security allowlist from
Microsoft.CodeAnalysis.NetAnalyzers and Meziantou.Analyzer. Offer project policy
as an alternative, without autofixes or formatting. Whole-solution dead-code
analysis and dependency vulnerability auditing are outside the initial scope.

Use a native Roslyn-token duplication pass rather than jscpd. Match exact
identifier/literal-preserving sequences, ignore comments/whitespace, apply
50-token/5-line minima, exclude same-file overlap, record representative
matches, and count overlapping duplicated lines once. Fail explicitly at resource
limits. Microsoft's archived corpus-oriented near-duplicate research tool is
not selected; adding Node is unnecessary for this C#-specific pass.

Execute an existing compatible Coverlet test setup or an explicitly configured
command, with Cobertura import. Also accept dotCover DetailedXML. Import SARIF
diagnostics and Microsoft Metrics XML from environments that can build the
project. Permit explicit
source path mappings for Windows/CI evidence. Reject stale command output,
invalid ranges and malformed evidence; preserve unknown versus measured zero.

Run integrated passes by default with `--no-*` opt-outs, imports and isolated
failure reporting. Unsupported legacy project loading does not prevent syntax
and duplication evidence. Report unavailable semantic/security evidence plainly
instead of presenting a successful zero finding count. Require restored target
dependencies and the correct platform for semantic analysis and test execution.

Produce independent C# version-1 JSON and interactive offline HTML. Embed the
existing pure treemap partition function at build time; the C# build and runtime
do not require Node or TypeScript compilation. Keep language-specific counting
rules visible without forcing a shared report contract prematurely.

## Consequences

Syntax and duplication analysis can run on macOS. Legacy projects that require
Windows for semantic analysis or coverage can supply imported evidence.
Successful .NET SDK fixture analysis on macOS does not establish Windows
compatibility. Static security findings are
review evidence and do not replace application-specific security investigation.

Native token duplication adds maintained algorithm code, tests and explicit
limits, in return for avoiding another runtime. The interactive renderer is
C#-specific beyond the shared partition function. Analyzer dependencies and
counting rules are locked and recorded, with no aggregate health score.

Sources: [Roslyn](https://github.com/dotnet/roslyn),
[Microsoft metrics](https://learn.microsoft.com/en-us/visualstudio/code-quality/how-to-generate-code-metrics-data),
[Meziantou.Analyzer](https://github.com/meziantou/Meziantou.Analyzer),
[Coverlet](https://github.com/coverlet-coverage/coverlet),
[Microsoft near-duplicate research tool](https://github.com/microsoft/near-duplicate-code-detector).
