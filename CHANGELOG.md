# Changelog

## [1.1.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.0.2...kustodian-v1.1.0) (2026-02-12)


### Features

* add cluster-level values that inject into all templates ([93f81b4](https://github.com/lucasilverentand/kustodian/commit/93f81b46f34eb65a13942c8379e563d66723cdeb))
* add confirm utility for interactive CLI prompts ([77f3253](https://github.com/lucasilverentand/kustodian/commit/77f32532277ef8e6726a52471a6f80baf729ec47))
* add k0sctl apply/kubeconfig executor and preview integration ([02a2b1d](https://github.com/lucasilverentand/kustodian/commit/02a2b1d5b3f4b34447ec9c3a2d5e44c7f0e523b3))
* add preview command for manifest inspection ([4be7fc7](https://github.com/lucasilverentand/kustodian/commit/4be7fc713597fd4502b024c43ab9af37b3e09f4e))
* add semantic and cross-reference validation ([36006cf](https://github.com/lucasilverentand/kustodian/commit/36006cf6120383c6872f64a229fe569487722384))
* complete k0s provider with SSH validation, kubeconfig merge, cleanup, and dry-run preview ([7eef848](https://github.com/lucasilverentand/kustodian/commit/7eef848490a8b9ca16ea66144f1282138572d8e8))
* extend cluster metadata and improve CLI help and cluster targeting ([e545421](https://github.com/lucasilverentand/kustodian/commit/e545421bdc4b3a5ce23250a224e111267b70a9c6))
* make --cluster optional with multi-cluster support ([c5976d9](https://github.com/lucasilverentand/kustodian/commit/c5976d96799e94393120d0bc1d8ab9714caaf9c7))


### Bug Fixes

* add --skip-flux to e2e apply test to avoid flux CLI dependency ([22fb115](https://github.com/lucasilverentand/kustodian/commit/22fb115f73a99f7826b42d0a0887c7bbab2dfdec))
* align generated k0sctl config with expected format ([bd4e3c9](https://github.com/lucasilverentand/kustodian/commit/bd4e3c9ec3d020c08ae5efd63bfb36d166b71f63))
* handle label removal syntax in kubectl label command ([5b94539](https://github.com/lucasilverentand/kustodian/commit/5b9453926557e955224b04d50628ac50708d7686))
* improve node labeling reliability after k0sctl apply ([cfb52fc](https://github.com/lucasilverentand/kustodian/commit/cfb52fcf144496220def5356b5ea82f1808f646f))
* propagate kubeconfig to all kubectl/flux commands in apply ([d48f15f](https://github.com/lucasilverentand/kustodian/commit/d48f15f8d8176998b7f8948c9de4145a9647e26c))
* retry label sync when API server is not yet reachable ([3eb647f](https://github.com/lucasilverentand/kustodian/commit/3eb647fc84021f6bddae0d30d64b98a4df19b270))
* retry node labeling when API server is not ready yet ([3623173](https://github.com/lucasilverentand/kustodian/commit/36231733657aea514c744c678ece3a6011b9da5f))
* silence per-node warnings during label sync retries ([b35bd3e](https://github.com/lucasilverentand/kustodian/commit/b35bd3ef2fad1a1b41d58adc104a61d0e3996cf9))
* write kubeconfig to temp file before passing to kubectl client ([2b8480a](https://github.com/lucasilverentand/kustodian/commit/2b8480a266892b720acc6f83eb50251820a41e62))

## [1.0.2](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.0.1...kustodian-v1.0.2) (2026-02-10)


### Bug Fixes

* replace thrown exceptions with Result type for consistent error handling ([386f8e4](https://github.com/lucasilverentand/kustodian/commit/386f8e49f4acdfd1f4e50ef2bb6aff1d1f05ad4d))

## [1.0.1](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.0.0...kustodian-v1.0.1) (2026-02-10)


### Bug Fixes

* abstract cluster secret setup into provider-agnostic pattern ([0dea40a](https://github.com/lucasilverentand/kustodian/commit/0dea40a5e37225859897ac86abceb2ff09b57828))
