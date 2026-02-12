# Changelog

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-k0s-v1.0.0...kustodian-k0s-v1.1.0) (2026-02-12)


### Features

* add k0sctl apply/kubeconfig executor and preview integration ([02a2b1d](https://github.com/lucasilverentand/kustodian/commit/02a2b1d5b3f4b34447ec9c3a2d5e44c7f0e523b3))
* complete k0s provider with SSH validation, kubeconfig merge, cleanup, and dry-run preview ([7eef848](https://github.com/lucasilverentand/kustodian/commit/7eef848490a8b9ca16ea66144f1282138572d8e8))


### Bug Fixes

* align generated k0sctl config with expected format ([bd4e3c9](https://github.com/lucasilverentand/kustodian/commit/bd4e3c9ec3d020c08ae5efd63bfb36d166b71f63))
* improve node labeling reliability after k0sctl apply ([cfb52fc](https://github.com/lucasilverentand/kustodian/commit/cfb52fcf144496220def5356b5ea82f1808f646f))
* retry label sync when API server is not yet reachable ([3eb647f](https://github.com/lucasilverentand/kustodian/commit/3eb647fc84021f6bddae0d30d64b98a4df19b270))
* retry node labeling when API server is not ready yet ([3623173](https://github.com/lucasilverentand/kustodian/commit/36231733657aea514c744c678ece3a6011b9da5f))
* silence per-node warnings during label sync retries ([b35bd3e](https://github.com/lucasilverentand/kustodian/commit/b35bd3ef2fad1a1b41d58adc104a61d0e3996cf9))
* write kubeconfig to temp file before passing to kubectl client ([2b8480a](https://github.com/lucasilverentand/kustodian/commit/2b8480a266892b720acc6f83eb50251820a41e62))

## [2.0.0](https://github.com/lucasilverentand/kustodian/compare/plugin-k0s-v1.1.1...plugin-k0s-v2.0.0) (2026-01-21)


### ⚠ BREAKING CHANGES

* The `enabled` field has been removed from template configuration. Templates are now deployed using an opt-in model: only templates explicitly listed in cluster.yaml will be deployed.

### Features

* **k0s:** integrate kubectl labeler for node label management ([0549818](https://github.com/lucasilverentand/kustodian/commit/0549818ef5b1ff674ee19451b96daafe9273a059))
* remove deprecated enabled field from templates ([#124](https://github.com/lucasilverentand/kustodian/issues/124)) ([ba1f60f](https://github.com/lucasilverentand/kustodian/commit/ba1f60f1c8c8e19ba20fbbf6af1301547a93f7f0))
* **schema:** add native spec.versions support for template-level version tracking ([7114eea](https://github.com/lucasilverentand/kustodian/commit/7114eea718bf7ddb4378f4178797556e34d22a0c))

## [1.1.1](https://github.com/lucasilverentand/kustodian/compare/plugin-k0s-v1.1.0...plugin-k0s-v1.1.1) (2026-01-19)


### Bug Fixes

* apply Biome formatting to resolve lint errors ([d1cc63d](https://github.com/lucasilverentand/kustodian/commit/d1cc63d43e8b4165b44dc56379b7a5dd551398b8))

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/plugin-k0s-v1.0.1...plugin-k0s-v1.1.0) (2026-01-17)


### Features

* support raw Flux Kustomization dependency references ([#117](https://github.com/lucasilverentand/kustodian/issues/117)) ([959906e](https://github.com/lucasilverentand/kustodian/commit/959906e596a345c0dd69b2a7bc91aac40c0ccdb5))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/plugin-k0s-v1.0.0...plugin-k0s-v1.0.1) (2026-01-15)


### Bug Fixes

* resolve CI failures with type errors, lint issues, and test timeouts ([dbd2b20](https://github.com/lucasilverentand/kustodian/commit/dbd2b20eb0b0c67649085880e91d1f914c4469a3))

## 1.0.0 (2026-01-14)


### Features

* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
