# Ninepins

Production-oriented static web application for the Pumperella ninepins date draw.

## Architecture

- **Player app:** responsive Three.js/Cannon-es ninepins game in `docs/`, intended for GitHub Pages.
- **Backend:** none.
- **Database:** none.
- **Draw payload:** compact, Base64URL-encoded and signed.
- **Signature verification:** ECDSA P-256 with SHA-256 in the browser via Web Crypto.
- **Admin generator:** local-only tool; the private signing key is never committed or deployed.
- **Draw rules:** three dates per player, selected uniformly without replacement from an inclusive admin-defined date range. A date may be assigned globally only once within the authoritative archive.
- **Gameplay rule:** only a throw that hits at least one pin reveals the next signed date; gutter and no-hit attempts are repeatable and consume nothing.

## Repository layout

```text
/docs/                  GitHub Pages player application and 3D lane
/admin/                 Local draw generator; never contains private key material
/src/domain/             Date-range and draw rules
/src/security/           Signed draw-token protocol
/spec/                   Production specification and protocol requirements
/tests/                  Automated tests
```

## Specification

The complete production and acceptance specification is in [`spec/production-spec.md`](./spec/production-spec.md).

## Security boundary

The public player application contains only the public verification key. Obfuscation of the payload is not secrecy; it is only intended to prevent casual reading of dates from the URL. Authenticity and tamper detection come from the digital signature.

The date archive is the authority for cross-session uniqueness. If administration moves to another browser/device, import the latest archive before creating another draw.

## Deployment target

GitHub Pages served from `/docs` on the default branch. The final public verification key must be provisioned in `docs/verification-key.json` before player links are issued.

## Development

```bash
npm install --no-audit --no-fund
npm test
```

CI runs on pushes and pull requests to `main` with Node.js 22.
