# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately via
[GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" on the repository's **Security** tab), or email the
maintainers directly.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version / commit
- Any suggested remediation

We aim to acknowledge reports within a few business days and will keep you
informed as we work on a fix. Please give us reasonable time to release a patch
before any public disclosure.

## Scope notes

ProductMap is **self-hosted** software — operators are responsible for the
security of their own deployment. A few things to keep in mind:

- **`AUTH_SECRET` is required in production.** The API refuses to boot in
  production without it. Use a strong, random value and keep it secret; rotating
  it invalidates all existing sessions.
- **Sessions** are stateless signed cookies (httpOnly, `SameSite=Lax`, `Secure`
  in production). Access tokens are short-lived; revocation (deactivation, logout
  everywhere, password change) takes effect within the access-token TTL.
- **Run behind TLS.** Cookies are only marked `Secure` in production; terminate
  HTTPS at your proxy.
- **`TRUST_PROXY`** must be set only when running behind a trusted reverse proxy,
  so client-IP rate limiting reads `X-Forwarded-For` correctly.
- **Uploads** are served from an unguessable path; treat them as effectively
  public to anyone with the link.

Reports about the security of a *specific third-party deployment* (rather than the
software itself) should go to that deployment's operator.
