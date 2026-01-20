# Changelog

## [1.4.0](https://github.com/lucasilverentand/kustodian/compare/schema-v1.3.0...schema-v1.4.0) (2026-01-19)


### Features

* **phase2:** Complete Generator Validation with comprehensive test fixtures ([#122](https://github.com/lucasilverentand/kustodian/issues/122)) ([6afa349](https://github.com/lucasilverentand/kustodian/commit/6afa34971a2d86f308287f6972f5033571d128a2))


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.3.0](https://github.com/lucasilverentand/kustodian/compare/schema-v1.2.0...schema-v1.3.0) (2026-01-17)


### Features

* **generator:** add smart enable/disable system for kustomizations ([b581b5c](https://github.com/lucasilverentand/kustodian/commit/b581b5c7bedc348bc7c7399cc75ecc4897bbec84)), closes [#109](https://github.com/lucasilverentand/kustodian/issues/109)
* **secrets:** add cluster-level secret provider configuration ([#116](https://github.com/lucasilverentand/kustodian/issues/116)) ([b7d3d19](https://github.com/lucasilverentand/kustodian/commit/b7d3d19eddf3a46b522fe919954e36dc91aed9a6))
* support Helm chart versions in version substitutions ([#118](https://github.com/lucasilverentand/kustodian/issues/118)) ([5201da4](https://github.com/lucasilverentand/kustodian/commit/5201da4f5f0bbcfb8a5e7bbf952cccfbc9f36a7b)), closes [#102](https://github.com/lucasilverentand/kustodian/issues/102)
* support raw Flux Kustomization dependency references ([#117](https://github.com/lucasilverentand/kustodian/issues/117)) ([959906e](https://github.com/lucasilverentand/kustodian/commit/959906e596a345c0dd69b2a7bc91aac40c0ccdb5))
* **templates:** add node label requirement validation ([07fac3a](https://github.com/lucasilverentand/kustodian/commit/07fac3a7e458fe4f14d57fd65c2b14674d56b59a)), closes [#105](https://github.com/lucasilverentand/kustodian/issues/105)

## [1.2.0](https://github.com/lucasilverentand/kustodian/compare/schema-v1.1.0...schema-v1.2.0) (2026-01-16)


### Features

* add CEL expression support for health checks ([8264854](https://github.com/lucasilverentand/kustodian/commit/8264854ec9d9d8b3a987827304b57e8e03d368b6))
* add CEL expression support for health checks ([f231bdc](https://github.com/lucasilverentand/kustodian/commit/f231bdc496f2f0db54094106f8d045d960c2390a)), closes [#104](https://github.com/lucasilverentand/kustodian/issues/104)
* address multiple open issues ([#101](https://github.com/lucasilverentand/kustodian/issues/101), [#103](https://github.com/lucasilverentand/kustodian/issues/103), [#106](https://github.com/lucasilverentand/kustodian/issues/106)) ([ebb248b](https://github.com/lucasilverentand/kustodian/commit/ebb248b285dc8ee29764836ddd8be5be5821983c))

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/schema-v1.0.0...schema-v1.1.0) (2026-01-15)


### Features

* **sources:** add template sources system for remote fetching ([e8284d6](https://github.com/lucasilverentand/kustodian/commit/e8284d6b0c194a82e22387ae4293f66af35e6883))


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* implement monorepo structure with core packages ([b4b0aef](https://github.com/lucasilverentand/kustodian/commit/b4b0aefe7d723eac5484572fc0207f1821b7c114))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
* **nodes:** add reusable node profiles ([cf75609](https://github.com/lucasilverentand/kustodian/commit/cf756091563f602ea2fcffa0275fb7400937ee8f)), closes [#43](https://github.com/lucasilverentand/kustodian/issues/43)
* **plugins:** add 1Password and Doppler secret provider plugins ([98257a5](https://github.com/lucasilverentand/kustodian/commit/98257a5d4037a40ddb54864f043e7b663637875b))
* **registry:** add typed substitution system with automatic version updates ([0df7131](https://github.com/lucasilverentand/kustodian/commit/0df71312ef3715a6032e2cecf8f39065efe4f9cf)), closes [#42](https://github.com/lucasilverentand/kustodian/issues/42)
* **schema:** add cluster code and github metadata fields ([002911d](https://github.com/lucasilverentand/kustodian/commit/002911dfc9abe04728f0719f6cbd073f7efefa55)), closes [#46](https://github.com/lucasilverentand/kustodian/issues/46)
