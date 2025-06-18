// netlify/functions/list-data-dictionaries.js

// OLD: const jwt = require('jsonwebtoken'); // For JWT authentication
// OLD: const { Pool } = require('pg');      // PostgreSQL client
// OLD: const pool = new Pool({ ... });

// NEW: Import centralized utility functions
const { createDbClient } = require('./db');
const auth = require('./auth');

exports.handler = async (event, context) => {
    // Ensure only GET requests are allowed
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // 1. Authenticate user using the auth utility
    const authResult = auth.verifyToken(event);
    if (authResult.statusCode !== 200) {
        return authResult; // Return authentication error response
    }
    const requestingUser = authResult.user; // Contains userId, companyId, role
    const company_id = requestingUser.companyId; // CRUCIAL for data isolation

    // 2. Fetch data dictionaries from the 'data_dictionaries' table for the authenticated company_id
    let client; // Declare client outside try block for finally access
    try {
        // NEW: Use the centralized createDbClient function
        client = await createDbClient();
        // Query to get all data dictionaries for the current company_id
        const dictionariesResult = await client.query(
            `SELECT id, name, rules_json, source_headers_json, created_at, updated_at, user_id
             FROM data_dictionaries
             WHERE company_id = $1
             ORDER BY name ASC`, // Order alphabetically by name
            [company_id]
        );

        const dictionaries = dictionariesResult.rows.map(dict => ({
            id: dict.id,
            name: dict.name, // This is the user-given dictionary name
            rules_json: dict.rules_json, // Include rules_json here
            source_headers_json: dict.source_headers_json,
            created_at: dict.created_at,
            updated_at: dict.updated_at,
            user_id: dict.user_id, // Who created it
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
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections
        }
    }
};
