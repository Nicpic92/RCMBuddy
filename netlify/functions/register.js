// netlify/functions/register.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Initialize database connection pool.
// This is outside the handler to allow connection reuse across function invocations,
// which is efficient in a serverless environment.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Get connection string from Netlify Environment Variables
    ssl: {
        rejectUnauthorized: false // Required for Neon's default SSL setup
    }
});

/**
 * Netlify Function handler for user registration.
 * Expects a POST request with username, email, and password in the body.
 */
exports.handler = async (event, context) => {
    // Only allow POST requests for this endpoint
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed'
        };
    }

    let body;
    try {
        // Parse the request body. Netlify Functions provide body as a string.
        body = JSON.parse(event.body);
    } catch (error) {
        // Handle malformed JSON body
        console.error("Failed to parse request body:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid JSON body.' })
        };
    }

    const { username, email, password } = body;

    // Validate if all required fields are present
    if (!username || !email || !password) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'All fields (username, email, password) are required.' })
        };
    }

    try {
        // Generate a salt and hash the password.
        // bcryptjs is used for secure password storage.
        const salt = await bcrypt.genSalt(10); // 10 rounds is a good balance for security and performance
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert the new user into the 'users' table in the Neon database.
        // Using parameterized queries ($1, $2, $3) prevents SQL injection attacks.
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, passwordHash]
        );

        // Respond with success message and basic user info (excluding password hash)
        return {
            statusCode: 201, // 201 Created status for successful resource creation
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'User registered successfully!',
                user: {
                    id: result.rows[0].id,
                    username: result.rows[0].username,
                    email: result.rows[0].email
                }
            })
        };

    } catch (error) {
        // Log the full error for debugging in Netlify logs
        console.error('Registration error:', error);

        // Handle specific PostgreSQL error for unique constraint violation (e.g., username/email already exists)
        if (error.code === '23505') { // '23505' is the unique_violation error code in PostgreSQL
            return {
                statusCode: 409, // 409 Conflict status
                body: JSON.stringify({ message: 'Username or email already exists. Please choose another.' })
            };
        }

        // Catch any other server-side errors
        return {
            statusCode: 500, // 500 Internal Server Error
            body: JSON.stringify({ message: 'Server error during registration.' })
        };
    }
};
