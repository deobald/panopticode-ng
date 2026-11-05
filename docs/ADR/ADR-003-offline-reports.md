# ADR-003: Produce offline HTML and versioned JSON

## Status

Accepted. Recorded 2026-11-05.

## Context

Developers need to inspect local codebases and share understandable reports
without deploying a service. Machine-readable results are also needed for
integrations and future language analyzers.

## Decision

We will provide a CLI that writes a self-contained offline HTML report and
versioned JSON data. HTML will embed its data, styles, and scripts and work via
`file://` without a CDN or network service. Reports will provide treemap
navigation, search, function inventories, legends, and evidence details.

We will follow the system light/dark preference, including changes while
the report is open, and use a readable light theme for printing. Embedded source
names and analyzer messages will be treated as untrusted text.

## Consequences

Reports are portable artifacts and can be reviewed without a running server.
Embedded data increases HTML size, and large inventories need pagination or
similar limits. Schema evolution and offline browser behavior require explicit
validation. A hosted application is not needed to deliver the core product.
