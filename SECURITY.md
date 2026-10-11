# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Factorio Control Center, please report it responsibly:

- **Do not open a public issue.** Public disclosure exposes active installations.
- **Use GitHub Security Advisories:** Click **Report a vulnerability** under the **Security** tab of the repository.
- Alternatively, reach out directly through the contact details on the maintainer's GitHub profile.

Please include reproduction steps or a minimal proof of concept in your report. I will review the report and work on a fix as soon as possible.

---

## Protecting Sensitive Data

**NEVER** share the following:

- **Environment file (`.env`):** contains session secrets and admin credentials.
- **Application database (`data/database.sqlite`):** contains user accounts, password hashes, and instance configurations.
- **Factorio service tokens:** tokens from `factorio.com` grant access to download game releases and mods on behalf of your account.
- **TLS private keys:** keep `.key` and `.pem` files confidential.
- **Server backups and exported files:** backups may contain embedded tokens, passwords, and configurations.

---

## Basic Recommendations

- Only expose the web panel port to trusted networks or behind a reverse proxy with TLS encryption.
- Expose only the specific UDP ports needed for running Factorio servers.
- Keep the built-in login rate limiting enabled (`AUTH_MAX_FAILED_ATTEMPTS`).
- Keep Node.js and Factorio Control Center updated to the latest release.
