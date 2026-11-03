# Refinements and self-report review

## ts-morph evaluation

Adopted ts-morph 27 for source analysis. Its public `getBody`, `getParameters`,
`hasName`, parent navigation, and source-position helpers make the traversal
easier to follow. Public syntactic diagnostics replace the cast to the compiler's
internal `parseDiagnostics` property. One in-memory project holds the sources;
no type checking or target code execution is needed.

The discovery layer retains the compiler API exported by ts-morph to preserve
the established tsconfig/reference behavior. It does not mix compiler node
versions. TypeScript is now a development dependency; ts-morph is the runtime
dependency. The wrappers add a dependency and some overhead, so adoption is a
maintainability choice rather than a performance claim.

The original demo's complete analysis, coverage, and lint results are preserved
as a regression fixture. During migration, the old and new analyzers also
produced identical metrics for the saved original analyzer and browser sources.
Tests cover constructors, accessors, arrows, nested callbacks, default
parameters, computed names, decorators, ambient declarations, and TSX.

References: [ts-morph navigation](https://ts-morph.com/navigation/),
[compiler interoperability](https://ts-morph.com/navigation/compiler-nodes),
[version 27 package](https://github.com/dsherret/ts-morph/blob/27.0.2/packages/ts-morph/package.json).

## First refinement self-report snapshot

The initial report covered six TypeScript files and missed the browser's two
JavaScript files. The complete baseline uses the original analyzer to inspect
those browser files under the same metrics. The project's tsconfig now enables
`allowJs`, so all runtime source under `src` is included automatically.

| Existing metric | Complete baseline | Refactored runtime |
| --- | ---: | ---: |
| Maximum region complexity | 23 | 8 |
| Regions at complexity 10+ | 13 | 0 |
| Largest region, source statements | 60 | 22 |

Thresholds remain 6, 10, and 25, and the counting rules are unchanged. Neither
source exclusions nor a looser definition is used to improve the result.
These historical results concern complexity and size. At that stage coverage
and lint evidence remained unknown unless supplied. The later integrated
pipeline runs lint and duplication by default, and `npm run self` generates
test coverage too. See [analyzers](analyzers.md) for current behavior. A clean
complexity map does not establish correctness.

Refactoring separates project discovery, source traversal, syntax classification,
evidence validation, coverage import, and lint import. The browser separates tree
aggregation, metric presentation, SVG rendering, selected-region details,
inventory, and interaction state. Syntax-kind membership tables replace long
boolean classification chains. The importer shares file matching and duplicate
detection, including entries with no coverage lines.

The result intentionally has more small, named functions. Their responsibilities
are coherent and testable; lowering the number alone is not the objective.
A regression test checks all runtime source for complexity 10+ and confirms that
browser code is included.

Regenerate with `npm run self` and open `reports/self/report.html`. The self
report follows system light/dark settings, as does the synthetic demo. Chrome
checks cover both palettes, live switching without losing selection, SVG group
colors, controls, mobile layout, and light printing from a dark screen theme.
