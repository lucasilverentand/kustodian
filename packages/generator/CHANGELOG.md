# Changelog

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
