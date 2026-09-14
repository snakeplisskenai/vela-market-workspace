# Vela Market Workspace

## Start the working app

From this folder:

```bash
pnpm install
pnpm run dev
```

Open `http://127.0.0.1:5174/`. Do not open the source `index.html` directly; Vite must resolve the Vela modules.

For a static local build:

```bash
pnpm run build
```

Then open `dist/index.html`. The build uses relative asset paths for this use case and for Vercel hosting.
