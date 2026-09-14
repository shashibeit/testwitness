# Contributing to TestWitness

> **Every test has a story. Capture the proof.**

Thank you for helping make browser evidence capture safer and more useful for QA teams and
developers. Bug reports, documentation improvements, examples, accessibility fixes, tests, and
focused feature proposals are welcome.

## Before contributing

- Use only synthetic data in examples, screenshots, videos, fixtures, and bug reports.
- Never submit credentials, cookies, tokens, customer data, private evidence ZIPs, or internal URLs.
- Search existing issues and pull requests before starting overlapping work.
- Discuss large API or architecture changes before implementation so public types remain stable.
- Keep the core package framework independent. Framework-specific code belongs in examples or a
  separate adapter package.

By submitting a contribution, you agree that it may be distributed under this repository's
[MIT License](./LICENSE).

## Local setup

Requirements:

- Node.js 20.19 or newer
- npm

```bash
npm ci
npm run validate
```

To install and production-build all runnable examples:

```bash
npm run examples:install
npm run examples:build
```

## Development expectations

- Keep modules small, typed, documented, and independently testable.
- Avoid `any`; explain the rare interop case when it is unavoidable.
- Preserve application behavior when wrapping console, Fetch, XHR, or History APIs.
- Restore all patched APIs and global listeners during stop/destroy cleanup.
- Never weaken mandatory secret, password, cookie, or authorization redaction.
- Keep request/response body capture disabled by default.
- Add or update tests for behavior changes.
- Do not claim real browser video coverage from mocked unit tests.

## Pull-request checklist

- [ ] The change is focused and its user impact is explained.
- [ ] `npm run validate` passes.
- [ ] Relevant runnable examples build.
- [ ] New behavior has automated tests where practical.
- [ ] Browser permission, screenshot, video, and download behavior was manually checked when relevant.
- [ ] Documentation and stable public types were updated.
- [ ] No sensitive or production data is included.
- [ ] Cleanup restores listeners, browser methods, object URLs, and media tracks.

## Reporting bugs

Include the browser/version, operating system, minimal configuration, reproduction steps, expected
behavior, actual behavior, and sanitized warnings or stack traces. Do not attach a real evidence ZIP
until every file has been reviewed and approved for sharing.

Security or privacy issues should not be disclosed in a public issue. Follow the private process in
[`SECURITY.md`](./SECURITY.md).
