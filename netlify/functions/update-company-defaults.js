// netlify/functions/update-company-defaults.js

// OLD: const jwt = require('jsonwebtoken');
// OLD: const { Pool } = require('pg');
// OLD: const pool = new Pool({ ... });
// OLD: const authenticateAdmin = (authHeader) => { ... }; // This helper is removed

// NEW: Import centralized utility functions (note the ../../ for path from admin/ subdirectory)
const { createDbClient } = require('./db');
const auth = require('./auth');

exports.handler = async (event, context) => {
    // This function only accepts POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    let client; // Declare client outside try block for finally access

    try {
        // 1. Authenticate the request using the centralized helper
        const authResult = auth.verifyToken(event);
        if (authResult.statusCode !== 200) {
            return authResult; // Return authentication error
        }
        const requestingUser = authResult.user; // Contains userId, companyId, role

        // 2. Authorize the user: Must be an admin (or superadmin, as hasRole('admin') covers both)
        if (!auth.hasRole(requestingUser, 'admin')) {
            return {
                statusCode: 403, // Forbidden
                body: JSON.stringify({ message: 'Access denied. Admin role required to update company defaults.' }),
            };
        }

        // Get the companyId from the authenticated user's JWT
        const companyId = requestingUser.companyId;

        // 3. Parse the incoming data from the admin.html page
        const { defaultToolIdentifiers } = JSON.parse(event.body);

        if (!Array.isArray(defaultToolIdentifiers)) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request body. Required: defaultToolIdentifiers array.' }) };
        }

        // 4. Convert the JavaScript array of strings into a JSON string suitable for a JSONB database column
        const defaultsJson = JSON.stringify(defaultToolIdentifiers);

        // 5. Update the 'companies' table, setting the new default_tools value for the admin's company
        client = await createDbClient(); // Use centralized DB client
        await client.query(
            'UPDATE companies SET default_tools = $1 WHERE id = $2',
            [defaultsJson, companyId]
        );

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Company default tools updated successfully.' })
        };

    } catch (error) {
        console.error('Error in update-company-defaults:', error.message);
        // Return a generic 500 error for unexpected server issues, or 403 if it was an auth issue
        const statusCode = error.message.includes('Access denied') ? 403 : 500;
        return {
            statusCode: statusCode,
            body: JSON.stringify({ message: error.message || 'Failed to update company defaults.' })
        };
    } finally {
        if (client) {
            client.end(); // IMPORTANT: Use client.end() for direct client connections
        }
    }
};
