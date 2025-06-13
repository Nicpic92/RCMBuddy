// netlify/functions/lag-report-validation.js

const jwt = require('jsonwebtoken');
const { Pool } = require('pg'); // Included for general Netlify function context, not directly used in this merge logic
const ExcelJS = require('exceljs'); // Essential for Excel file manipulation

// Environment variables (set in Netlify UI)
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL; // For potential future DB interactions, though not directly for merging files

// Initialize PostgreSQL Pool (optional, for DB interaction, not strictly needed for this file merge)
const pool = new Pool({
    connectionString: DATABASE_URL,
});

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    // Authenticate user via JWT
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Access denied. No token provided.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Access denied. Token missing.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    let decoded;
    try {
        // FIX: Use 'jwtToken' consistency - the backend verifies the token, the key name in localStorage doesn't matter here.
        // It relies on JWT_SECRET from environment variables.
        decoded = jwt.verify(token, JWT_SECRET);
        // Ensure the token has company_id, which is crucial for data isolation in DB operations
        if (!decoded.company_id) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Invalid token: Missing company_id' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        // const userId = decoded.id; // Not used directly in this function but available
        const companyId = decoded.company_id; // Crucial for multi-tenancy if saving merged report
        console.log(`User (Company ID: ${companyId}) is attempting to perform Lag Report Validation.`);

    } catch (error) {
        console.error('JWT verification error in lag-report-validation:', error.message);
        let errorMessage = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expired. Please log in again.';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Invalid token signature.';
        }
        return {
            statusCode: 401, // Use 401 for authentication failures
            body: JSON.stringify({ message: errorMessage }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    let claimsReportData, lagReportData, claimNumberHeader, checkNumberHeader;

    try {
        const body = JSON.parse(event.body);
        claimsReportData = body.claimsReport;
        lagReportData = body.lagReport;
        claimNumberHeader = body.claimNumberHeader;
        checkNumberHeader = body.checkNumberHeader;

        if (!claimsReportData || !lagReportData || !claimNumberHeader || !checkNumberHeader) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: 'Missing one or more required fields (reports or headers).' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        // Basic validation that data is array of arrays (from XLSX.utils.sheet_to_json({header:1}))
        if (!Array.isArray(claimsReportData) || claimsReportData.length === 0 ||
            !Array.isArray(lagReportData) || lagReportData.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: 'Invalid report data format. Expected arrays.' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        // Extract headers (first row)
        const claimsHeaders = claimsReportData[0];
        const lagHeaders = lagReportData[0];

        // Find column indices
        const claimsClaimNumIndex = claimsHeaders.indexOf(claimNumberHeader);
        const checkNumIndex = claimsHeaders.indexOf(checkNumberHeader);
        const lagClaimNumIndex = lagHeaders.indexOf(claimNumberHeader);

        if (claimsClaimNumIndex === -1) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: `"${claimNumberHeader}" header not found in Claims & Check Numbers Report.` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        if (checkNumIndex === -1) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: `"${checkNumberHeader}" header not found in Claims & Check Numbers Report.` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        if (lagClaimNumIndex === -1) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: `"${claimNumberHeader}" header not found in Lag Report.` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }

        // Build a map of Claim Number to Check Number from the claims report
        const claimToCheckMap = new Map();
        for (let i = 1; i < claimsReportData.length; i++) { // Start from 1 to skip headers
            const row = claimsReportData[i];
            const claimNum = row[claimsClaimNumIndex];
            const checkNum = row[checkNumIndex];
            // Only add if claimNum is a valid non-empty string/number
            if (claimNum !== undefined && claimNum !== null && String(claimNum).trim() !== '') {
                claimToCheckMap.set(String(claimNum).trim(), checkNum);
            }
        }

        // Prepare the new merged lag report data
        const mergedLagReport = [];

        // Add original headers to the new report, plus the new "Check Number" header if it doesn't exist
        const newLagHeaders = [...lagHeaders];
        let newCheckNumberColIndex = newLagHeaders.indexOf('Check Number'); // Check if 'Check Number' already exists
        if (newCheckNumberColIndex === -1) {
            newLagHeaders.push('Check Number'); // Add new column if it doesn't exist
            newCheckNumberColIndex = newLagHeaders.length - 1; // Get its new index
        }
        mergedLagReport.push(newLagHeaders);


        // Process each row in the lag report
        for (let i = 1; i < lagReportData.length; i++) { // Start from 1 to skip headers
            const row = [...lagReportData[i]]; // Create a copy to modify
            const claimNum = row[lagClaimNumIndex];

            let checkNumToAdd = ''; // Default empty string if no match found

            if (claimNum !== undefined && claimNum !== null && String(claimNum).trim() !== '') {
                const foundCheckNum = claimToCheckMap.get(String(claimNum).trim());
                if (foundCheckNum !== undefined) {
                    checkNumToAdd = foundCheckNum;
                }
            }

            // Ensure the row has enough cells for the new column
            while (row.length <= newCheckNumberColIndex) {
                row.push(''); // Add empty cells if needed to reach the new column index
            }
            row[newCheckNumberColIndex] = checkNumToAdd; // Place the check number

            mergedLagReport.push(row);
        }

        // Create a new Excel workbook using ExcelJS
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'RCM Buddy';
        workbook.lastModifiedBy = 'RCM Buddy';
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet('Validated Lag Report'); // FIX: Sheet name
        worksheet.addRows(mergedLagReport);

        // Generate a buffer from the workbook
        const buffer = await workbook.xlsx.writeBuffer();
        const base64File = buffer.toString('base64');

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Lag Report Validated successfully.', // FIX: Message
                fileData: base64File,
                filename: 'validated_lag_report.xlsx' // FIX: Filename
            }),
            headers: { 'Content-Type': 'application/json' },
        };

    } catch (error) {
        console.error('Error in lag-report-validation function:', error); // FIX: Log message
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Internal Server Error during validation: ${error.message}` }), // FIX: Error message
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
