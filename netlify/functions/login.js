// netlify/functions/login.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize database connection pool (reused across invocations)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

/**
 * Netlify Function handler for user login.
 * Expects a POST request with 'identifier' (username or email) and 'password' in the body.
 */
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        console.error("Failed to parse request body:", error);
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }

    const { identifier, password } = body;

    if (!identifier || !password) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Username/Email and password are required.' }) };
    }

    try {
        // Find the user by either username OR email, and also fetch company name
        // We join with the 'companies' table to get the company name for the JWT
        const result = await pool.query(
            `SELECT u.*, c.name as company_name
             FROM users u
             JOIN companies c ON u.company_id = c.id
             WHERE u.email = $1 OR u.username = $1`, // Query by identifier in both columns
            [identifier]
        );
        const user = result.rows[0];

        if (!user) {
            return { statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials.' }) };
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return { statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials.' }) };
        }

        // Generate JWT with user details, company_id, and company_name in payload
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                company_id: user.company_id,      // Include company_id in JWT
                company_name: user.company_name   // Include company_name in JWT
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'Login successful!',
                token: token
            })
        };

    } catch (error) {
        console.error('Login error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Server error during login.' }) };
    }
};
