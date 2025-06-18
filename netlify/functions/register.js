// netlify/functions/register.js (This is the assumed correct path based on your screenshot)

// NEW: Import centralized utility functions
// CORRECTED PATH: Go up two levels (from user-auth to functions) then down into utils
const { createDbClient } = require('./db'); 
const bcrypt = require('bcryptjs'); // bcryptjs is used directly here

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    const { username, email, password, company_name } = JSON.parse(event.body);

    if (!username || !email || !password || !company_name) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Username, email, password, and company name are required.' }) };
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    let client; 

    try {
        client = await createDbClient();
        await client.query('BEGIN');

        let companyResult = await client.query('SELECT id FROM companies WHERE name = $1', [company_name]);
        let companyId;

        if (companyResult.rows.length > 0) {
            companyId = companyResult.rows[0].id;
        } else {
            companyResult = await client.query('INSERT INTO companies(name) VALUES($1) RETURNING id', [company_name]);
            companyId = companyResult.rows[0].id;
        }

        const userQuery = `
            INSERT INTO users (username, email, password_hash, company_id)
            VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, company_id;
        `;
        const newUserResult = await client.query(userQuery, [username, email, password_hash, companyId]);

        await client.query('COMMIT');

        const newUser = newUserResult.rows[0];

        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'User registered successfully!',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    role: newUser.role,
                    companyId: newUser.company_id
                }
            }),
        };
    } catch (error) {
        if (client) { 
            await client.query('ROLLBACK');
        }

        if (error.code === '23505') { 
            return {
                statusCode: 409, 
                body: JSON.stringify({ message: 'Username or email already exists.' }),
            };
        }
        console.error('Database error:', error);
        return {
            statusCode: 500, 
            body: JSON.stringify({ message: 'Could not register user. An unexpected error occurred.' }),
        };
    } finally {
        if (client) {
            client.end();
        }
    }
};
