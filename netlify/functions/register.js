// netlify/functions/register.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

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

    const { username, email, password, company_name } = body; // Now expecting company_name from frontend

    if (!username || !email || !password || !company_name) {
        return { statusCode: 400, body: JSON.stringify({ message: 'All fields (username, email, password, company name) are required.' }) };
    }

    let client; // Declare client outside try block for finally block access
    try {
        client = await pool.connect(); // Get a client from the pool to use for a transaction
        await client.query('BEGIN'); // Start a transaction for atomicity

        // 1. Check if the company already exists
        let companyId;
        const companyResult = await client.query('SELECT id FROM companies WHERE name = $1', [company_name]);

        if (companyResult.rows.length > 0) {
            // Company found, use its existing ID
            companyId = companyResult.rows[0].id;
        } else {
            // Company not found, create a new one
            const newCompanyResult = await client.query(
                'INSERT INTO companies (name) VALUES ($1) RETURNING id',
                [company_name]
            );
            companyId = newCompanyResult.rows[0].id; // Get the ID of the newly created company
        }

        // 2. Hash the user's password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Store the user in the database, linking them to the company
        const userResult = await client.query(
            'INSERT INTO users (username, email, password_hash, company_id) VALUES ($1, $2, $3, $4) RETURNING id, username, email',
            [username, email, passwordHash, companyId]
        );

        await client.query('COMMIT'); // Commit the transaction if all operations succeed

        return {
            statusCode: 201, // 201 Created status for successful resource creation
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'User registered successfully!',
                user: { id: userResult.rows[0].id, username: userResult.rows[0].username, email: userResult.rows[0].email },
                company_id: companyId,
                company_name: company_name
            })
        };

    } catch (error) {
        if (client) await client.query('ROLLBACK'); // Rollback the transaction on any error
        if (error.code === '23505') { // PostgreSQL unique violation error code
            return { statusCode: 409, body: JSON.stringify({ message: 'Username or email already exists.' }) };
        }
        console.error('Registration error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Server error during registration.' }) };
    } finally {
        if (client) client.release(); // Always release the client back to the pool
    }
};
