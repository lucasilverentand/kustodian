# Changelog

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/plugins-v1.0.1...plugins-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/plugins-v1.0.0...plugins-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* implement monorepo structure with core packages ([b4b0aef](https://github.com/lucasilverentand/kustodian/commit/b4b0aefe7d723eac5484572fc0207f1821b7c114))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
* **plugins:** redesign plugin system with commands, hooks, generators, and object types ([a30ae17](https://github.com/lucasilverentand/kustodian/commit/a30ae1761ffb80107ca14d349cb3ab9517172b13))
