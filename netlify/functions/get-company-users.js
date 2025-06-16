// netlify/functions/get-company-users.js
const { Client } = require('pg');
const { requireAdmin } = require('../utils/auth');

exports.handler = async function(event) {
    try {
        // 1. Authenticate the user and ensure they are an admin
        const adminUser = requireAdmin(event);

        // 2. Get all users from the admin's company
        const client = new Client({
            connectionString: process.env.NEON_DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();

        const query = `
            SELECT id, username, email, role, created_at FROM users
            WHERE company_id = $1 ORDER BY created_at DESC
        `;
        const result = await client.query(query, [adminUser.companyId]);
        await client.end();

        return {
            statusCode: 200,
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        // The requireAdmin function throws errors with statusCode
        return {
            statusCode: error.statusCode || 500,
            body: JSON.stringify({ message: error.message || 'Server error.' }),
        };
    }
};
