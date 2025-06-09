// netlify/functions/save-data-dictionary.js
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Pool } = require('pg');      // PostgreSQL client

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon's SSL
});

exports.handler = async (event, context) => {
    // Ensure only POST requests are allowed
    if (event.httpMethod !== 'POST') {
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
    const user_id = decoded.id;
    const company_id = decoded.company_id; // CRUCIAL for data isolation

    // 2. Parse request body
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }

    const { dictionaryName, rules, sourceHeaders } = requestBody; // Now expecting sourceHeaders

    // 3. Validate input data
    if (!dictionaryName || dictionaryName.trim() === '') {
        return { statusCode: 400, body: JSON.stringify({ message: 'Data dictionary name is required.' }) };
    }
    if (!rules || !Array.isArray(rules)) { // rules can be empty if no rules defined
        return { statusCode: 400, body: JSON.stringify({ message: 'Rules data must be an array.' }) };
    }
    if (sourceHeaders && !Array.isArray(sourceHeaders)) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Source headers must be an array.' }) };
    }

    // Prepare data for database storage
    // JSONB columns can directly store JSON objects/arrays from Node.js
    const rulesJson = rules; // Already an array, will be stored as JSONB
    const sourceHeadersJson = sourceHeaders || null; // Store null if no sourceHeaders are provided

    // 4. Store data dictionary in the NEW 'data_dictionaries' table
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Start transaction for atomicity

        const insertResult = await client.query(
            `INSERT INTO data_dictionaries (company_id, user_id, name, rules_json, source_headers_json)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [company_id, user_id, dictionaryName, rulesJson, sourceHeadersJson]
        );
        await client.query('COMMIT'); // Commit the transaction

        const newDictionaryId = insertResult.rows[0].id;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Data dictionary saved successfully!',
                dictionaryId: newDictionaryId,
                dictionaryName: dictionaryName
            })
        };

    } catch (dbError) {
        if (client) await client.query('ROLLBACK'); // Rollback on error
        console.error('Database error saving data dictionary:', dbError);
        // Check for unique constraint violation error (if dictionary name already exists for company)
        if (dbError.code === '23505') { // PostgreSQL unique_violation error code
             return { statusCode: 409, body: JSON.stringify({ message: 'A data dictionary with this name already exists for your company. Please choose a different name.', error: dbError.message }) };
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to save data dictionary to database.', error: dbError.message }) };
    } finally {
        if (client) client.release(); // Release client back to pool
    }
};
