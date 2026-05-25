# WhatsApp Console

A dark-themed dashboard for the WhatsApp API (login, accounts, QR linking, messages, system status).

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), sign in with your API credentials, and use the sidebar to manage accounts and send messages.

## Configuration

- **API URL**: Settings → choose `http://74.50.65.142:8489` or `https://whatsapp.alufiq.com`
- **Account ID**: Overview or Accounts → default `ibsprimary` (stored in localStorage)
- **Auth**: JWT from `POST /api/auth/login` is sent as the `Authorization` header

## Scripts

| Command        | Description        |
|----------------|--------------------|
| `npm run dev`  | Development server |
| `npm run build`| Production build   |
| `npm run preview` | Preview build   |

## Stack

React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide icons.
