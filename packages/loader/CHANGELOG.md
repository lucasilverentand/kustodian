# Changelog

## [2.1.0](https://github.com/lucasilverentand/kustodian/compare/loader-v2.0.0...loader-v2.1.0) (2026-01-30)


### Features

* **schema, cli, generator, loader:** implement three-tier cascading defaults system ([1eaa017](https://github.com/lucasilverentand/kustodian/commit/1eaa01786930b8093ada349910eda46998fb54bb))
* **schema:** remove unused domain field from cluster specification ([67ae970](https://github.com/lucasilverentand/kustodian/commit/67ae97035bab570735cf305c4a47564cca97edf4))

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/loader-v1.1.1...loader-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))
* **schema:** add native spec.versions support for template-level version tracking ([7114eea](https://github.com/lucasilverentand/kustodian/commit/7114eea718bf7ddb4378f4178797556e34d22a0c))

## [1.1.1](https://github.com/lucasilverentand/kustodian/compare/loader-v1.1.0...loader-v1.1.1) (2026-01-19)


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/loader-v1.0.1...loader-v1.1.0) (2026-01-17)


### Features

* support raw Flux Kustomization dependency references ([#117](https://github.com/lucasilverentand/kustodian/issues/117)) ([959906e](https://github.com/lucasilverentand/kustodian/commit/959906e596a345c0dd69b2a7bc91aac40c0ccdb5))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/loader-v1.0.0...loader-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* implement monorepo structure with core packages ([b4b0aef](https://github.com/lucasilverentand/kustodian/commit/b4b0aefe7d723eac5484572fc0207f1821b7c114))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
* **nodes:** add reusable node profiles ([cf75609](https://github.com/lucasilverentand/kustodian/commit/cf756091563f602ea2fcffa0275fb7400937ee8f)), closes [#43](https://github.com/lucasilverentand/kustodian/issues/43)
