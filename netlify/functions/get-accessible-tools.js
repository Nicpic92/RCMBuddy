// netlify/functions/get-accessible-tools.js

// Import centralized utility functions (note the ../ for path from user-auth/ subdirectory)
const { createDbClient } = require('./db');
const auth = require('./auth');

exports.handler = async (event, context) => {
    // Ensure only GET requests are allowed
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' })
        };
    }

    // 1. Authenticate the user
    const authResult = auth.verifyToken(event);
    if (authResult.statusCode !== 200) {
        return authResult; // Return authentication error
    }
    const requestingUser = authResult.user; // Contains userId, companyId, role

    // No explicit role check beyond basic authentication is needed here,
    // as any authenticated user should be able to see *their* company's accessible tools.
    const companyId = requestingUser.companyId;

    let client; // Declare client outside try block for finally access
    try {
        // 2. Connect to the database using the centralized utility
        client = await createDbClient();

        // 3. Fetch all tools that are either global OR assigned to the user's company
        const result = await client.query(
            `SELECT DISTINCT t.identifier
             FROM tools t
             LEFT JOIN company_tools ct ON t.id = ct.tool_id
             WHERE t.is_global = TRUE OR ct.company_id = $1
             ORDER BY t.identifier ASC`, // Order for consistent results
            [companyId]
        );

        // Extract just the identifiers into an array
        const accessibleTools = result.rows.map(row => row.identifier);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Accessible tools retrieved successfully.',
                tools: accessibleTools // This array of identifiers is what the frontend expects
            }),
        };

    } catch (dbError) {
        console.error('Database error in get-accessible-tools:', dbError.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to retrieve accessible tools.', error: dbError.message })
        };
    } finally {
        if (client) {
            client.end(); // Ensure the database connection is closed
        }
    }
};
