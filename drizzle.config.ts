import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Or26QItMyqCw@ep-wandering-salad-aqbj2m4g-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
  },
  tablesFilter: ["states", "cities", "planning_districts", "neighborhoods", "users", "posts", "post_reactions"]
});
