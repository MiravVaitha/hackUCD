import { loadEnvConfig } from "@next/env";

// Tests read configuration the same way the app does. Nothing is printed.
loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });
