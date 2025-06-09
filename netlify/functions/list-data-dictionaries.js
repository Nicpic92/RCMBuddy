// netlify/functions/list-data-dictionaries.js
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Pool } = require('pg');      // PostgreSQL client

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon's SSL
});

exports.handler = async (event, context) => {
    // Ensure only GET requests are allowed
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // 1. Authenticate user and get company_id
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Authentication required.' }) };
    }
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return { statusCode: 403, body: JSON.stringify({ message: 'Invalid or expired token.' }) };
    }
    const company_id = decoded.company_id; // CRUCIAL for data isolation

    // 2. Fetch data dictionaries from the 'data_dictionaries' table for the authenticated company_id
    let client;
    try {
        client = await pool.connect();
        // Query to get all data dictionaries for the current company_id
        // Select only necessary metadata, not the full rules_json yet for a list
        const dictionariesResult = await client.query(
            `SELECT id, name, created_at, updated_at, user_id, source_headers_json
             FROM data_dictionaries
             WHERE company_id = $1
             ORDER BY name ASC` // Corrected: Removed JavaScript comment from SQL string
             , // Added comma to separate string from values array
            [company_id]
        );

        const dictionaries = dictionariesResult.rows.map(dict => ({
            id: dict.id,
            name: dict.name, // This is the user-given dictionary name
            created_at: dict.created_at,
            updated_at: dict.updated_at,
            user_id: dict.user_id, // Who created it
            source_headers_json: dict.source_headers_json // Optionally include source headers preview
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Data dictionaries retrieved successfully.', dictionaries: dictionaries })
        };

    } catch (dbError) {
        console.error('Database error listing data dictionaries:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to retrieve data dictionaries.', error: dbError.message }) };
    } finally {
        if (client) client.release();
    }
};
