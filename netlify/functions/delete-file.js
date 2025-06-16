// netlify/functions/delete-file.js

// NEW: Import centralized utility functions
const { createDbClient } = require('./db'); // CORRECTED: Removed '/utils'
const auth = require('./auth'); // CORRECTED: Removed '/utils'

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // 1. Authenticate user using the auth utility
    const authResult = auth.verifyToken(event);
    if (authResult.statusCode !== 200) {
        return authResult; // Return authentication error response
    }
    const requestingUser = authResult.user; // Contains userId, companyId, role

    // Optional: Add authorization check if only certain roles can delete files
    // For example, if only admins can delete files:
    // if (!auth.hasRole(requestingUser, 'admin')) {
    //     return {
    //         statusCode: 403,
    //         body: JSON.stringify({ message: 'Access denied. Admin role required to delete files.' }),
    //     };
    // }

    // 2. Get file ID from the request body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }
    const fileId = body.fileId;
    if (!fileId) {
        return { statusCode: 400, body: JSON.stringify({ message: 'File ID is required for deletion.' }) };
    }

    let client;
    try {
        // NEW: Use the centralized createDbClient function
        client = await createDbClient();
        await client.query('BEGIN'); // Start transaction

        // 3. Delete file record from database, ensuring company isolation
        // Return 'id' to confirm deletion and if a row was affected
        const deleteResult = await client.query(
            `DELETE FROM company_files
             WHERE id = $1 AND company_id = $2 RETURNING id`, // IMPORTANT: Filter by company_id
            [fileId, requestingUser.companyId] // Use company_id from the authenticated user
        );

        if (deleteResult.rows.length === 0) {
            // File not found OR not owned by this company
            await client.query('ROLLBACK');
            return { statusCode: 404, body: JSON.stringify({ message: 'File not found or not accessible for deletion.' }) };
        }

        await client.query('COMMIT'); // Commit the deletion

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'File deleted successfully.', fileId: fileId })
        };

    } catch (dbError) {
        if (client) await client.query('ROLLBACK');
        console.error('Database error deleting file:', dbError);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to delete file.', error: dbError.message }) };
    } finally {
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections from createDbClient
        }
    }
};
