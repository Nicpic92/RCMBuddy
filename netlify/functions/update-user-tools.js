// netlify/functions/update-user-tools.js

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
                body: JSON.stringify({ message: 'Access denied. Admin role required to update user tools.' }),
            };
        }

        // Get the companyId from the authenticated user's JWT
        const companyId = requestingUser.companyId;

        // 3. Parse the incoming data from the frontend
        const { userIdToUpdate, toolIdentifiers } = JSON.parse(event.body);

        // Basic validation on the received data
        if (!userIdToUpdate || !Array.isArray(toolIdentifiers)) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request body. Required: userIdToUpdate, toolIdentifiers array.' }) };
        }

        // NEW: Connect to the database using the centralized utility
        client = await createDbClient();
        try {
            // 4. Start a database transaction for safety. All steps must succeed or none will.
            await client.query('BEGIN');

            // 5. CRITICAL SECURITY CHECK: Verify the user being updated belongs to the admin's own company.
            const userCheck = await client.query('SELECT id, role FROM users WHERE id = $1 AND company_id = $2', [userIdToUpdate, companyId]);
            if (userCheck.rows.length === 0) {
                // This prevents an admin from one company from editing users of another company
                await client.query('ROLLBACK');
                return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden. Cannot update a user from another company or user not found.' }) };
            }

            // Optional: Prevent admin from modifying other admins/superadmins, unless requesting user is superadmin
            const targetUserRole = userCheck.rows[0].role;
            if ((targetUserRole === 'admin' || targetUserRole === 'superadmin') && requestingUser.role !== 'superadmin') {
                 await client.query('ROLLBACK');
                 return { statusCode: 403, body: JSON.stringify({ message: 'Admins cannot modify other admin or superadmin tool assignments.' }) };
            }


            // 6. Clear all existing tool assignments for this user to ensure a fresh start
            await client.query('DELETE FROM user_tools WHERE user_id = $1', [userIdToUpdate]);

            // 7. If the admin assigned any tools, insert the new permissions
            if (toolIdentifiers && toolIdentifiers.length > 0) {
                // First, get the integer IDs for the tool identifiers (e.g., 'data-cleaner' -> 1)
                // Filter by tools that are global OR available to the admin's company via company_tools
                const toolIdsQuery = `
                    SELECT DISTINCT t.id FROM tools t
                    LEFT JOIN company_tools ct ON t.id = ct.tool_id
                    WHERE t.identifier = ANY($1::varchar[])
                    AND (t.is_global = TRUE OR ct.company_id = $2);
                `;
                const toolIdsResult = await client.query(toolIdsQuery, [toolIdentifiers, companyId]);

                // If any of the tool identifiers were invalid or not available to the company, they won't be in toolIdsResult
                if (toolIdsResult.rows.length > 0) {
                    const toolIds = toolIdsResult.rows.map(r => r.id);
                    // Prepare a query to insert all the new user-tool pairs at once
                    const insertValues = toolIds.map(toolId => `(${userIdToUpdate}, ${toolId})`).join(',');
                    await client.query(`INSERT INTO user_tools (user_id, tool_id) VALUES ${insertValues}`);
                }
            }

            // 8. If all steps succeeded, commit the transaction to save the changes
            await client.query('COMMIT');

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'User permissions updated successfully.' })
            };
        } catch (e) {
            // If any error occurred during the transaction, roll everything back
            if (client) await client.query('ROLLBACK'); // Ensure rollback if client exists
            throw e; // Re-throw the error to be caught by the outer catch block
        } finally {
            // Always release the database client
            if (client) client.end(); // IMPORTANT: Use client.end() for direct client connections
        }

    } catch (error) {
        console.error('Update user tools error:', error);
        // Use a more consistent error handling based on auth helper output
        const statusCode = error.message.includes('Access denied') || error.message.includes('Forbidden') ? 403 : 500;
        return {
            statusCode: statusCode,
            body: JSON.stringify({ message: error.message || 'Failed to update user tools.' })
        };
    }
};
