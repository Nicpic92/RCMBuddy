// netlify/functions/get-company-admin-data.js

// OLD: const { Pool } = require('pg');
// OLD: const jwt = require('jsonwebtoken');

// NEW: Import centralized utility functions
const { createDbClient } = require('./db');
const auth = require('./auth');

// OLD: Removed authenticateAdmin helper, replaced by auth.verifyToken and auth.hasRole

exports.handler = async (event, context) => {
    // We only allow GET requests to this endpoint.
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // NEW: Centralized authentication and authorization
    const authResult = auth.verifyToken(event);
    if (authResult.statusCode !== 200) {
        return authResult; // Return authentication error
    }
    const requestingUser = authResult.user;

    // Check for admin role (or superadmin, as hasRole('admin') covers both)
    if (!auth.hasRole(requestingUser, 'admin')) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Access denied. Admin role required.' }),
        };
    }

    // The companyId is now directly from the authenticated user's JWT
    const companyId = requestingUser.companyId;

    let client; // Declare client outside try block for finally access
    try {
        // NEW: Connect to the database using the centralized utility
        client = await createDbClient();

        // Step 2: Fetch all necessary data from the database for that company.
        // We run all our queries in parallel for better performance.
        const [usersRes, toolsRes, companyRes, userToolsRes] = await Promise.all([
            // Get all users in the company
            client.query('SELECT id, username, email FROM users WHERE company_id = $1 ORDER BY username', [companyId]),
            // Get all available tools (assuming tools are global or accessible via company_tools)
            // Modified to reflect previous discussions about is_global and company_tools table
            client.query(`
                SELECT
                    t.id, t.name, t.description, t.is_global,
                    COALESCE(t.identifier, t.name) AS identifier,
                    COALESCE(t.display_name, t.name) AS display_name
                FROM tools t
                LEFT JOIN company_tools ct ON t.id = ct.tool_id
                WHERE t.is_global = TRUE OR ct.company_id = $1
                ORDER BY display_name
            `, [companyId]),
            // Get the company's default tool settings
            client.query('SELECT default_tools FROM companies WHERE id = $1', [companyId]),
            // Get all tool assignments for every user in the company
            client.query(`
                SELECT ut.user_id, t.identifier
                FROM user_tools ut
                JOIN tools t ON ut.tool_id = t.id
                WHERE ut.user_id IN (SELECT id FROM users WHERE company_id = $1)
            `, [companyId])
        ]);

        // Step 3: Format the data for the front-end.

        // Create a map of { userId: ['tool1', 'tool2'] }
        const userToolMap = userToolsRes.rows.reduce((acc, row) => {
            if (!acc[row.user_id]) {
                acc[row.user_id] = [];
            }
            acc[row.user_id].push(row.identifier);
            return acc;
        }, {});

        const responsePayload = {
            message: 'Admin data retrieved successfully.',
            users: usersRes.rows,
            all_available_tools: toolsRes.rows, // Renamed from 'tools' for clarity
            company_defaults: companyRes.rows[0]?.default_tools || [],
            user_tool_map: userToolMap
        };

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(responsePayload)
        };

    } catch (error) {
        console.error('Error in get-company-admin-data:', error.message);
        // Use a more generic 500 error if it's not an authentication/authorization error
        return {
            statusCode: 500, // Changed to 500 for general errors
            body: JSON.stringify({ message: 'Failed to retrieve admin data.', error: error.message })
        };
    } finally {
        // This is critical to prevent running out of database connections.
        if (client) client.end(); // Use client.end() for direct client connections
    }
};
