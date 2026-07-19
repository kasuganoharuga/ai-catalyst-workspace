import { config } from "dotenv";
import path from "node:path";

// vitest runs as a standalone Node process (unlike `next dev`/`next build`,
// which load .env.local automatically), so it needs to load env vars itself.
config({ path: path.resolve(__dirname, "../.env.local") });
