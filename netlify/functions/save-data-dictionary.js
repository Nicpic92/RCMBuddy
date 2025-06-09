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

    const { dictionaryName, rules } = requestBody;

    // 3. Validate input data
    if (!dictionaryName || dictionaryName.trim() === '') {
        return { statusCode: 400, body: JSON.stringify({ message: 'Data dictionary name is required.' }) };
    }
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ message: 'At least one rule must be defined.' }) };
    }

    // Prepare data for database storage
    // The rules array will be stored as a JSON string in the BYTEA column
    const rulesJsonString = JSON.stringify(rules);
    const rulesBuffer = Buffer.from(rulesJsonString, 'utf8'); // Convert string to Buffer

    const originalFilename = dictionaryName; // Use the provided name as the filename
    const mimetype = 'application/json'; // Mime type indicating JSON data (for rules)
    const sizeBytes = rulesBuffer.length;

    // 4. Store file data directly in PostgreSQL (Neon)
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Start transaction for atomicity

        // Insert the data dictionary metadata and its rules data
        const insertResult = await client.query(
            `INSERT INTO company_files (company_id, user_id, original_filename, mimetype, size_bytes, file_data, is_data_dictionary)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [company_id, user_id, originalFilename, mimetype, sizeBytes, rulesBuffer, true] // Set is_data_dictionary to TRUE
        );
        await client.query('COMMIT'); // Commit the transaction

        const newFileId = insertResult.rows[0].id;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Data dictionary saved successfully!',
                fileId: newFileId,
                fileName: originalFilename // Confirm the name back to frontend
            })
        };

    } catch (dbError) {
        if (client) await client.query('ROLLBACK'); // Rollback on error
        console.error('Database error saving data dictionary:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to save data dictionary to database.', error: dbError.message }) };
    } finally {
        if (client) client.release(); // Release client back to pool
    }
};
