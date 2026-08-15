# KethyrPay Demo

A minimal TanStack Start frontend proof-of-concept for the KethyrPay Wave 1 initiative. It demonstrates type-safe file-based routing with placeholder pages for the core payment flows: authorization, payment, and cancellation.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

The app will start on `http://localhost:3000` (or the next available port if 3000 is in use).

## Building for Production

```bash
pnpm build
```

## Directory Structure

```
demo/
├── package.json          # Project dependencies and scripts
├── pnpm-lock.yaml        # pnpm lockfile
├── tsconfig.json         # TypeScript configuration (strict mode enabled)
├── vite.config.ts        # Vite + TanStack Start + Tailwind CSS configuration
├── tsr.config.json       # TanStack Router generator target
├── public/               # Static assets
├── src/
│   ├── router.tsx        # TanStack Router / app entry point
│   ├── routeTree.gen.ts  # Auto-generated route tree
│   ├── styles.css        # Tailwind CSS entry and global styles
│   └── routes/           # File-based routes
│       ├── __root.tsx    # Root layout
│       ├── index.tsx     # Home page
│       ├── authorize.tsx # Authorization placeholder
│       ├── pay.tsx       # Payment placeholder
│       └── cancel.tsx    # Cancellation placeholder
└── README.md             # This file
```
