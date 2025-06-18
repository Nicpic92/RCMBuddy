// netlify/functions/get-data-dictionary.js

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

    // 2. Get the dictionary ID from query parameters
    const dictionaryId = event.queryStringParameters.id;
    if (!dictionaryId) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Dictionary ID is required.' }) };
    }

    // 3. Fetch the specific data dictionary from the 'data_dictionaries' table
    let client; // Declare client outside try block for finally access
    try {
        // NEW: Use the centralized createDbClient function
        client = await createDbClient();
        const dictionaryResult = await client.query(
            `SELECT id, name, rules_json, source_headers_json, created_at, updated_at, user_id
             FROM data_dictionaries
             WHERE id = $1 AND company_id = $2`, // Ensure company isolation
            [dictionaryId, company_id]
        );

        const dictionary = dictionaryResult.rows[0];

        if (!dictionary) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Data dictionary not found or not accessible.' }) };
        }

        // Return the full dictionary details, including rules_json and updated_at
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Data dictionary retrieved successfully.',
                id: dictionary.id,
                name: dictionary.name,
                rules_json: dictionary.rules_json,
                source_headers_json: dictionary.source_headers_json,
                created_at: dictionary.created_at,
                updated_at: dictionary.updated_at,
                user_id: dictionary.user_id
            })
        };

    } catch (dbError) {
        console.error('Database error retrieving data dictionary:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to retrieve data dictionary.', error: dbError.message }) };
    } finally {
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections
        }
    }
};
