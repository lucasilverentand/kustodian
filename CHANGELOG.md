# Changelog

## [1.10.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.9.0...kustodian-v1.10.0) (2026-03-01)


### Features

* fire-and-forget flux reconciliation after apply ([b8d82ad](https://github.com/lucasilverentand/kustodian/commit/b8d82ad6d0896d34bb7251711b6a979ab791f4c8))


### Bug Fixes

* add kustodian-k0s as workspace dependency for dynamic import resolution ([13961ae](https://github.com/lucasilverentand/kustodian/commit/13961ae3e5c671c41befb957000124ad7a08dcbd))

## [1.9.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.8.0...kustodian-v1.9.0) (2026-02-28)


### Features

* make cluster secrets generic instead of provider-specific ([ca3f7dc](https://github.com/lucasilverentand/kustodian/commit/ca3f7dc0126458ec873b58b352f4d916c2824388))

## [1.8.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.7.0...kustodian-v1.8.0) (2026-02-28)


### Features

* add Doppler secret provider to apply command ([7c6f799](https://github.com/lucasilverentand/kustodian/commit/7c6f799997e36cbaa653afbe2217f29f8189e485))

## [1.7.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.6.1...kustodian-v1.7.0) (2026-02-28)


### Features

* add kubectl context targeting and cluster-scoped kubeconfig naming ([#163](https://github.com/lucasilverentand/kustodian/issues/163)) ([6ca9544](https://github.com/lucasilverentand/kustodian/commit/6ca9544fb33d735efafc22ae0c332876039cf5f3)), closes [#162](https://github.com/lucasilverentand/kustodian/issues/162)

## [1.6.1](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.6.0...kustodian-v1.6.1) (2026-02-28)


### Bug Fixes

* remove targetNamespace and namespace creation from generator ([7347795](https://github.com/lucasilverentand/kustodian/commit/7347795390d80c14a0aa572971bdb54676c13e41))

## [1.6.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.5.2...kustodian-v1.6.0) (2026-02-28)


### Features

* add tmpfs, feature gates, and resource limits to flux controller tuning ([67f3a7c](https://github.com/lucasilverentand/kustodian/commit/67f3a7c0a9f8e538b1623d10915ffd9036379c52))
* clean orphaned files from templates/ during generation ([ceb104a](https://github.com/lucasilverentand/kustodian/commit/ceb104ad6a464094b4a0e1ac3ebc6116da9ad8b7))
* restore preview command for manifest inspection ([cc60990](https://github.com/lucasilverentand/kustodian/commit/cc6099067bc7b94ecad2431e3ce8788f0a9a9159))
* trigger flux reconcile after apply deploys resources ([cdd9641](https://github.com/lucasilverentand/kustodian/commit/cdd96419f7f14341af303294a6c3e1a6c162f6b9))


### Bug Fixes

* address PR review remarks for security and correctness ([055d924](https://github.com/lucasilverentand/kustodian/commit/055d9240aa0f8ddd9968514215dd3be0de50b7ba))
* consolidate git URL validation and update tests ([69e0d7e](https://github.com/lucasilverentand/kustodian/commit/69e0d7e1bbc4ed944c9b7e363a780e8d0efe0e1e))
* increase exec test timeouts for slow CI runners ([d06d3ad](https://github.com/lucasilverentand/kustodian/commit/d06d3ad3c458b34b0843da469f1e7ce941287f58))
* inline all git exec calls to eliminate CodeQL second-order injection alert ([8f21b0b](https://github.com/lucasilverentand/kustodian/commit/8f21b0bb74a7aa28237c42e341e7fe316279796c))
* inline git clone exec to break CodeQL taint flow ([fd855ce](https://github.com/lucasilverentand/kustodian/commit/fd855ce821a6b6f1896a687becbcd4d40a74cef8))
* remove indentation from MDX TabItem tags to fix docs build ([40d78eb](https://github.com/lucasilverentand/kustodian/commit/40d78eb64be601a6cae96794f9550d2febbb456c))
* sanitize command names and git URLs to address CodeQL alerts ([071fcd2](https://github.com/lucasilverentand/kustodian/commit/071fcd2eb3a865e9085bd7c2b26b23c1a61aa853))
* update OCIRepository apiVersion from v1beta2 to v1 ([5532e52](https://github.com/lucasilverentand/kustodian/commit/5532e525f439f226b4d47ec1274c872830177fed))

## [1.5.2](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.5.1...kustodian-v1.5.2) (2026-02-27)


### Bug Fixes

* skip prepublish scripts and fix GitHub Packages auth in release ([8460838](https://github.com/lucasilverentand/kustodian/commit/84608381f975d03f3dcba643503d337ea75b4d6f))

## [1.5.1](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.5.0...kustodian-v1.5.1) (2026-02-27)


### Bug Fixes

* move kustodian from peerDependencies to devDependencies in plugins ([60c356d](https://github.com/lucasilverentand/kustodian/commit/60c356dd3fd606a0150cd8a7deaa927cbce754c1))
* remove circular peerDependencies from plugins ([9df7a21](https://github.com/lucasilverentand/kustodian/commit/9df7a213c06f3d6be1ec7b9b885dc9278b3c47ad))

## [1.5.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.4.0...kustodian-v1.5.0) (2026-02-13)


### Features

* switch npm publish to use OIDC provenance ([6c6e31a](https://github.com/lucasilverentand/kustodian/commit/6c6e31a5c789d3f166a78d82a586b6b2e3e468e0))


### Bug Fixes

* use BUN_AUTH_TOKEN for npm publish authentication ([34d7d61](https://github.com/lucasilverentand/kustodian/commit/34d7d616eeb1f8f26da4d5dfc4748fad42555529))

## [1.4.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.3.1...kustodian-v1.4.0) (2026-02-12)


### Features

* remove authentik, 1password, and doppler plugins ([6d10cc0](https://github.com/lucasilverentand/kustodian/commit/6d10cc012653c6e59d249de10951dfe664b79eea))


### Bug Fixes

* remove doppler and 1password from core schema ([c2ce7ec](https://github.com/lucasilverentand/kustodian/commit/c2ce7ece171673dadd90c151fedc09ac967b732c))
* remove doppler-token input from deploy action ([2ed9e39](https://github.com/lucasilverentand/kustodian/commit/2ed9e396e548cf7573e07aa1908ca6d7aacbd7a4))
* update bun to 1.3.8 and regenerate lockfile ([5ae4ae1](https://github.com/lucasilverentand/kustodian/commit/5ae4ae132ec62238a448c9823e568eeec7016aff))

## [1.3.1](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.3.0...kustodian-v1.3.1) (2026-02-12)


### Bug Fixes

* exclude package.json from biome formatting ([4568881](https://github.com/lucasilverentand/kustodian/commit/4568881075b99f60e27b410c2da1913eb81a695d))
* remove unused preview command ([7c11424](https://github.com/lucasilverentand/kustodian/commit/7c11424d1c9cbba97c4425884292a36702339b56))
* use peerDependencies for plugins and standardize on bun ([fdb732a](https://github.com/lucasilverentand/kustodian/commit/fdb732aa1a798a503179f3242a289c201c57ee9c))

## [1.3.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.2.2...kustodian-v1.3.0) (2026-02-12)


### Features

* add kubeconfig command to pull and merge k0s cluster configs ([2c73715](https://github.com/lucasilverentand/kustodian/commit/2c737157187d7050addc27ef6678dd10cc232eea))


### Bug Fixes

* use cluster secrets pattern for OCI registry credentials ([d6cba71](https://github.com/lucasilverentand/kustodian/commit/d6cba715d88533710b5aed811177734e33d49b31))

## [1.2.2](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.2.1...kustodian-v1.2.2) (2026-02-12)


### Bug Fixes

* auto-format release-please PR to prevent lint errors ([dca24a2](https://github.com/lucasilverentand/kustodian/commit/dca24a227e846675ea838a39b38f41a6836973b8))

## [1.2.1](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.2.0...kustodian-v1.2.1) (2026-02-12)


### Bug Fixes

* exclude node_modules from OCI artifact push ([#148](https://github.com/lucasilverentand/kustodian/issues/148)) ([a94801a](https://github.com/lucasilverentand/kustodian/commit/a94801ac91c4ab50f7a222248f3ffd1b8022f3b8)), closes [#147](https://github.com/lucasilverentand/kustodian/issues/147)

## [1.2.0](https://github.com/lucasilverentand/kustodian/compare/kustodian-v1.1.0...kustodian-v1.2.0) (2026-02-12)


### Features

* k0s cluster provider with apply, preview, and node labeling ([#144](https://github.com/lucasilverentand/kustodian/issues/144)) ([d7fe1e8](https://github.com/lucasilverentand/kustodian/commit/d7fe1e8937365ef4691957c8e73f078b454e7715))


### Bug Fixes

* K0s integration ([#146](https://github.com/lucasilverentand/kustodian/issues/146)) ([b5c6cbf](https://github.com/lucasilverentand/kustodian/commit/b5c6cbf2059da41866dc89072df1b09ffca5f257))

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
