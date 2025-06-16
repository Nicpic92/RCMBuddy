// netlify/functions/protected.js

// OLD: const jwt = require('jsonwebtoken');
// OLD: const { Pool } = require('pg');
// OLD: const pool = new Pool({ ... });

// NEW: Import centralized utility functions
const { createDbClient } = require('./utils/db');
const auth = require('./utils/auth'); // This is your new centralized auth helper

exports.handler = async (event, context) => {
    try {
        if (event.httpMethod !== 'GET') {
            return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        // 1. Authenticate user using the centralized auth utility
        // This will handle token presence, format, verification, and expiration
        const authResult = auth.verifyToken(event);
        if (authResult.statusCode !== 200) {
            // If authentication fails (missing, invalid, or expired token),
            // auth.verifyToken already returns the appropriate error response.
            return authResult;
        }
        const requestingUser = authResult.user; // Contains userId, username, role, companyId from JWT

        // No explicit role check needed here as this endpoint is typically for *any* authenticated user
        // to get their data. If you only wanted admins to hit /api/protected, you'd add:
        // if (!auth.hasRole(requestingUser, 'admin')) {
        //     return { statusCode: 403, body: JSON.stringify({ message: 'Access denied.' }) };
        // }

        let client; // Declare client outside try block for finally access
        try {
            // 2. Connect to the database using the centralized utility
            client = await createDbClient();

            // 3. Fetch user details along with company name for the authenticated user
            const query = `
                SELECT u.id, u.username, u.email, u.role, u.company_id, c.name as company_name
                FROM users u
                JOIN companies c ON u.company_id = c.id
                WHERE u.id = $1;
            `;
            const { rows } = await client.query(query, [requestingUser.userId]); // Use userId from decoded JWT

            if (rows.length === 0) {
                // This scenario should ideally not happen if authResult.user is valid
                // but good to have a fallback if user was deleted after token issued.
                return { statusCode: 404, body: JSON.stringify({ message: 'User not found.' }) };
            }

            const userData = rows[0];

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: 'Access granted. User data retrieved.',
                    user: userData // Return comprehensive user data
                })
            };

        } catch (dbError) {
            console.error("Protected function DB error:", dbError);
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: "Database error retrieving user data.",
                    error_details: dbError.message,
                    // error_stack: dbError.stack // Keep stack in dev, remove in prod for security
                })
            };
        } finally {
            if (client) {
                client.end(); // IMPORTANT: Use client.end() for direct client connections
            }
        }

    } catch (generalError) {
        // This outer catch block will primarily catch errors not handled by auth.verifyToken,
        // or unexpected issues like JSON parsing errors if body were used.
        console.error("General error in protected function:", generalError);
        return {
            statusCode: 500, // Internal Server Error
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "An unexpected error occurred in the protected function.",
                error_details: generalError.message,
                // error_stack: generalError.stack // Keep stack in dev, remove in prod for security
            })
        };
    }
};
