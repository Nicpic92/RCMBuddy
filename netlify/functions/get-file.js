// netlify/functions/get-file.js

// OLD: const jwt = require('jsonwebtoken'); // For JWT authentication
// OLD: const { Pool } = require('pg');      // PostgreSQL client
// OLD: const pool = new Pool({ ... });

// NEW: Import centralized utility functions
const { createDbClient } = require('./db');
const auth = require('./auth');

exports.handler = async (event, context) => {
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

    // 2. Get file ID from query parameters
    const fileId = event.queryStringParameters.fileId;
    if (!fileId) {
        return { statusCode: 400, body: JSON.stringify({ message: 'File ID is required.' }) };
    }

    let client; // Declare client outside try block for finally access
    try {
        // NEW: Use the centralized createDbClient function
        client = await createDbClient();

        // 3. Retrieve file metadata and data from database, ensuring company isolation
        const fileResult = await client.query(
            `SELECT original_filename, mimetype, file_data
             FROM company_files
             WHERE id = $1 AND company_id = $2`, // IMPORTANT: Filter by company_id
            [fileId, company_id]
        );

        const fileRecord = fileResult.rows[0];

        if (!fileRecord) {
            // Return 404 if not found OR if it belongs to another company
            return { statusCode: 404, body: JSON.stringify({ message: 'File not found or not accessible.' }) };
        }

        // 4. Send the file data back as a binary base64 encoded response
        // Note: For large files, direct binary responses can sometimes be tricky
        // in Netlify Functions depending on payload limits.
        return {
            statusCode: 200,
            headers: {
                'Content-Type': fileRecord.mimetype, // Set the correct MIME type
                'Content-Disposition': `attachment; filename="${fileRecord.original_filename}"`, // Force download
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
            body: fileRecord.file_data.toString('base64'), // Convert BYTEA buffer to base64 for Netlify
            isBase64Encoded: true, // Tell Netlify the body is base64 encoded
        };

    } catch (dbError) {
        console.error('Database error retrieving file for download:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to retrieve file for download.', error: dbError.message }) };
    } finally {
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections from createDbClient
        }
    }
};
