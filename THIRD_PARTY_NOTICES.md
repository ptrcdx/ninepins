# Third-Party Notices

Pumperella itself is **not open source**. The project-specific source code is
published under the proprietary notice in [LICENSE](./LICENSE).

The following third-party software is used by the project and remains governed
by its own license.

| Component | Version | Purpose | License |
| --- | --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js) | 0.180.0 (r180) | 3D rendering runtime | MIT |
| [cannon-es](https://github.com/pmndrs/cannon-es) | 0.20.0 | Physics runtime | MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | 3.2.4 | Development/test tooling only | MIT |

## Distributed runtime licenses

The exact license texts shipped with the vendored runtime files are stored at:

- `docs/vendor/three/LICENSE`
- `docs/vendor/cannon-es/LICENSE`

## Development tooling

Vitest is not shipped as part of the browser application. Its upstream MIT
license text is retained at:

- `third_party/vitest-LICENSE`

## Notes

- The browser application loads Three.js and cannon-es from this repository.
  It no longer loads runtime JavaScript from jsDelivr or another third-party
  CDN.
- The previous `@noble/curves` browser fallback was removed. Signature
  verification now requires the standards-based Web Crypto API available in
  current browsers.
- GitHub Actions referenced by the CI workflow are development infrastructure
  and are not distributed as part of the Pumperella application.
