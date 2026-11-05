# ADR-008: Pin SonarJS to the inspected LGPL release

## Status

Accepted. Recorded 2026-11-05.

## Context

The inspected `eslint-plugin-sonarjs` 3.0.7 package declared LGPL in package
metadata while its shipped license and source headers used the Sonar
Source-Available License. That license restricts competitive uses, potentially
relevant to a code-health product. Metadata alone therefore did not establish a
suitable dependency choice. This observation concerns the inspected artifact;
it does not establish a license cutoff for every intervening release.

## Decision

We will pin `eslint-plugin-sonarjs` to 1.0.4, whose shipped license was inspected
as LGPL-3.0-only and whose selected rules work with the bundled ESLint 9. We
will retain Panopticode's MIT license and respect dependencies' own licenses.
We will inspect shipped terms and compatibility before changing this pin;
an automated major-version upgrade is not sufficient justification.

## Consequences

The selected rules remain available with an inspected license and compatible
peer dependency range. We forgo later rules and fixes and must assess maintenance
and redistribution obligations. The source-available terms warrant review for
this product; this choice is not a legal determination about competing licenses.

See the [analyzer documentation](../../ts/docs/analyzers.md) for the selected
rules and compatibility details, and the
[publisher's SSAL terms](https://www.sonarsource.com/license/ssal/) for context.
