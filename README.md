# Ninepins / Pumperella

Static web application for the Pumperella ninepins date draw.

## Publication and license

This repository may be publicly visible, but the project-specific source code
and assets are **not open source**. No general permission to copy, modify,
redistribute, relicense, sell, or host modified versions is granted.

See:

- [LICENSE](./LICENSE) for the project-specific proprietary/source-available terms.
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for third-party software.

The Pumperella name and logo were created by the small private bowling club for
this project. No registered trademark or registered design is asserted.

## AI-assisted development

Parts of the implementation and documentation were created or revised with
generative-AI assistance and then integrated and reviewed as part of the
project. This statement is provided for transparency; it is not a license term
and does not change the licenses of third-party components.

## Architecture

- **Player app:** responsive Three.js/Cannon-es ninepins game in `docs/`, intended for GitHub Pages.
- **Backend:** none.
- **Database:** none.
- **Runtime CDN:** none; browser runtime dependencies are vendored under `docs/vendor/`.
- **Draw payload:** compact, Base64URL-encoded and signed.
- **Signature verification:** ECDSA P-256 with SHA-256 via the browser Web Crypto API.
- **Admin generator:** local-only tool; the private signing key is never committed or deployed.
- **Draw rules:** two dates per player, selected uniformly without replacement from an inclusive admin-defined date range.
- **Gameplay rule:** only a throw that hits at least one pin reveals the next signed date.
- **Compatibility:** current token version 3 contains two dates; existing version-1 and version-2 links with three dates remain playable.

## Repository layout

```text
/docs/                  GitHub Pages player application and 3D lane
/docs/vendor/           Browser runtime dependencies and their licenses
/admin/                 Local draw generator; never contains private key material
/src/domain/            Date-range and draw rules
/src/security/          Signed draw-token protocol
/spec/                  Production specification and protocol requirements
/tests/                 Automated tests
/third_party/           License records for development-only dependencies
```

## Privacy

The player application contains no analytics, advertising, trackers, Google
Fonts, or external runtime CDN requests. GitHub Pages remains the hosting
provider. The in-page privacy and technical notice is available at
[`docs/legal.html`](./docs/legal.html).

The personal game token is stored in the URL fragment. It is signed but not
encrypted; anyone who receives the complete personal link can technically
decode the player name and assigned dates.

Player progress stores only the draw identifier and revealed-date count in
browser storage. Player names and assigned dates are not written to that
progress storage.

## Security boundary

The public player application contains only the public verification key.
Authenticity and tamper detection come from the digital signature; the token
does not provide confidentiality.

The date archive is the authority for cross-session uniqueness. If
administration moves to another browser/device, import the latest authoritative
archive before creating another draw.

Never commit exported signing keys or draw archives. The repository
`.gitignore` blocks the expected local filenames as a defense-in-depth
measure.

## Runtime dependencies

- Three.js `0.180.0` / r180, MIT, vendored at `docs/vendor/three/`.
- cannon-es `0.20.0`, MIT, vendored at `docs/vendor/cannon-es/`.

Vitest `3.2.4` is used only for development/testing and is not distributed by
the GitHub Pages application.

## Specification

The production and acceptance specification is in
[`spec/production-spec.md`](./spec/production-spec.md).

## Deployment target

GitHub Pages served from `/docs` on the default branch. The public verification
key must be provisioned in `docs/verification-key.json` before player links
are issued.

## Development

```bash
npm install --no-audit --no-fund
npm test
```

CI runs on pushes and pull requests to `main` with Node.js 22.
