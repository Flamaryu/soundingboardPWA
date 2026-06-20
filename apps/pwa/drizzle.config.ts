import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || (() => { throw new Error("Error: DATABASE_URL is not defined.") })(),
  },
  tablesFilter: ["states", "cities", "planning_districts", "neighborhoods", "users", "posts", "post_reactions", "beta_feedback"]
});
