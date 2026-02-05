# Changelog

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-authentik-v1.0.0...kustodian-authentik-v2.0.0) (2026-02-05)


### ⚠ BREAKING CHANGES

* Package renamed from @kustodian/cli to kustodian. All internal packages now accessed via subpath exports (e.g. kustodian/core). Plugins renamed from @kustodian/plugin-X to kustodian-X.
* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* consolidate all @kustodian/* packages into single kustodian package ([8a10b17](https://github.com/lucasilverentand/kustodian/commit/8a10b17471b43c5fcc8d04ab36510fa582355654))
* **phase2:** Complete Generator Validation with comprehensive test fixtures ([#122](https://github.com/lucasilverentand/kustodian/issues/122)) ([6afa349](https://github.com/lucasilverentand/kustodian/commit/6afa34971a2d86f308287f6972f5033571d128a2))
* **plugins:** add Authentik authentication provider plugin ([#119](https://github.com/lucasilverentand/kustodian/issues/119)) ([346df7e](https://github.com/lucasilverentand/kustodian/commit/346df7e715f21d525b921b5afd3e6fe9495cd1ac))
* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))


### Bug Fixes

* CI fixes and remove silverswarm test fixtures ([67b57e9](https://github.com/lucasilverentand/kustodian/commit/67b57e9af9d57c754eceb784d1af52eadd8cba7c))

## [2.0.1](https://github.com/lucasilverentand/kustodian/compare/plugin-authentik-v2.0.0...plugin-authentik-v2.0.1) (2026-01-30)


### Bug Fixes

* CI fixes and remove silverswarm test fixtures ([67b57e9](https://github.com/lucasilverentand/kustodian/commit/67b57e9af9d57c754eceb784d1af52eadd8cba7c))

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/plugin-authentik-v1.0.0...plugin-authentik-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* **phase2:** Complete Generator Validation with comprehensive test fixtures ([#122](https://github.com/lucasilverentand/kustodian/issues/122)) ([6afa349](https://github.com/lucasilverentand/kustodian/commit/6afa34971a2d86f308287f6972f5033571d128a2))
* **plugins:** add Authentik authentication provider plugin ([#119](https://github.com/lucasilverentand/kustodian/issues/119)) ([346df7e](https://github.com/lucasilverentand/kustodian/commit/346df7e715f21d525b921b5afd3e6fe9495cd1ac))
* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))
