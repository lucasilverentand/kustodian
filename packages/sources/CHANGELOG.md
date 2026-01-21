# Changelog

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/sources-v1.3.1...sources-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))
* **schema:** add native spec.versions support for template-level version tracking ([7114eea](https://github.com/lucasilverentand/kustodian/commit/7114eea718bf7ddb4378f4178797556e34d22a0c))

## [1.3.1](https://github.com/lucasilverentand/kustodian/compare/sources-v1.3.0...sources-v1.3.1) (2026-01-19)


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.3.0](https://github.com/lucasilverentand/kustodian/compare/sources-v1.2.0...sources-v1.3.0) (2026-01-17)


### Features

* support raw Flux Kustomization dependency references ([#117](https://github.com/lucasilverentand/kustodian/issues/117)) ([959906e](https://github.com/lucasilverentand/kustodian/commit/959906e596a345c0dd69b2a7bc91aac40c0ccdb5))

## [1.2.0](https://github.com/lucasilverentand/kustodian/compare/sources-v1.1.0...sources-v1.2.0) (2026-01-15)


### Features

* **sources:** export cache metadata schema for external validation ([6485dcc](https://github.com/lucasilverentand/kustodian/commit/6485dcc5e2e4bccc8b48d6752a319796b6b4d7db))

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/sources-v1.0.0...sources-v1.1.0) (2026-01-15)


### Features

* **sources:** add template sources system for remote fetching ([e8284d6](https://github.com/lucasilverentand/kustodian/commit/e8284d6b0c194a82e22387ae4293f66af35e6883))
