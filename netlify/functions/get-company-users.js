// netlify/functions/get-company-users.js

// OLD: const { Client } = require('pg');
// OLD: const { requireAdmin } = require('../utils/auth'); // This will be replaced

// NEW: Import centralized utility functions
const { createDbClient } = require('./db');
const auth = require('./auth');

exports.handler = async function(event) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    let client; // Declare client outside try block for finally access

    try {
        // 1. Authenticate the user
        const authResult = auth.verifyToken(event);
        if (authResult.statusCode !== 200) {
            return authResult; // Return authentication error response
        }
        const requestingUser = authResult.user; // Contains userId, companyId, role

        // 2. Authorize the user: Ensure they are an admin or superadmin
        if (!auth.hasRole(requestingUser, 'admin')) {
            return {
                statusCode: 403, // Forbidden
                body: JSON.stringify({ message: 'Access denied. Admin or Superadmin role required.' }),
            };
        }

        // The company ID is now directly from the authenticated user's JWT
        const companyId = requestingUser.companyId;

        // 3. Connect to the database using the centralized utility
        client = await createDbClient();

        // 4. Get all users from the admin's company
        const query = `
            SELECT id, username, email, role, is_active, created_at FROM users
            WHERE company_id = $1 ORDER BY created_at DESC
        `;
        const result = await client.query(query, [companyId]);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' }, // Ensure JSON content type
            body: JSON.stringify(result.rows),
        };

    } catch (error) {
        // Log the actual error for debugging
        console.error('Error in get-company-users function:', error.message);
        // Return a generic 500 error for unexpected server issues
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to retrieve company users.', error: error.message }),
        };
    } finally {
        // Ensure the database connection is closed
        if (client) {
            client.end(); // Use client.end() for direct client connections
        }
    }
};
