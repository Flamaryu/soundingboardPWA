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
