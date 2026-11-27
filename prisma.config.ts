import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrations) uses DIRECT_URL when set. On Supabase, DATABASE_URL is
// the pooled connection (port 6543) used by the app, and DIRECT_URL is the
// direct connection (port 5432) that migrations need.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
