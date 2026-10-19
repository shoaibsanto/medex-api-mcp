# Security Policy

## Reporting a vulnerability

If you discover a security issue, please report it responsibly:

- **Email:** open a private GitHub security advisory on this repository, or
  contact the maintainer via their GitHub profile.
- Please do **not** open a public issue for exploitable vulnerabilities.

You will receive an acknowledgement within a few working days. Please allow a
reasonable window for a fix before public disclosure.

## Supported versions

Only the latest release on `main` receives security updates.

## Scope & design notes

This project is a read-only medicine-information API and MCP server. Notes on
its security posture:

- **No secrets in code.** Configuration is read from environment variables at
  runtime. `.env` is git-ignored; `.env.example` contains placeholders only.
- **No authentication by default.** The fixture provider serves public,
  non-sensitive synthetic data, so there is no auth layer. If a live provider
  with sensitive or licensed data is added, authentication and authorization
  must be designed with it.
- **Input validation.** All query and path parameters are validated with Zod;
  invalid input returns a `400` with per-field detail, never a stack trace.
- **Rate limiting.** `express-rate-limit` guards against abuse (default 100
  requests / 15 min / IP, configurable).
- **Security headers.** helmet is applied; `X-Powered-By` is disabled.
- **Body size limit.** JSON bodies are capped at 100 kB.
- **No injection surface into a shell.** The MCP server spawns via a fixed
  `node` command with a static path; it does not interpolate untrusted input
  into a command line.
- **Dependency hygiene.** CI runs `npm audit --audit-level=high`. Known
  advisories are addressed before release.

## Data & medical-safety note

This is not a vulnerability class, but it is a safety-relevant policy: this
software must never present synthetic fixture data as verified clinical
information, and it is not a substitute for professional medical advice. See
[DATA_SOURCES.md](DATA_SOURCES.md).
