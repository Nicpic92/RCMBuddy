// netlify/functions/db.js
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

exports.handler = async function (event, context) {
    try {
        // Create a database client
        const client = await createDbClient();

        // Example: Handle a POST request
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method Not Allowed' })
            };
        }

        // Parse the request body (e.g., to get query parameters or data)
        const body = JSON.parse(event.body || '{}');

        // Example: Run a simple query (customize based on your needs)
        const { rows } = await client.query('SELECT NOW() as current_time');

        // Close the database connection
        await client.end();

        // Return the query result
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Database query successful',
                data: rows[0]
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
        };
    }
};
