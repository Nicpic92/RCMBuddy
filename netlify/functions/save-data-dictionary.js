// netlify/functions/save-data-dictionary.js
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Pool } = require('pg');      // PostgreSQL client

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon's SSL
});

exports.handler = async (event, context) => {
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
        // console.log("save-data-dictionary.js: Request body content:", JSON.stringify(requestBody, null, 2)); // Detailed log of request body (uncomment if needed)
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
    // sourceHeaders can be null or an empty array from the frontend, but if present, must be an array
    if (sourceHeaders !== null && sourceHeaders !== undefined && !Array.isArray(sourceHeaders)) {
        console.error("save-data-dictionary.js: Validation failed - sourceHeaders provided but not an array.");
        return { statusCode: 400, body: JSON.stringify({ message: 'Source headers must be an array or null.' }) };
    }
    console.log("save-data-dictionary.js: Input validation passed.");

    // --- Prepare data for database storage ---
    // Ensure rulesJson is a clean array (even if empty) and sourceHeadersJson is an array or null.
    // The pg driver should handle direct JS objects/arrays for JSONB.
    const rulesToSave = rules; 
    const sourceHeadersToSave = sourceHeaders || null; // Ensure null if not provided, or an array if provided

    // 4. Store data dictionary in the NEW 'data_dictionaries' table
    let client;
    try {
        console.log("save-data-dictionary.js: Attempting to connect to DB pool.");
        client = await pool.connect(); 
        console.log("save-data-dictionary.js: Successfully connected to DB pool.");

        await client.query('BEGIN'); // Start transaction
        console.log("save-data-dictionary.js: Database transaction began.");

        const queryText = `
            INSERT INTO data_dictionaries (company_id, user_id, name, rules_json, source_headers_json)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
        `;
        const queryValues = [company_id, user_id, dictionaryName, rulesToSave, sourceHeadersToSave];

        // --- IMPORTANT: Log the exact values that will be sent to the DB for rules_json and source_headers_json ---
        console.log("save-data-dictionary.js: Values for INSERT query:");
        console.log("  $1 (company_id):", queryValues[0]);
        console.log("  $2 (user_id):", queryValues[1]);
        console.log("  $3 (name):", queryValues[2]);
        // Use JSON.stringify to ensure it's a valid JSON string for logging, and truncate if very long
        console.log("  $4 (rules_json - logged as string):", JSON.stringify(queryValues[3]).substring(0, 500) + (JSON.stringify(queryValues[3]).length > 500 ? '...' : ''));
        console.log("  $5 (source_headers_json - logged as string):", JSON.stringify(queryValues[4]).substring(0, 500) + (JSON.stringify(queryValues[4]).length > 500 ? '...' : ''));
        // --- End of critical logging ---

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
        console.error('save-data-dictionary.js: Full dbError object (including internal fields):', JSON.stringify(dbError, Object.getOwnPropertyNames(dbError)));
        
        if (client) {
            console.warn("save-data-dictionary.js: Attempting to rollback database transaction.");
            await client.query('ROLLBACK');
        } else {
            console.warn("save-data-dictionary.js: No active database client to rollback (likely connection error occurred before transaction).");
        }
        
        console.error('save-data-dictionary.js: Specific error message from DB:', dbError.message);
        
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
