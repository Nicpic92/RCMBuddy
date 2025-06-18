// netlify/functions/delete-data-dictionary.js

// OLD: const jwt = require('jsonwebtoken'); // For JWT authentication
// OLD: const { Pool } = require('pg');      // PostgreSQL client
// OLD: const pool = new Pool({ ... });

// NEW: Import centralized utility functions
const { createDbClient } = require('./db');
const auth = require('./auth');

exports.handler = async (event, context) => {
    // console.log("delete-data-dictionary.js: Function started."); // Consider removing verbose logging for production

    // Ensure only DELETE requests are allowed
    if (event.httpMethod !== 'DELETE') {
        // console.warn("delete-data-dictionary.js: Method Not Allowed:", event.httpMethod); // Consider removing for production
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // 1. Authenticate user using the auth utility
    const authResult = auth.verifyToken(event);
    if (authResult.statusCode !== 200) {
        // console.error("delete-data-dictionary.js: Authentication failed:", authResult.body); // Consider removing for production
        return authResult; // Return authentication error response
    }
    const requestingUser = authResult.user; // Contains userId, companyId, role
    // console.log("delete-data-dictionary.js: JWT decoded successfully for user ID:", requestingUser.userId, "Company ID:", requestingUser.companyId); // Consider removing for production

    // 2. Authorize user: Only admins or superadmins can delete data dictionaries
    // Adjust role as per your application's security policy.
    // For sensitive operations like deletion, 'admin' or 'superadmin' is typically appropriate.
    if (!auth.hasRole(requestingUser, 'admin')) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Access denied. Admin or Superadmin role required to delete data dictionaries.' }),
        };
    }

    // 3. Get the dictionary ID from request body
    let body;
    try {
        body = JSON.parse(event.body);
        // console.log("delete-data-dictionary.js: Request body parsed:", body); // Consider removing for production
    } catch (error) {
        console.error("delete-data-dictionary.js: Invalid JSON body received:", error.message);
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }
    const dictionaryId = body.id; // Expect 'id' in the body

    if (!dictionaryId) {
        console.error("delete-data-dictionary.js: Dictionary ID is required but missing from body.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Dictionary ID is required.' }) };
    }

    // 4. Delete the specific data dictionary from the 'data_dictionaries' table
    let client;
    try {
        // NEW: Use the centralized createDbClient function
        // console.log("delete-data-dictionary.js: Attempting to connect to DB."); // Consider removing for production
        client = await createDbClient();
        // console.log("delete-data-dictionary.js: Successfully connected to DB. Starting transaction."); // Consider removing for production
        await client.query('BEGIN'); // Start transaction

        // Ensure deletion is restricted to the authenticated user's company
        // For superadmins, you might remove the company_id check if they can delete across companies.
        // For now, assuming even admins delete only within their company.
        // console.log("delete-data-dictionary.js: Executing DELETE query for ID:", dictionaryId, "Company ID:", requestingUser.companyId); // Consider removing for production
        const deleteResult = await client.query(
            `DELETE FROM data_dictionaries
             WHERE id = $1 AND company_id = $2 RETURNING id`, // RETURNING id to confirm deletion
            [dictionaryId, requestingUser.companyId]
        );

        if (deleteResult.rowCount === 0) {
            // console.warn("delete-data-dictionary.js: Delete failed: Data dictionary not found or not authorized for ID:", dictionaryId); // Consider removing for production
            await client.query('ROLLBACK'); // Rollback if no row was affected
            return { statusCode: 404, body: JSON.stringify({ message: 'Data dictionary not found or not authorized to delete.' }) };
        }

        await client.query('COMMIT'); // Commit the deletion
        // console.log("delete-data-dictionary.js: Database transaction committed successfully."); // Consider removing for production

        // console.log("delete-data-dictionary.js: Data dictionary deleted successfully. Deleted ID:", dictionaryId); // Consider removing for production
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Data dictionary deleted successfully!', deletedId: dictionaryId })
        };

    } catch (dbError) {
        console.error('delete-data-dictionary.js: Database error deleting data dictionary:', dbError);
        if (client) {
            // console.warn("delete-data-dictionary.js: Attempting to rollback transaction due to error."); // Consider removing for production
            await client.query('ROLLBACK');
        }
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to delete data dictionary.', error: dbError.message }) };
    } finally {
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections from createDbClient
            // console.log("delete-data-dictionary.js: DB client connection ended."); // Consider removing for production
        }
    }
};
