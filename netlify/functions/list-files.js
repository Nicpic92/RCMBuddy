// netlify/functions/list-files.js

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

    // Optional: Add authorization check if only specific roles can list files
    // For example, if only admins can list all company files:
    // if (!auth.hasRole(requestingUser, 'admin')) {
    //     return {
    //         statusCode: 403,
    //         body: JSON.stringify({ message: 'Access denied. Admin role required to list all company files.' }),
    //     };
    // }

    // 2. Fetch file metadata from the 'company_files' table for the authenticated company_id
    let client; // Declare client outside try block for finally access
    try {
        // NEW: Use the centralized createDbClient function
        client = await createDbClient();
        // Query to get all files for the current company_id
        // Include is_data_dictionary flag as per your RCMBuddyInfo.txt
        const filesResult = await client.query(
            `SELECT id, original_filename, mimetype, size_bytes, uploaded_at, user_id, is_data_dictionary
             FROM company_files
             WHERE company_id = $1
             ORDER BY uploaded_at DESC`, // Order by most recent upload
            [company_id]
        );

        const files = filesResult.rows.map(file => ({
            id: file.id,
            filename: file.original_filename, // Renamed for frontend clarity
            mimetype: file.mimetype,
            size_bytes: file.size_bytes,
            uploaded_at: file.uploaded_at,
            user_id: file.user_id,
            is_data_dictionary: file.is_data_dictionary // Include the flag
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
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections
        }
    }
};
