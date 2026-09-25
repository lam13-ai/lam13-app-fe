# website-lam13

Lam13.ai landing site — Vite + React + TypeScript + Tailwind CSS.

## Requirements

- Node.js 18+ (24.x recommended)
- npm

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Starts the Vite dev server (default http://localhost:5173).

## Build

```bash
npm run build
```

Production build output goes to `dist/`.

## Preview production build

```bash
npm run preview
```

Serves the `dist/` folder locally.

## Notes

- Single-page app: the host must rewrite all routes (e.g. `/privacy`, `/terms`) to `index.html`.
