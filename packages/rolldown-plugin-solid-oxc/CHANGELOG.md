# Changelog

## 0.1.0-alpha.17 (2026-05-04)

### Features

- add Vite and Rolldown plugin integrations
- add solid-jsx-oxc - OXC-based JSX compiler for SolidJS (#2)
- improve publish script with Bun Terminal API and interactive HTML reports

### Bug Fixes

- update plugins to use transformJsx NAPI export
- improve plugin consistency and error handling

### Performance Improvements

- use Rolldown native hook filters for transform

### Refactoring

- remove @rollup/pluginutils dependency from rolldown plugin

### Chores

- bump versions to 0.1.0-alpha.14
- bump versions to 0.1.0-alpha.15
- bump all packages to 0.1.0-alpha.16
- pin just-release@0.13.2 as a devDependency

### Other

- alpha.8: ESM exports, built-in children, sourcemaps
- Bump OXC packages to alpha.9 (#8)
- Fix ref fallback and import dedupe (#9)
- Bump OXC to 0.110.0 and packages to alpha.13 (#11)

