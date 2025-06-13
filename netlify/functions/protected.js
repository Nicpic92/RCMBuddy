// netlify/functions/protected.js
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Access denied. No token provided.' }) };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Access denied. Token format is "Bearer [token]".' }) };
    }

    try {
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken.id; // Use ID from token for lookup

        // --- REPLACEMENT LOGIC: Query the DB for the most up-to-date user info and permissions ---
        const client = await pool.connect();
        try {
            const query = `
                SELECT
                    u.id,
                    u.username,
                    u.email,
                    u.role,
                    u.company_id,
                    c.name as company_name,
                    COALESCE(
                        (
                            SELECT json_agg(t.identifier)
                            FROM user_tools ut
                            JOIN tools t ON ut.tool_id = t.id
                            WHERE ut.user_id = u.id
                        ),
                        '[]'::json
                    ) AS accessible_tools
                FROM users u
                JOIN companies c ON u.company_id = c.id
                WHERE u.id = $1;
            `;
            const { rows } = await client.query(query, [userId]);
            
            if (rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ message: 'User not found.' }) };
            }

            const userData = rows[0];

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: 'Access granted.',
                    // Keep the nested 'user' object for frontend consistency
                    user: {
                        id: userData.id,
                        username: userData.username,
                        email: userData.email,
                        company_id: userData.company_id,
                        company_name: userData.company_name,
                        role: userData.role // <-- IMPORTANT: Add role
                    },
                    // Add the new list of tools the user can access
                    accessible_tools: userData.accessible_tools
                })
            };

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Token verification or data fetch error:', error.message);
        let errorMessage = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expired. Please log in again.';
        }
        return { statusCode: 403, body: JSON.stringify({ message: errorMessage }) };
    }
};
