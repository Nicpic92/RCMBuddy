// netlify/functions/lag-report-validation.js

console.log('lag-report-validation: Function script loaded.'); // NEW: Very early log
// Added this comment to trigger a fresh deploy. Please clear cache and deploy on Netlify.

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
    console.log('lag-report-validation: Handler invoked.'); // NEW: Log when handler starts

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    // Get the Authorization header from the incoming request
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        console.error('lag-report-validation: No Authorization header provided.'); // NEW LOG
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Access denied. No token provided.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    // Extract the token (assuming "Bearer TOKEN" format)
    const token = authHeader.split(' ')[1];
    if (!token) {
        console.error('lag-report-validation: Token missing after Bearer.'); // NEW LOG
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Access denied. Token format is "Bearer [token]".' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    console.log('lag-report-validation: Token extracted, attempting verification.'); // NEW LOG

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
        console.log('lag-report-validation: Token successfully verified.'); // NEW LOG

        if (!decoded.company_id) {
            console.error('lag-report-validation: Decoded token missing company_id.'); // NEW LOG
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Invalid token: Missing company_id' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        const companyId = decoded.company_id;
        console.log(`lag-report-validation: User (Company ID: ${companyId}) is attempting to perform Lag Report Validation.`);

    } catch (error) {
        console.error('lag-report-validation: JWT verification error:', error.message); // NEW LOG
        let errorMessage = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expired. Please log in again.';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Invalid token signature.';
        }
        return {
            statusCode: 401,
            body: JSON.stringify({ message: errorMessage }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    let claimsReportData, lagReportData, claimNumberHeader, checkNumberHeader;

    try {
        console.log('lag-report-validation: Parsing request body.'); // NEW LOG
        const body = JSON.parse(event.body);
        claimsReportData = body.claimsReport;
        lagReportData = body.lagReport;
        claimNumberHeader = body.claimNumberHeader;
        checkNumberHeader = body.checkNumberHeader;

        if (!claimsReportData || !lagReportData || !claimNumberHeader || !checkNumberHeader) {
            console.error('lag-report-validation: Missing required body fields.'); // NEW LOG
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: 'Missing one or more required fields (reports or headers).' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        console.log('lag-report-validation: All required fields present, starting data processing.'); // NEW LOG

        // Basic validation that data is array of arrays (from XLSX.utils.sheet_to_json({header:1}))
        if (!Array.isArray(claimsReportData) || claimsReportData.length === 0 ||
            !Array.isArray(lagReportData) || lagReportData.length === 0) {
            console.error('lag-report-validation: Invalid report data format in body.'); // NEW LOG
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
            console.error(`lag-report-validation: Claims Report missing header: ${claimNumberHeader}`); // NEW LOG
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: `"${claimNumberHeader}" header not found in Claims & Check Numbers Report.` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        if (checkNumIndex === -1) {
            console.error(`lag-report-validation: Claims Report missing header: ${checkNumberHeader}`); // NEW LOG
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: `"${checkNumberHeader}" header not found in Claims & Check Numbers Report.` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        if (lagClaimNumIndex === -1) {
            console.error(`lag-report-validation: Lag Report missing header: ${claimNumberHeader}`); // NEW LOG
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: `"${claimNumberHeader}" header not found in Lag Report.` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        console.log('lag-report-validation: Headers found and indices determined.'); // NEW LOG

        // Build a map of Claim Number to Check Number from the claims report
        const claimToCheckMap = new Map();
        for (let i = 1; i < claimsReportData.length; i++) {
            const row = claimsReportData[i];
            const claimNum = row[claimsClaimNumIndex];
            const checkNum = row[checkNumIndex];
            if (claimNum !== undefined && claimNum !== null && String(claimNum).trim() !== '') {
                claimToCheckMap.set(String(claimNum).trim(), checkNum);
            }
        }
        console.log(`lag-report-validation: Built claim-to-check map with ${claimToCheckMap.size} entries.`); // NEW LOG

        // Prepare the new merged lag report data
        const mergedLagReport = [];
        const newLagHeaders = [...lagHeaders];
        let newCheckNumberColIndex = newLagHeaders.indexOf('Check Number');
        if (newCheckNumberColIndex === -1) {
            newLagHeaders.push('Check Number');
            newCheckNumberColIndex = newLagHeaders.length - 1;
        }
        mergedLagReport.push(newLagHeaders);
        console.log('lag-report-validation: Preparing merged report structure.'); // NEW LOG


        // Process each row in the lag report
        for (let i = 1; i < lagReportData.length; i++) {
            const row = [...lagReportData[i]];
            const claimNum = row[lagClaimNumIndex];
            let checkNumToAdd = '';

            if (claimNum !== undefined && claimNum !== null && String(claimNum).trim() !== '') {
                const foundCheckNum = claimToCheckMap.get(String(claimNum).trim());
                if (foundCheckNum !== undefined) {
                    checkNumToAdd = foundCheckNum;
                }
            }

            while (row.length <= newCheckNumberColIndex) {
                row.push('');
            }
            row[newCheckNumberColIndex] = checkNumToAdd;
            mergedLagReport.push(row);
        }
        console.log(`lag-report-validation: Processed ${mergedLagReport.length - 1} data rows.`); // NEW LOG

        // Create a new Excel workbook using ExcelJS
        console.log('lag-report-validation: Creating Excel workbook with ExcelJS.'); // NEW LOG
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'RCM Buddy';
        workbook.lastModifiedBy = 'RCM Buddy';
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet('Validated Lag Report');
        worksheet.addRows(mergedLagReport);

        console.log('lag-report-validation: Writing Excel buffer.'); // NEW LOG
        const buffer = await workbook.xlsx.writeBuffer();
        const base64File = buffer.toString('base64');
        console.log('lag-report-validation: Excel buffer created successfully.'); // NEW LOG

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Lag Report Validated successfully.',
                fileData: base64File,
                filename: 'validated_lag_report.xlsx'
            }),
            headers: { 'Content-Type': 'application/json' },
        };

    } catch (error) {
        console.error('lag-report-validation: UNCAUGHT ERROR during data processing:', error); // NEW LOG
        // Return a generic 500 error to the client, but log the specific error on Netlify
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Internal Server Error during validation: ${error.message}` }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
