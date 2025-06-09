// netlify/functions/delete-data-dictionary.js
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Pool } = require('pg');      // PostgreSQL client

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon's SSL
});

exports.handler = async (event, context) => {
    // Ensure only DELETE requests are allowed
    if (event.httpMethod !== 'DELETE') {
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

    // 2. Get the dictionary ID from query parameters
    const dictionaryId = event.queryStringParameters.id;
    if (!dictionaryId) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Dictionary ID is required.' }) };
    }

    // 3. Delete the specific data dictionary from the 'data_dictionaries' table
    let client;
    try {
        client = await pool.connect();
        const deleteResult = await client.query(
            `DELETE FROM data_dictionaries
             WHERE id = $1 AND company_id = $2 RETURNING id`, // RETURNING id to confirm deletion
            [dictionaryId, company_id]
        );

        if (deleteResult.rowCount === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Data dictionary not found or not authorized to delete.' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Data dictionary deleted successfully!', deletedId: dictionaryId })
        };

    } catch (dbError) {
        console.error('Database error deleting data dictionary:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to delete data dictionary.', error: dbError.message }) };
    } finally {
        if (client) client.release();
    }
};
