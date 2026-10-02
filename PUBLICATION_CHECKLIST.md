# Publication checklist

Before changing this repository from private to public:

- [x] Rewrite reachable Git commit history to GitHub noreply identities.
- [x] Verify that the former personal Gmail addresses are no longer reachable
      through any current repository branch.
- [x] Confirm that no exported private signing key or draw archive is tracked
      in the current repository tree.
- [ ] Configure local Git clients used for future commits to use
      `265524226+ptrcdx@users.noreply.github.com`.
- [ ] Enable GitHub email privacy / push protection where available.
- [ ] Replace the placeholder in `docs/legal.html` with a real responsible
      person or legal entity and suitable contact/address information whenever
      a legally valid provider or GDPR disclosure is required.
- [ ] Confirm GitHub Pages serves the expected `docs/` content before launch.
- [ ] Add and commit a reproducible `package-lock.json` when npm dependency
      resolution is available, then change CI from `npm install` to `npm ci`.

## Current publication status

The former personal commit email addresses have been removed from all currently
reachable branches. The current commit identities are GitHub noreply addresses.

The privacy notice deliberately uses the placeholder "Noch nicht festgelegt".
It is **not** a fictitious legal identity and must not be treated as a completed
provider/responsible-party disclosure where such disclosure is legally
required.

The missing `package-lock.json` is a reproducibility and supply-chain hygiene
item, not an identified software-license violation.
