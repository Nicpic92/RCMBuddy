// netlify/functions/save-data-dictionary.js
// --- ADD THESE LOGS AT THE VERY TOP ---
console.log("FUNCTION START: save-data-dictionary.js is starting to load.");
console.log("ENV VAR DEBUG: DATABASE_URL is set:", !!process.env.DATABASE_URL); // Check if value exists
console.log("ENV VAR DEBUG: JWT_SECRET is set:", !!process.env.JWT_SECRET); // Check if value exists

// --- ADD A TRY/CATCH AROUND GLOBAL INITIALIZATION ---
let pool;
try {
    const jwt = require('jsonwebtoken'); // For JWT authentication
    const { Pool } = require('pg');     // PostgreSQL client
    console.log("DEPENDENCIES LOADED: jsonwebtoken and pg are required.");

    // Initialize PostgreSQL pool
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Neon's SSL
    });
    console.log("POSTGRES POOL INITIALIZED.");

    // This is the export - it should be assigned after successful initialization
    exports.handler = async (event, context) => {
        console.log("HANDLER INVOKED: save-data-dictionary.handler is running."); // This should now appear in logs

        // --- Your existing function logic starts here ---
        // ... (rest of your save-data-dictionary.js code) ...
        // --- End of your existing function logic ---
    };
    console.log("HANDLER EXPORTED: exports.handler has been assigned.");

} catch (initError) {
    console.error("INITIALIZATION ERROR: An error occurred during function initialization.", initError);
    // If initialization fails, we might not be able to export the handler.
    // We'll set a dummy handler to log the error if invoked, though Netlify's Runtime.HandlerNotFound will likely fire first.
    exports.handler = async (event, context) => {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Function initialization failed. Check Netlify logs for details.", error: initError.message }),
        };
    };
}
