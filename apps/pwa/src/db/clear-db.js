const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_Or26QItMyqCw@ep-wandering-salad-aqbj2m4g-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=verify-full";

const client = new Client({
  connectionString: connectionString,
});

async function main() {
  await client.connect();
  console.log('Connected to database. Dropping existing tables...');
  
  const tables = [
    'post_reactions',
    'posts',
    'users',
    'neighborhoods',
    'planning_districts',
    'cities',
    'states'
  ];

  for (const table of tables) {
    console.log(`Dropping table ${table}...`);
    await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
  }
  
  console.log('All tables dropped successfully!');
  await client.end();
}

main().catch(err => {
  console.error('Error clearing database:', err);
  process.exit(1);
});
