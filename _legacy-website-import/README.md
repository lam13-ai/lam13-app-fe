# lam13-app-fe

The LAM13 app: sign in, chat with Lam13, attach documents, and download generated reports and slide decks.
It also includes an admin panel (knowledge base and API keys) for admin accounts.

The landing page lives in a separate repo (`website-lam13`). The backend is `lam13-app` (FastAPI).

## Setup

```bash
npm install
cp .env.example .env.local   # set VITE_API_BASE_URL to your backend
npm run dev                  # http://localhost:5173
```

## Commands

| Command             | What it does                  |
| ------------------- | ----------------------------- |
| `npm run dev`       | Start the dev server          |
| `npm run build`     | Type-check and build to `dist/` |
| `npm test`          | Run the tests                 |
| `npm run lint`      | Lint                          |

## Settings

- `VITE_API_BASE_URL`: the backend address. Production uses `.env.production` (`https://api.lam13.ai`).
- `VITE_FEATURE_VOICE_NOTES` / `VITE_FEATURE_CALLING`: off by default. The backend doesn't support voice notes yet.

## Pages

- `/login`: sign in, sign up and forgot password. `/auth?mode=reset&token=…` is the reset-password link the backend emails.
- `/`, `/c/:id`: chat.
- `/admin`, `/admin/api-keys`: admin panel. Only emails listed in the backend's `ADMIN_PANEL_EMAILS` can use it.

## Hosting

Build with `npm run build` and serve `dist/` as a single-page app. `public/staticwebapp.config.json` handles this on Azure Static Web Apps.
