// netlify/functions/register.js

// OLD: const { Client } = require('pg');
// OLD: const bcrypt = require('bcryptjs');

// NEW: Import centralized utility functions
const { createDbClient } = require('./utils/db');
const bcrypt = require('bcryptjs'); // bcryptjs is used directly here

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // You specified `company_name` in your input, but your document earlier mentioned
    // `companyName`, `companyCity`, `companyState`.
    // Assuming `company_name` is correct from your recent input for this update.
    const { username, email, password, company_name } = JSON.parse(event.body);

    if (!username || !email || !password || !company_name) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Username, email, password, and company name are required.' }) };
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    let client; // Declare client outside try block for finally access

    try {
        // NEW: Connect to the database using the centralized utility
        client = await createDbClient();
        // Start a transaction to ensure both operations succeed or fail together
        await client.query('BEGIN');

        // 1. Find or create the company and get its ID
        let companyResult = await client.query('SELECT id FROM companies WHERE name = $1', [company_name]);
        let companyId;

        if (companyResult.rows.length > 0) {
            companyId = companyResult.rows[0].id;
        } else {
            // If the company does not exist, insert it.
            // NOTE: Your SQL schema for 'companies' includes 'city' and 'state' columns.
            // The frontend form `index.html` (if using the one I provided) *does* collect `companyCity` and `companyState`.
            // If `company_name` is the only input field you provide for company info,
            // you might need to adjust your `companies` table schema or this INSERT statement.
            // For now, assuming only `name` is provided via this specific `register.js` input.
            companyResult = await client.query('INSERT INTO companies(name) VALUES($1) RETURNING id', [company_name]);
            companyId = companyResult.rows[0].id;
        }

        // 2. Insert the new user with the company_id
        // Your `users` table schema in the RCMBuddyInfo.txt lists `company_id` as INTEGER.
        // It does *not* list `company_name` as a column.
        // The `role` column should default to 'standard' if not provided explicitly in the insert.
        const userQuery = `
            INSERT INTO users (username, email, password_hash, company_id)
            VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, company_id; -- Return new user info
        `;
        const newUserResult = await client.query(userQuery, [username, email, password_hash, companyId]);

        // Commit the transaction
        await client.query('COMMIT');

        const newUser = newUserResult.rows[0];

        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'User registered successfully!',
                user: { // Return some user data for immediate frontend use
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role,
                    companyId: newUser.company_id
                }
            }),
        };
    } catch (error) {
        if (client) { // Ensure client exists before attempting rollback/end
            await client.query('ROLLBACK'); // Roll back on error
        }

        if (error.code === '23505') { // PostgreSQL unique violation error code
            return {
                statusCode: 409, // Conflict
                body: JSON.stringify({ message: 'Username or email already exists.' }),
            };
        }
        console.error('Database error:', error);
        return {
            statusCode: 500, // Internal Server Error
            body: JSON.stringify({ message: 'Could not register user. An unexpected error occurred.' }),
        };
    } finally {
        if (client) {
            client.end(); // Use client.end() for direct client connections
        }
    }
};
