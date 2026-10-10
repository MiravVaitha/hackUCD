import { loadEnvConfig } from "@next/env";

// Load .env files the same way Next.js does, for scripts that run outside it.
// The logger is silenced so nothing about the files is echoed to the terminal.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  info: () => {},
  error: (...args: unknown[]) => console.error(...args),
});
