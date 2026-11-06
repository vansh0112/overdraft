# Overdraft web

The site for Overdraft: the landing page, the live console and the docs. Built with Next.js; the console
reads everything from the console API (`python/overdraft/console.py`), which reads Hedera, 0G and Arkiv.

```bash
npm install
npm run dev            # http://localhost:3000
```

Set `NEXT_PUBLIC_CONSOLE_API` to the console API's URL (default `http://localhost:8000`). The API must
allow this site's origin in `CONSOLE_ALLOWED_ORIGINS`.
