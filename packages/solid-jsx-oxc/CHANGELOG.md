# Changelog

## 0.1.0-alpha.27 (2026-07-15)

### Features

- compile-time hydration slot-order check

## 0.1.0-alpha.25 (2026-07-13)

### Bug Fixes

- gate nested spread element hydration key on top_level

## 0.1.0-alpha.24 (2026-06-22)

### Bug Fixes

- keep native children of spread elements out of the hydration-key counter

## 0.1.0-alpha.23 (2026-06-11)

### Features

- match babel's SVG + MathML namespace handling

### Chores

- remove manual release.mjs script

## 0.1.0-alpha.22 (2026-06-04)

### Bug Fixes

- decode JSX entities in component children, stop escaping innerHTML

## 0.1.0-alpha.20 (2026-05-04)

### Bug Fixes

- correct repository URLs for npm provenance

## 0.1.0-alpha.17 (2026-05-04)

### Features

- add solid-jsx-oxc - OXC-based JSX compiler for SolidJS
- add Vite and Rolldown plugin integrations
- add SSR crate for server-side rendering transforms
- implement expression-to-string conversion for SSR transforms
- add import statement injection for SSR transforms
- build proper TaggedTemplateExpression AST nodes for SSR
- complete DOM and SSR transform expression handling
- add recursive child transformation for nested JSX
- add template element walking for nested DOM elements
- add style objects, innerHTML, and hydration marker support
- add solid-jsx-oxc - OXC-based JSX compiler for SolidJS (#2)
- cleanup, publishing setup, and switch to bun
- codebase cleanup, publishing setup, and switch to bun (#3)
- improve publish script with Bun Terminal API and interactive HTML reports
- bump napi deps to 3.8 and add native ESM support (#6)
- add solid-linter crate with 22 lint rules
- JSX entity decoding and Babel-parity dynamism check
- ship cross-platform native binaries via NAPI sub-packages

### Bug Fixes

- multiple compiler bugs and add comprehensive test app
- support TanStack Start ids
- improve plugin consistency and error handling
- preserve whitespace and optimize single dynamic child
- fix fragment handling, memo wrapping, and component refs
- lowercase entire event name for delegation lookup (#12)
- ref handling for const bindings and duplicate import detection (#13)
- use bun + rust for pkg.pr.new workflow
- skip typeof ternary for const ref bindings on component refs
- strip TS type wrappers from ref assignment targets
- avoid helper merge into namespace imports
- update solid-jsx-oxc transform and lint behavior
- hydratable mode and spread element parity with Babel
- hydration marker and spread-element parity with Babel
- self-register ssr/escape helpers in to_ssr_expression
- skip hydration markers around spread-element children

### Tests

- add comprehensive transform tests (52 tests)
- regression coverage for SSR/DOM hydration and spread parity

### Refactoring

- replace benchmark submodules with scripts

### Chores

- rename repo to solid-jsx-oxc and update README
- bump versions to 0.1.0-alpha.14
- bump versions to 0.1.0-alpha.15
- add Babel comparison deps and oxc_syntax for parity tooling
- bump all packages to 0.1.0-alpha.16
- pin just-release@0.13.2 as a devDependency

### Other

- Merge branch 'Frank-III/sourcemap-impl' - OXC compiler ready for merge
- alpha.8: ESM exports, built-in children, sourcemaps
- solid-jsx-oxc: bump oxc + sourcemap/span fixes (#7)
- Bump OXC packages to alpha.9 (#8)
- Fix ref fallback and import dedupe (#9)
- Fix multi-root fragment DOM output (#10)
- Bump OXC to 0.110.0 and packages to alpha.13 (#11)

