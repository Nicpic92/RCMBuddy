// netlify/functions/upload-file.js

const Busboy = require('busboy'); // For parsing multipart/form-data
const { Readable } = require('stream'); // Node.js stream utility

// OLD: const jwt = require('jsonwebtoken');
// OLD: const { Pool } = require('pg');
// OLD: const pool = new Pool({ ... });

// NEW: Import centralized utility functions
const { createDbClient } = require('./db');
const auth = require('./auth');

/**
 * Helper to parse multipart/form-data from Netlify Function event.
 * @param {object} event - The Netlify Function event object.
 * @returns {Promise<{fields: object, files: object}>}
 */
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        // Ensure that event.headers and event.headers['content-type'] are valid before passing to Busboy
        if (!event.headers || !event.headers['content-type']) {
            return reject(new Error('Missing Content-Type header in multipart form data.'));
        }

        const busboy = Busboy({ headers: event.headers });
        const fields = {};
        const files = {};
        let fileBuffer = Buffer.from('');

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            file.on('data', (data) => { fileBuffer = Buffer.concat([fileBuffer, data]); });
            file.on('end', () => {
                files[fieldname] = { filename, encoding, mimetype, data: fileBuffer };
            });
        });
        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
        busboy.on('finish', () => { resolve({ fields, files }); });
        busboy.on('error', reject);

        // Convert event body to a readable stream
        const readableStream = new Readable();
        readableStream.push(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
        readableStream.push(null); // End the stream
        readableStream.pipe(busboy);
    });
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    // 1. Authenticate user using the auth utility
    const authResult = auth.verifyToken(event);
    if (authResult.statusCode !== 200) {
        return authResult; // Return authentication error response
    }
    const requestingUser = authResult.user; // Contains userId, companyId, role
    const user_id = requestingUser.userId;
    const company_id = requestingUser.companyId; // CRUCIAL for data isolation

    // 2. Parse file upload
    if (!event.headers['content-type'] || !event.headers['content-type'].includes('multipart/form-data')) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Content-Type must be multipart/form-data.' }) };
    }

    try {
        const { fields, files } = await parseMultipartForm(event);
        const uploadedFile = files.file; // 'file' is the name attribute from the input type="file"
        // Ensure isDataDictionary is parsed correctly as a boolean
        const isDataDictionary = fields.isDataDictionary === 'true';

        if (!uploadedFile || !uploadedFile.data) {
            return { statusCode: 400, body: JSON.stringify({ message: 'No file uploaded.' }) };
        }

        // --- Store file data directly in PostgreSQL (Neon) ---
        let client; // Declare client outside try block for finally access
        try {
            // NEW: Use the centralized createDbClient function
            client = await createDbClient();
            await client.query('BEGIN'); // Start transaction for atomicity

            // Insert file metadata AND binary data into company_files table
            const insertResult = await client.query(
                `INSERT INTO company_files (company_id, user_id, original_filename, mimetype, size_bytes, file_data, is_data_dictionary)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [company_id, user_id, uploadedFile.filename, uploadedFile.mimetype, uploadedFile.data.length, uploadedFile.data, isDataDictionary]
            );
            await client.query('COMMIT'); // Commit the transaction

            const newFileId = insertResult.rows[0].id;

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'File uploaded successfully to Neon!', fileId: newFileId, fileName: uploadedFile.filename })
            };

        } catch (dbError) {
            if (client) await client.query('ROLLBACK'); // Rollback on error
            console.error('Database error storing file:', dbError);
            return { statusCode: 500, body: JSON.stringify({ message: 'Failed to save file to database.', error: dbError.message }) };
        } finally {
            if (client) {
                client.end(); // IMPORTANT: Use client.end() for direct client connections
            }
        }

    } catch (error) {
        console.error('File upload function error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to upload file.', error: error.message }) };
    }
};
