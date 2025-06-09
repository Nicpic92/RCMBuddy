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
        console.log("save-data-dictionary.js: Request body content:", JSON.stringify(requestBody, null, 2)); // Detailed log of request body
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
        console.log("save-data-dictionary.js: Successfully connected to DB pool. Starting transaction.");
        await client.query('BEGIN'); // Start transaction

        let queryText;
        let queryValues;
        let actionMessage;
        let savedDictionaryId;

        // NEW LOGIC: Explicitly check for existence and then UPDATE or INSERT
        if (id) {
            // Case 1: 'id' is provided, attempt to update an existing dictionary
            console.log(`save-data-dictionary.js: Attempting to UPDATE dictionary with ID: ${id}`);
            queryText = `
                UPDATE data_dictionaries
                SET name = $1, rules_json = $2::jsonb, source_headers_json = $3::jsonb, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4 AND company_id = $5 RETURNING id;
            `;
            queryValues = [dictionaryName, rulesToSave, sourceHeadersToSave, id, company_id];
            actionMessage = 'updated';

            console.log("save-data-dictionary.js: UPDATE Query text:", queryText.replace(/\s+/g, ' ').trim());
            console.log("save-data-dictionary.js: UPDATE Query values:", queryValues);

            const updateResult = await client.query(queryText, queryValues);
            if (updateResult.rowCount === 0) {
                console.warn("save-data-dictionary.js: Update failed: Data dictionary not found or not authorized for ID:", id);
                await client.query('ROLLBACK');
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Data dictionary not found or not authorized to update.' })
                };
            }
            savedDictionaryId = id;
            console.log("save-data-dictionary.js: Dictionary updated successfully. Affected rows:", updateResult.rowCount);

        } else {
            // Case 2: No 'id' provided, check if a dictionary with this name already exists for the company
            console.log("save-data-dictionary.js: No ID provided. Checking for existing dictionary by name/company...");
            const checkExistingQuery = `
                SELECT id FROM data_dictionaries
                WHERE name = $1 AND company_id = $2;
            `;
            const checkResult = await client.query(checkExistingQuery, [dictionaryName, company_id]);

            if (checkResult.rows.length > 0) {
                // Case 2a: Dictionary with this name already exists for this company, perform an UPDATE
                savedDictionaryId = checkResult.rows[0].id;
                console.log(`save-data-dictionary.js: Dictionary with name "${dictionaryName}" already exists (ID: ${savedDictionaryId}). Performing UPDATE.`);
                queryText = `
                    UPDATE data_dictionaries
                    SET user_id = $1, rules_json = $2::jsonb, source_headers_json = $3::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4 AND company_id = $5 RETURNING id;
                `;
                queryValues = [user_id, rulesToSave, sourceHeadersToSave, savedDictionaryId, company_id];
                actionMessage = 'updated';

                console.log("save-data-dictionary.js: UPDATE (found by name) Query text:", queryText.replace(/\s+/g, ' ').trim());
                console.log("save-data-dictionary.js: UPDATE (found by name) Query values:", queryValues);

                const updateResult = await client.query(queryText, queryValues);
                // No need to check rowCount, as we just confirmed existence
                console.log("save-data-dictionary.js: Dictionary updated successfully by name. Affected rows:", updateResult.rowCount);

            } else {
                // Case 2b: Dictionary does not exist, perform an INSERT
                console.log(`save-data-dictionary.js: Dictionary with name "${dictionaryName}" does not exist. Performing INSERT.`);
                queryText = `
                    INSERT INTO data_dictionaries (company_id, user_id, name, rules_json, source_headers_json)
                    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb) RETURNING id;
                `;
                queryValues = [company_id, user_id, dictionaryName, rulesToSave, sourceHeadersToSave];
                actionMessage = 'saved';

                console.log("save-data-dictionary.js: INSERT Query text:", queryText.replace(/\s+/g, ' ').trim());
                console.log("save-data-dictionary.js: INSERT Query values:", queryValues);

                const insertResult = await client.query(queryText, queryValues);
                savedDictionaryId = insertResult.rows[0].id;
                console.log("save-data-dictionary.js: New dictionary inserted successfully. New ID:", savedDictionaryId);
            }
        }

        await client.query('COMMIT'); // Commit the transaction
        console.log("save-data-dictionary.js: Database transaction committed successfully.");

        console.log(`save-data-dictionary.js: Data dictionary ${actionMessage} successfully. Final ID:`, savedDictionaryId);

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
        console.error('save-data-dictionary.js: DB Error Code:', dbError.code); // Log error code

        // This specific error handling for 23505 (unique violation) is now less likely with the new logic,
        // but kept as a fallback for potential edge cases or other unique constraints.
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
