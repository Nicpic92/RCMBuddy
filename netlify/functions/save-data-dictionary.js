// netlify/functions/save-data-dictionary.js
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Pool } = require('pg');      // PostgreSQL client

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon's SSL
});

exports.handler = async (event, context) => {
    // --- Start of detailed logging ---
    console.log("save-data-dictionary.js: Function started.");

    if (event.httpMethod !== 'POST') {
        console.warn("save-data-dictionary.js: Method not allowed - received", event.httpMethod);
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // 1. Authenticate user and get company_id
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        console.error("save-data-dictionary.js: Authentication required - No Authorization header.");
        return { statusCode: 401, body: JSON.stringify({ message: 'Authentication required.' }) };
    }
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("save-data-dictionary.js: JWT decoded successfully for user ID:", decoded.id, "Company ID:", decoded.company_id);
    } catch (error) {
        console.error("save-data-dictionary.js: JWT verification failed:", error.message);
        return { statusCode: 403, body: JSON.stringify({ message: 'Invalid or expired token.' }) };
    }
    const user_id = decoded.id;
    const company_id = decoded.company_id; // CRUCIAL for data isolation

    // 2. Parse request body
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
        console.log("save-data-dictionary.js: Request body parsed successfully.");
        // console.log("save-data-dictionary.js: Request body content:", JSON.stringify(requestBody, null, 2)); // Log full body (careful with sensitive data)
    } catch (error) {
        console.error("save-data-dictionary.js: Invalid JSON body received:", error.message);
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }

    const { dictionaryName, rules, sourceHeaders } = requestBody;

    // 3. Validate input data
    if (!dictionaryName || dictionaryName.trim() === '') {
        console.error("save-data-dictionary.js: Validation failed - dictionaryName is empty or missing.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Data dictionary name is required.' }) };
    }
    if (!rules || !Array.isArray(rules)) {
        console.error("save-data-dictionary.js: Validation failed - rules is not an array or missing.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Rules data must be an array.' }) };
    }
    if (sourceHeaders && !Array.isArray(sourceHeaders)) {
        console.error("save-data-dictionary.js: Validation failed - sourceHeaders provided but not an array.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Source headers must be an array.' }) };
    }
    console.log("save-data-dictionary.js: Input validation passed.");

    // Prepare data for database storage
    const rulesJson = rules;
    const sourceHeadersJson = sourceHeaders || null; // Store null if not provided

    // 4. Store data dictionary in the NEW 'data_dictionaries' table
    let client;
    try {
        console.log("save-data-dictionary.js: Attempting to connect to DB pool.");
        // --- IMPORTANT: This pool.connect() call can throw an error if DATABASE_URL is bad or DB is unreachable ---
        client = await pool.connect(); 
        console.log("save-data-dictionary.js: Successfully connected to DB pool.");

        await client.query('BEGIN'); // Start transaction for atomicity
        console.log("save-data-dictionary.js: Database transaction began.");

        const queryText = `
            INSERT INTO data_dictionaries (company_id, user_id, name, rules_json, source_headers_json)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
        `;
        const queryValues = [company_id, user_id, dictionaryName, rulesJson, sourceHeadersJson];
        console.log("save-data-dictionary.js: Executing INSERT query with values:", queryValues.map(v => typeof v === 'object' ? JSON.stringify(v).substring(0, 50) + '...' : v)); // Log values for debug

        const insertResult = await client.query(queryText, queryValues);
        await client.query('COMMIT'); // Commit the transaction
        console.log("save-data-dictionary.js: Database transaction committed successfully.");

        const newDictionaryId = insertResult.rows[0].id;
        console.log("save-data-dictionary.js: Data dictionary saved successfully. New ID:", newDictionaryId);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Data dictionary saved successfully!',
                dictionaryId: newDictionaryId,
                dictionaryName: dictionaryName
            })
        };

    } catch (dbError) {
        console.error("save-data-dictionary.js: An error occurred during database operation or connection.");
        // Log the full error object for detailed debugging information
        console.error('save-data-dictionary.js: Full dbError object:', JSON.stringify(dbError, Object.getOwnPropertyNames(dbError)));
        
        if (client) {
            console.warn("save-data-dictionary.js: Attempting to rollback database transaction.");
            await client.query('ROLLBACK'); // Rollback on error
        } else {
            console.warn("save-data-dictionary.js: No active database client to rollback (likely connection error).");
        }
        
        console.error('save-data-dictionary.js: Specific error message:', dbError.message);
        
        // Handle specific PostgreSQL unique constraint violation error
        if (dbError.code === '23505') { 
            console.warn("save-data-dictionary.js: Unique constraint violation detected (Error Code: 23505).");
            return { statusCode: 409, body: JSON.stringify({ message: 'A data dictionary with this name already exists for your company. Please choose a different name.', error: dbError.message }) };
        }
        
        // Generic 500 error for all other database-related issues
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to save data dictionary to database.', error: dbError.message }) };
    } finally {
        if (client) {
            console.log("save-data-dictionary.js: Releasing DB client back to pool.");
            client.release(); 
        } else {
            console.log("save-data-dictionary.js: No DB client to release (was not connected or already released).");
        }
    }
};
