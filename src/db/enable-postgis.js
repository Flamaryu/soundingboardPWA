const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_Or26QItMyqCw@ep-wandering-salad-aqbj2m4g-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const client = new Client({
  connectionString: connectionString,
});

async function main() {
  await client.connect();
  console.log('Connected to database. Enabling postgis extension...');
  await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  console.log('PostGIS extension enabled successfully!');
  await client.end();
}

main().catch(err => {
  console.error('Error enabling PostGIS:', err);
  process.exit(1);
});
