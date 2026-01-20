# Changelog

## [1.3.0](https://github.com/lucasilverentand/kustodian/compare/generator-v1.2.0...generator-v1.3.0) (2026-01-19)


### Features

* **phase2:** Complete Generator Validation with comprehensive test fixtures ([#122](https://github.com/lucasilverentand/kustodian/issues/122)) ([6afa349](https://github.com/lucasilverentand/kustodian/commit/6afa34971a2d86f308287f6972f5033571d128a2))


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.2.0](https://github.com/lucasilverentand/kustodian/compare/generator-v1.1.0...generator-v1.2.0) (2026-01-17)


### Features

* **generator:** add smart enable/disable system for kustomizations ([b581b5c](https://github.com/lucasilverentand/kustodian/commit/b581b5c7bedc348bc7c7399cc75ecc4897bbec84)), closes [#109](https://github.com/lucasilverentand/kustodian/issues/109)
* **secrets:** add cluster-level secret provider configuration ([#116](https://github.com/lucasilverentand/kustodian/issues/116)) ([b7d3d19](https://github.com/lucasilverentand/kustodian/commit/b7d3d19eddf3a46b522fe919954e36dc91aed9a6))
* support raw Flux Kustomization dependency references ([#117](https://github.com/lucasilverentand/kustodian/issues/117)) ([959906e](https://github.com/lucasilverentand/kustodian/commit/959906e596a345c0dd69b2a7bc91aac40c0ccdb5))
* **templates:** add node label requirement validation ([07fac3a](https://github.com/lucasilverentand/kustodian/commit/07fac3a7e458fe4f14d57fd65c2b14674d56b59a)), closes [#105](https://github.com/lucasilverentand/kustodian/issues/105)

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/generator-v1.0.1...generator-v1.1.0) (2026-01-16)


### Features

* add CEL expression support for health checks ([8264854](https://github.com/lucasilverentand/kustodian/commit/8264854ec9d9d8b3a987827304b57e8e03d368b6))
* add CEL expression support for health checks ([f231bdc](https://github.com/lucasilverentand/kustodian/commit/f231bdc496f2f0db54094106f8d045d960c2390a)), closes [#104](https://github.com/lucasilverentand/kustodian/issues/104)
* address multiple open issues ([#101](https://github.com/lucasilverentand/kustodian/issues/101), [#103](https://github.com/lucasilverentand/kustodian/issues/103), [#106](https://github.com/lucasilverentand/kustodian/issues/106)) ([ebb248b](https://github.com/lucasilverentand/kustodian/commit/ebb248b285dc8ee29764836ddd8be5be5821983c))


### Bug Fixes

* resolve linting and type errors in CEL health checks ([ec93de6](https://github.com/lucasilverentand/kustodian/commit/ec93de69230c9a1ff1faefce471d9e14974565c3))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/generator-v1.0.0...generator-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **cli:** complete apply command with OCI push and Flux deployment ([a58ecf1](https://github.com/lucasilverentand/kustodian/commit/a58ecf19023dfccfe047a52a2eae622af83fe462))
* **generator:** add cross-template dependency support in Flux generation ([baeaaa8](https://github.com/lucasilverentand/kustodian/commit/baeaaa86b48b83ca79a574cc4ba7651d16f81c5a)), closes [#45](https://github.com/lucasilverentand/kustodian/issues/45)
* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* **generator:** add dependency graph validation with cycle detection ([5d5f05a](https://github.com/lucasilverentand/kustodian/commit/5d5f05a3a27fcc74bcd2c1270d5b6cf7649695c0)), closes [#41](https://github.com/lucasilverentand/kustodian/issues/41)
* **generator:** add plugin hooks, substitution engine, and output writer ([bf2f7a5](https://github.com/lucasilverentand/kustodian/commit/bf2f7a5da91314f7acc58aec1241fe2c422d3591))
* **generator:** add structured directory output for Flux kustomizations ([34d19bf](https://github.com/lucasilverentand/kustodian/commit/34d19bf65cfa154073af07fc86f520ded17f8a1f)), closes [#47](https://github.com/lucasilverentand/kustodian/issues/47)
* implement monorepo structure with core packages ([b4b0aef](https://github.com/lucasilverentand/kustodian/commit/b4b0aefe7d723eac5484572fc0207f1821b7c114))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
* **plugins:** add 1Password and Doppler secret provider plugins ([98257a5](https://github.com/lucasilverentand/kustodian/commit/98257a5d4037a40ddb54864f043e7b663637875b))
* **plugins:** redesign plugin system with commands, hooks, generators, and object types ([a30ae17](https://github.com/lucasilverentand/kustodian/commit/a30ae1761ffb80107ca14d349cb3ab9517172b13))
