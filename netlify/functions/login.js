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
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed'
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        console.error("Failed to parse request body:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid JSON body.' })
        };
    }

    const { identifier, password } = body; // Now expecting 'identifier'

    // Validate if required fields are present
    if (!identifier || !password) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Username/Email and password are required.' })
        };
    }

    try {
        // Find the user by either username OR email in the database
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $1', // Query by identifier in both columns
            [identifier]
        );
        const user = result.rows[0];

        // If no user is found with that identifier
        if (!user) {
            return {
                statusCode: 401, // 401 Unauthorized
                body: JSON.stringify({ message: 'Invalid credentials.' }) // Generic message for security
            };
        }

        // Compare the provided plain password with the stored hashed password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        // If passwords do not match
        if (!isMatch) {
            return {
                statusCode: 401, // 401 Unauthorized
                body: JSON.stringify({ message: 'Invalid credentials.' }) // Generic message for security
            };
        }

        // If login is successful, generate a JSON Web Token (JWT).
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            process.env.JWT_SECRET, // Get JWT secret from Netlify Environment Variables
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        // Respond with success message and the generated JWT
        return {
            statusCode: 200, // 200 OK
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: 'Login successful!', token: token })
        };

    } catch (error) {
        // Log the full error for debugging in Netlify logs
        console.error('Login error:', error);
        // Return a generic server error message
        return {
            statusCode: 500, // 500 Internal Server Error
            body: JSON.stringify({ message: 'Server error during login.' })
        };
    }
};
