# Contributing

Greenplot is open source under the MIT License. Contributions are welcome when
they keep the product practical, privacy-conscious, and easy to self-host.

## Before You Start

- Open an issue for larger changes before writing code.
- Keep pull requests focused and reviewable.
- Do not commit secrets, local `.env` files, database dumps, user exports,
  personal garden content, logs, or generated private wiki/memory data.
- Prefer existing patterns in the Next.js frontend and FastAPI backend.

## Local Checks

Run these before opening a pull request:

```bash
npm run build
python3 -m pytest openclaw-api/tests/test_contracts.py
```

## Security

Please do not open public issues for vulnerabilities. Follow
[`SECURITY.md`](SECURITY.md) instead.
