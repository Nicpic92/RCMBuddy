// netlify/functions/list-files.js
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Pool } = require('pg');     // PostgreSQL client

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
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
    const user_id = decoded.id;             // Optional: if you want to filter by user as well

    // 2. Fetch files from database for the authenticated company_id
    let client;
    try {
        client = await pool.connect();
        // Query to get all files for the current company_id
        // IMPORTANT: Now selecting 'is_data_dictionary' as well
        const filesResult = await client.query(
            `SELECT id, original_filename, mimetype, size_bytes, uploaded_at, user_id, is_data_dictionary
             FROM company_files
             WHERE company_id = $1
             ORDER BY uploaded_at DESC`,
            [company_id]
        );

        const files = filesResult.rows.map(file => ({
            id: file.id,
            filename: file.original_filename,
            mimetype: file.mimetype,
            size_bytes: parseInt(file.size_bytes, 10), // Ensure size is a number
            uploaded_at: file.uploaded_at,
            uploaded_by_user_id: file.user_id, // Include uploader's ID
            is_data_dictionary: file.is_data_dictionary // Include is_data_dictionary flag
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Files retrieved successfully.', files: files })
        };

    } catch (dbError) {
        console.error('Database error listing files:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to retrieve files.', error: dbError.message }) };
    } finally {
        if (client) client.release();
    }
};
