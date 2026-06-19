const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL environment variable is not defined.");
  process.exit(1);
}

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
