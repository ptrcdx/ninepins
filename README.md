# Ninepins

Production-oriented static web application for the Pumperella ninepins date draw.

## Architecture

- **Player app:** static HTML/CSS/JavaScript, intended for GitHub Pages.
- **Backend:** none.
- **Database:** none.
- **Draw payload:** compact, Base64URL-encoded and signed.
- **Signature verification:** ECDSA P-256 with SHA-256 in the browser via Web Crypto.
- **Admin generator:** local-only tool; the private signing key is never committed or deployed.
- **Draw rules:** three dates per player, selected uniformly without replacement from an inclusive admin-defined date range. A date may be assigned globally only once.

## Repository layout

```text
/docs/                  GitHub Pages player application
/admin/                 Local draw generator; never contains private key material
/spec/                  Production specification and protocol documentation
/tests/                  Automated tests
```

## Security boundary

The public player application contains only the public verification key. Obfuscation of the payload is not secrecy; it is only intended to prevent casual reading of dates from the URL. Authenticity and tamper detection come from the digital signature.

## Deployment target

GitHub Pages. During development the repository can remain private. Before publishing with GitHub Pages on a GitHub Free account, the repository can be switched to public and Pages configured to serve `/docs` from the default branch.

## Status

Initial production scaffold.
