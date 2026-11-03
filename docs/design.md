# Panopticode for TypeScript

## Intent

Explain where a codebase is large, complicated, or insufficiently tested through
interactive visualizations. Generate an offline HTML report and reusable JSON
from a CLI. No hosted service is required.

## Evidence from the original

The original clone at `../panopticode` contains documentation, Java reporting
code, sample data, and gallery images. The most relevant references are:

- `website/trunk/documentation/index.html`: treemap semantics and drill-down.
- `panopticode-java/trunk/prod/src/org/panopticode/report/treemap/ComplexityTreemap.java`:
  complexity bands 1–5, 6–9, 10–24, and 25+.
- The adjacent `CoverageTreemap.java`: coverage bands 75%+, 50%+, above zero,
  zero, and a separate missing-data category.
- `sample/sample_graphs/`: working examples of complexity and coverage maps.

The original uses non-comment source statements for area and a selected metric
for color. Project/package/file/class/method structure supplies the hierarchy.
Clicking a region reveals its metrics and context. Tool integrations normalize
their results into a common model before visualization.

## First implementation

- A CLI accepts a TypeScript project and writes HTML plus versioned JSON.
- A treemap groups directories, files, and executable functions. Methods,
  constructors, accessors, arrows, and callbacks are included.
- Area represents source statement count; color represents cyclomatic
  complexity. Both definitions must be documented for TypeScript, rather than
  claiming numerical equivalence to JavaNCSS.
- Nested functions have independent complexity; their branches do not inflate
  the enclosing function. Executable module-level code is represented explicitly.
- Search, directory drill-down, a selectable function list, source locations,
  legends, and a detail panel make small regions inspectable.
- Existing coverage reports can supply a separate coverage view. Coverage is
  observed runtime data, never inferred from static analysis. Missing data is
  distinct from measured zero coverage.
- The report embeds all scripts, styles, and data, works from `file://`, and
  requires no network requests.
- JSON separates analysis from rendering and leaves room for later adapters and
  historical snapshots without imposing the original RDF or Ant architecture.

## Agreed tool choices

Use ts-morph for parsing and traversing source, with its exported TypeScript
compiler API for project configuration. Import existing ESLint JSON results to display file-level
findings and rule details. Do not bundle or run ESLint/typescript-eslint or
choose new lint rules. Import existing Istanbul coverage JSON rather than
installing a test or coverage runner into the analyzed project.

Additional quality metrics require discussion before implementation. The first
version focuses on the original size, cyclomatic complexity, and coverage ideas.
No aggregate health score is proposed: the report should expose the evidence
and metric definitions directly.

The report follows the system light/dark theme through CSS, including SVG group
colors and controls. Print styles use light mode. The self report includes the
browser JavaScript via tsconfig `allowJs`; see [refinements](refinements.md) for
the analysis and refactoring evidence.
