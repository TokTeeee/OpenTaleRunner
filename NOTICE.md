# Third-Party Notices

OpenTaleRunner is released under the [MIT License](./LICENSE). This document lists
the third-party open-source components bundled with the project and their
licenses, in accordance with their respective notice requirements.

> Generated from `logs/licenses_service.md` and `logs/licenses_client_summary.txt`.
> To regenerate, run `python logs/check_licenses.py`.

## License compatibility verdict

All runtime dependencies are compatible with our MIT license. No GPL / AGPL
copyleft dependencies are bundled. Two components use boundary licenses
(MPL-2.0, LGPL-3.0) that are compatible with MIT for mere aggregation but
have source-disclosure obligations when modified — see notes below.

| Side    | Component             | License              | Notes |
|---------|-----------------------|----------------------|-------|
| server | `certifi`             | MPL-2.0              | File-level copyleft. We do not modify it. Distribute upstream copy as-is. |
| client  | `dompurify`           | MPL-2.0 OR Apache-2.0| Dual-licensed. We use the Apache-2.0 path by default. Distribute upstream NOTICE. |
| client  | `tslib`               | 0BSD                 | Permissive, attribution requested. |
| server | (all other runtime)    | MIT / BSD / Apache / PSF | Compatible. |
| client  | (all other runtime)    | MIT                  | Compatible. |

## How to verify

```bash
# 1. Service (Python)
pip install -r server/requirements.txt
pip install pip-licenses
cd server && pip-licenses --format=markdown

# 2. Client (Node)
cd client
npm install
node node_modules/license-checker/bin/license-checker --production
```

A pinned audit script lives at `logs/check_licenses.py` and writes machine-readable
summaries to `logs/licenses_service.md` and `logs/licenses_client_summary.txt`.

## Full license texts

The SPDX registry (<https://spdx.org/licenses/>) provides authoritative
license texts for every identifier above. The full upstream NOTICE files
for `dompurify` and `certifi` should be distributed with any binary build.

## Excluded from this list

- The project itself (`opentale-runner-client` package) is "UNLICENSED" in npm
  because we set `"private": true`; it is not redistributed on npm.
- Developer-only dependencies (test runners, type checkers, linters) are
  not bundled with production builds and are out of scope for redistribution
  notices.
- Transitive dependencies that are not actually used at runtime
  (e.g. environment artifacts in CI) are not bundled and therefore not
  listed here.
