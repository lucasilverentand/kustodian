# Changelog

## [1.2.1](https://github.com/lucasilverentand/kustodian/compare/cli-v1.2.0...cli-v1.2.1) (2026-01-19)


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.2.0](https://github.com/lucasilverentand/kustodian/compare/cli-v1.1.0...cli-v1.2.0) (2026-01-17)


### Features

* **secrets:** add cluster-level secret provider configuration ([#116](https://github.com/lucasilverentand/kustodian/issues/116)) ([b7d3d19](https://github.com/lucasilverentand/kustodian/commit/b7d3d19eddf3a46b522fe919954e36dc91aed9a6))
* support Helm chart versions in version substitutions ([#118](https://github.com/lucasilverentand/kustodian/issues/118)) ([5201da4](https://github.com/lucasilverentand/kustodian/commit/5201da4f5f0bbcfb8a5e7bbf952cccfbc9f36a7b)), closes [#102](https://github.com/lucasilverentand/kustodian/issues/102)
* support raw Flux Kustomization dependency references ([#117](https://github.com/lucasilverentand/kustodian/issues/117)) ([959906e](https://github.com/lucasilverentand/kustodian/commit/959906e596a345c0dd69b2a7bc91aac40c0ccdb5))
* **templates:** add node label requirement validation ([07fac3a](https://github.com/lucasilverentand/kustodian/commit/07fac3a7e458fe4f14d57fd65c2b14674d56b59a)), closes [#105](https://github.com/lucasilverentand/kustodian/issues/105)

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/cli-v1.0.0...cli-v1.1.0) (2026-01-15)


### Features

* **sources:** add template sources system for remote fetching ([e8284d6](https://github.com/lucasilverentand/kustodian/commit/e8284d6b0c194a82e22387ae4293f66af35e6883))


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **cli:** add command implementations ([d34d9a8](https://github.com/lucasilverentand/kustodian/commit/d34d9a896ea78c7f10bf463d35487d7906435a96))
* **cli:** add middleware system for CLI operations ([a05bd1a](https://github.com/lucasilverentand/kustodian/commit/a05bd1af7b8e7fff6ad553fcf984033865a26b52)), closes [#49](https://github.com/lucasilverentand/kustodian/issues/49)
* **cli:** complete apply command with OCI push and Flux deployment ([a58ecf1](https://github.com/lucasilverentand/kustodian/commit/a58ecf19023dfccfe047a52a2eae622af83fe462))
* **cli:** simplify apply to generate in-memory and remove push command ([d8d991b](https://github.com/lucasilverentand/kustodian/commit/d8d991b363d3fe7594864206390b587575fcd8a8))
* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* **generator:** add dependency graph validation with cycle detection ([5d5f05a](https://github.com/lucasilverentand/kustodian/commit/5d5f05a3a27fcc74bcd2c1270d5b6cf7649695c0)), closes [#41](https://github.com/lucasilverentand/kustodian/issues/41)
* implement monorepo structure with core packages ([b4b0aef](https://github.com/lucasilverentand/kustodian/commit/b4b0aefe7d723eac5484572fc0207f1821b7c114))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
* **registry:** add typed substitution system with automatic version updates ([0df7131](https://github.com/lucasilverentand/kustodian/commit/0df71312ef3715a6032e2cecf8f39065efe4f9cf)), closes [#42](https://github.com/lucasilverentand/kustodian/issues/42)


### Bug Fixes

* **ci:** sequential build order and module resolution ([86403ec](https://github.com/lucasilverentand/kustodian/commit/86403ec439280174b2422544d04ba9fc6e14caa4))
