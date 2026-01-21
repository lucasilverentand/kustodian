# Changelog

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/plugin-1password-v1.1.1...plugin-1password-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))
* **schema:** add native spec.versions support for template-level version tracking ([7114eea](https://github.com/lucasilverentand/kustodian/commit/7114eea718bf7ddb4378f4178797556e34d22a0c))

## [1.1.1](https://github.com/lucasilverentand/kustodian/compare/plugin-1password-v1.1.0...plugin-1password-v1.1.1) (2026-01-19)


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/plugin-1password-v1.0.1...plugin-1password-v1.1.0) (2026-01-17)


### Features

* **secrets:** add cluster-level secret provider configuration ([#116](https://github.com/lucasilverentand/kustodian/issues/116)) ([b7d3d19](https://github.com/lucasilverentand/kustodian/commit/b7d3d19eddf3a46b522fe919954e36dc91aed9a6))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/plugin-1password-v1.0.0...plugin-1password-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **plugins:** add 1Password and Doppler secret provider plugins ([98257a5](https://github.com/lucasilverentand/kustodian/commit/98257a5d4037a40ddb54864f043e7b663637875b))
