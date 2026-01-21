# Changelog

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/registry-v1.1.1...registry-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))
* **schema:** add native spec.versions support for template-level version tracking ([7114eea](https://github.com/lucasilverentand/kustodian/commit/7114eea718bf7ddb4378f4178797556e34d22a0c))

## [1.1.1](https://github.com/lucasilverentand/kustodian/compare/registry-v1.1.0...registry-v1.1.1) (2026-01-19)


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/registry-v1.0.1...registry-v1.1.0) (2026-01-17)


### Features

* support Helm chart versions in version substitutions ([#118](https://github.com/lucasilverentand/kustodian/issues/118)) ([5201da4](https://github.com/lucasilverentand/kustodian/commit/5201da4f5f0bbcfb8a5e7bbf952cccfbc9f36a7b)), closes [#102](https://github.com/lucasilverentand/kustodian/issues/102)

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/registry-v1.0.0...registry-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **registry:** add typed substitution system with automatic version updates ([0df7131](https://github.com/lucasilverentand/kustodian/commit/0df71312ef3715a6032e2cecf8f39065efe4f9cf)), closes [#42](https://github.com/lucasilverentand/kustodian/issues/42)
