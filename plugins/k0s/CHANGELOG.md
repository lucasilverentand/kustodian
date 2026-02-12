# Changelog

## [1.2.1](https://github.com/lucasilverentand/kustodian/compare/kustodian-k0s-v1.2.0...kustodian-k0s-v1.2.1) (2026-02-12)


### Bug Fixes

* auto-format release-please PR to prevent lint errors ([dca24a2](https://github.com/lucasilverentand/kustodian/commit/dca24a227e846675ea838a39b38f41a6836973b8))

## [1.2.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-k0s-v1.1.0...kustodian-k0s-v1.2.0) (2026-02-12)


### Features

* k0s cluster provider with apply, preview, and node labeling ([#144](https://github.com/lucasilverentand/kustodian/issues/144)) ([d7fe1e8](https://github.com/lucasilverentand/kustodian/commit/d7fe1e8937365ef4691957c8e73f078b454e7715))

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

## 1.0.0 (2026-02-05)


### Features

* **generator:** add dependency graph validation with cycle detection ([7b89c04](https://github.com/lucasilverentand/kustodian/commit/7b89c04cbd0cc91d50c1c09a9a52f56b17152da4))
* migrate to OCI-based deployments and remove bootstrap package ([cb6dbb4](https://github.com/lucasilverentand/kustodian/commit/cb6dbb47123a08fdc2a0227cdbf6664a73dc4d57))
