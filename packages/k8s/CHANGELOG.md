# Changelog

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/k8s-v1.0.1...k8s-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/k8s-v1.0.0...k8s-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **k8s:** add Kubernetes client wrappers for runtime operations ([b589c70](https://github.com/lucasilverentand/kustodian/commit/b589c70c700207d7539cff1ba4d2cbccb7442107)), closes [#48](https://github.com/lucasilverentand/kustodian/issues/48)
