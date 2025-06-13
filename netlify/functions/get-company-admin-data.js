// Full code for: netlify/functions/get-company-admin-data.js

const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// This is a helper function to securely check if the user is a real admin.
// It checks the token AND verifies the 'admin' role in the database.
const authenticateAdmin = async (authHeader) => {
    if (!authHeader) {
        throw new Error('Access denied. No token provided.');
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        throw new Error('Access denied. Token format is "Bearer [token]".');
    }
    
    // Verify the token is valid
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Connect to the DB to get the user's REAL role (most secure way)
    const client = await pool.connect();
    try {
        const { rows } = await client.query('SELECT role, company_id FROM users WHERE id = $1', [decoded.id]);
        if (rows.length === 0 || rows[0].role !== 'admin') {
            throw new Error('Forbidden. User is not an administrator.');
        }
        // If they are an admin, return their company ID for the next queries
        return { companyId: rows[0].company_id };
    } finally {
        client.release();
    }
};

exports.handler = async (event, context) => {
    // Only allow GET requests to this endpoint
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 1. First, run the security check. This will throw an error if the user is not a valid admin.
        const { companyId } = await authenticateAdmin(event.headers.authorization);
        
        const client = await pool.connect();

        try {
            // 2. If security passes, fetch all the necessary data in parallel for efficiency.
            
            // Query A: Get all users that belong to the admin's company
            const usersQuery = 'SELECT id, username, email FROM users WHERE company_id = $1 ORDER BY username';
            const usersPromise = client.query(usersQuery, [companyId]);

            // Query B: Get a list of all possible tools from the master 'tools' table
            const allToolsQuery = 'SELECT identifier, display_name FROM tools ORDER BY display_name';
            const allToolsPromise = client.query(allToolsQuery);

            // Query C: Get the company's currently saved default tool settings
            const defaultsQuery = 'SELECT default_tools FROM companies WHERE id = $1';
            const defaultsPromise = client.query(defaultsQuery, [companyId]);

            // Query D: Get the current tools for every single user in the admin's company
            const userToolsQuery = `
                SELECT ut.user_id, t.identifier
                FROM user_tools ut
                JOIN tools t ON ut.tool_id = t.id
                WHERE ut.user_id IN (SELECT id FROM users WHERE company_id = $1);
            `;
            const userToolsPromise = client.query(userToolsQuery, [companyId]);

            // Wait for all database queries to finish
            const [usersResult, allToolsResult, defaultsResult, userToolsResult] = await Promise.all([
                usersPromise,
                allToolsPromise,
                defaultsPromise,
                userToolsPromise
            ]);

            // 3. The data for user tools needs to be formatted into a map for easy lookup on the frontend
            const userToolMap = userToolsResult.rows.reduce((acc, row) => {
                const userId = row.user_id;
                if (!acc[userId]) {
                    acc[userId] = [];
                }
                acc[userId].push(row.identifier);
                return acc;
            }, {});

            // 4. Combine all the data into a single JSON object to send back to the admin.html page
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    users: usersResult.rows,
                    all_available_tools: allToolsResult.rows,
                    company_defaults: defaultsResult.rows[0]?.default_tools || [],
                    user_tool_map: userToolMap
                })
            };

        } finally {
            // IMPORTANT: Always release the database client back to the pool
            client.release();
        }

    } catch (error) {
        // If any error occurs (e.g., security check fails), log it and return a forbidden status
        console.error('Admin data fetch error:', error.message);
        return { 
            statusCode: 403, 
            body: JSON.stringify({ message: error.message || 'An internal error occurred.' }) 
        };
    }
};
