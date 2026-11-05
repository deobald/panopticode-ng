# ADR-006: Integrate ecosystem analyzers in separate passes

## Status

Accepted. Recorded 2026-11-05.

## Context

An initial import-only approach avoided imposing lint policy or test tooling on
projects. We found reports incomplete without integrated lint and coverage
and chose bundled analysis alongside retained import interfaces. Mature
TypeScript tools provide complementary evidence beyond source measurements.

## Decision

We will integrate ESLint and typescript-eslint with selected SonarJS rules for
findings, jscpd for matching duplicate blocks, c8 for coverage fallback, Knip for
project hygiene, and dependency-cruiser for dependency analysis. We will keep
JSON import interfaces for existing CI/project results. SonarJS version choice
is constrained by [ADR-008](ADR-008-sonarjs-license-pin.md).

We will run separate sequential passes. typescript-eslint will use its own
project service for typed linting; it will not reuse the ts-morph program.
Versioned baseline rules will focus on correctness, with project ESLint policy
available as an alternative. No autofix or formatting pass will run.

We will use jscpd core/tokenizer directly over selected files, avoiding its CLI
entry point's import side effects. Coverage will execute the project's test
workflow or import source-mapped Istanbul statement data. Tests being present
in a tsconfig does not by itself specify a runnable test command.

## Consequences

The normal report contains useful evidence without requiring users to assemble
every input themselves. Dependencies, runtime cost, configuration compatibility,
and license maintenance increase. Independent passes allow imports and failure
isolation, but can repeat parsing. Coverage entails executing project tests;
static measurements alone cannot produce runtime coverage.
