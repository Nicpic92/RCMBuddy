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
        // console.log("save-data-dictionary.js: Request body content:", JSON.stringify(requestBody, null, 2)); // Detailed log of request body (uncomment if needed)
    } catch (error) {
        console.error("save-data-dictionary.js: Invalid JSON body received:", error.message);
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body.' }) };
    }

    const { id, dictionaryName, rules, sourceHeaders } = requestBody; // 'id' will be present for updates

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
    // Critical: Explicitly stringify JSONB fields and use ::jsonb casts in query.
    // This ensures PostgreSQL receives valid JSON strings for JSONB columns.
    const rulesToSave = JSON.stringify(rules);
    const sourceHeadersToSave = sourceHeaders ? JSON.stringify(sourceHeaders) : null;

    let client;
    try {
        console.log("save-data-dictionary.js: Attempting to connect to DB pool.");
        client = await pool.connect();
        console.log("save-data-dictionary.js: Successfully connected to DB pool.");

        await client.query('BEGIN'); // Start transaction
        console.log("save-data-dictionary.js: Database transaction began.");

        let queryText;
        let queryValues;
        let actionMessage;
        let savedDictionaryId;

        if (id) {
            // Update existing data dictionary
            console.log(`save-data-dictionary.js: Attempting to UPDATE dictionary with ID: ${id}`);
            queryText = `
                UPDATE data_dictionaries
                SET name = $1, rules_json = $2::jsonb, source_headers_json = $3::jsonb, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4 AND company_id = $5 RETURNING id;
            `;
            queryValues = [dictionaryName, rulesToSave, sourceHeadersToSave, id, company_id];
            actionMessage = 'updated';

            // Verify if the update actually affected a row belonging to this company
            const updateResult = await client.query(queryText, queryValues);
            if (updateResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Data dictionary not found or not authorized to update.' })
                };
            }
            savedDictionaryId = id;

        } else {
            // Insert new data dictionary (UPSERT style to leverage unique constraint for company_id, name)
            console.log("save-data-dictionary.js: Attempting to INSERT new dictionary.");
            queryText = `
                INSERT INTO data_dictionaries (company_id, user_id, name, rules_json, source_headers_json)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
                ON CONFLICT (company_id, name) DO UPDATE SET
                    user_id = EXCLUDED.user_id, -- Keep user_id of the current updater if desired
                    rules_json = EXCLUDED.rules_json,
                    source_headers_json = EXCLUDED.source_headers_json,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id;
            `;
            queryValues = [company_id, user_id, dictionaryName, rulesToSave, sourceHeadersToSave];
            actionMessage = 'saved';

            const insertResult = await client.query(queryText, queryValues);
            savedDictionaryId = insertResult.rows[0].id;
        }

        await client.query('COMMIT'); // Commit the transaction
        console.log("save-data-dictionary.js: Database transaction committed successfully.");

        console.log(`save-data-dictionary.js: Data dictionary ${actionMessage} successfully. ID:`, savedDictionaryId);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Data dictionary ${actionMessage} successfully!`,
                dictionaryId: savedDictionaryId,
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

        // Handle specific PostgreSQL unique constraint violation error (for INSERT path)
        if (dbError.code === '23505') {
            console.warn("save-data-dictionary.js: Unique constraint violation detected (Error Code: 23505).");
            return { statusCode: 409, body: JSON.stringify({ message: 'A data dictionary with this name already exists for your company. Please choose a different name, or load and update the existing one.', error: dbError.message }) };
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
