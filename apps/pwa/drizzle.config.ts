import { defineConfig } from 'drizzle-kit';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envFiles = ['.env.development.local', '.env.local', '.env'];
  for (const file of envFiles) {
    const filePath = path.resolve(__dirname, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: path.resolve(__dirname, '../../packages/shared-db/schema.ts'),
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
  },
});
