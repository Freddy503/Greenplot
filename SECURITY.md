# Security Policy

Greenplot stores personal knowledge, research material, API keys, and user
accounts. Please treat security reports with care.

## Reporting a Vulnerability

Do not disclose vulnerabilities in public issues.

Report security issues privately to the repository owner through GitHub's
private vulnerability reporting when available, or by email using the contact
listed on the GitHub profile.

Please include:

- A clear description of the issue.
- Steps to reproduce.
- The affected route, component, or configuration.
- Any logs or screenshots with secrets and personal data removed.

## Secret Handling

- Never commit `.env` files or real API keys.
- Rotate any credential that may have been exposed.
- Use `.env.example` for placeholders only.
- Keep private garden content, exports, backups, and generated memory/wiki data
  outside the public repository.
