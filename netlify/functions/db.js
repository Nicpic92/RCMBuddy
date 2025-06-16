// netlify/functions/utils/db.js
const { Client } = require('pg');

async function createDbClient() {
    const client = new Client({
        connectionString: process.env.NEON_DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
    await client.connect();
    return client;
}

module.exports = { createDbClient };
