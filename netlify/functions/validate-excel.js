// netlify/functions/validate-excel.js
const Busboy = require('busboy'); // For parsing multipart/form-data
const exceljs = require('exceljs'); // For reading and writing Excel files
const { Readable } = require('stream'); // Node.js stream utility

/**
 * Helper function to parse multipart/form-data from Netlify Function event.
 * Reused from clean-excel.js
 * @param {object} event - The Netlify Function event object.
 * @returns {Promise<{fields: object, files: object}>} - An object containing form fields and files.
 */
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: event.headers });
        const fields = {};
        const files = {};
        let fileBuffer = Buffer.from('');

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            file.on('data', (data) => {
                fileBuffer = Buffer.concat([fileBuffer, data]);
            });
            file.on('end', () => {
                files[fieldname] = {
                    filename,
                    encoding,
                    mimetype,
                    data: fileBuffer
                };
            });
        });

        busboy.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            resolve({ fields, files });
        });

        busboy.on('error', reject);

        const readableStream = new Readable();
        readableStream.push(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
        readableStream.push(null);

        readableStream.pipe(busboy);
    });
}

/**
 * Helper function to perform mock validation and generate a mock report.
 * In a real scenario, this would involve detailed logic to read the Excel
 * and apply validation rules based on 'options'.
 * @param {exceljs.Workbook} workbook - The ExcelJS workbook object.
 * @param {object} options - Validation options (e.g., requiredFields, dataTypeCheck).
 * @returns {object} - Mock validation summary and a mock report buffer.
 */
async function performMockValidation(workbook, options) {
    // In a real application, you would iterate through worksheets/rows/cells
    // and apply rules based on 'options'.
    // For now, we'll simulate results.

    const totalChecks = 10; // Example: 10 validation checks were run
    const failedChecks = Math.floor(Math.random() * 5) + 1; // Simulate 1 to 5 failures
    const passedChecks = totalChecks - failedChecks;

    // --- Generate a simple mock Excel validation report ---
    const reportWorkbook = new exceljs.Workbook();
    const reportSheet = reportWorkbook.addWorksheet('Validation Report');

    reportSheet.columns = [
        { header: 'Check Type', key: 'type', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Details', key: 'details', width: 50 }
    ];

    reportSheet.addRow({ type: 'Required Fields Check', status: failedChecks > 0 ? 'FAIL' : 'PASS', details: failedChecks > 0 ? `${failedChecks} empty required fields found.` : 'All required fields present.' });
    reportSheet.addRow({ type: 'Data Type Check', status: 'PASS', details: 'All data types are valid.' });
    reportSheet.addRow({ type: 'Value Range Check', status: 'PASS', details: 'All values within range.' });
    reportSheet.addRow({ type: 'Unique Values Check', status: 'PASS', details: 'No duplicates found.' });

    // Add a summary row
    reportSheet.addRow({}); // Empty row for spacing
    reportSheet.addRow({ type: 'Summary', status: '', details: '' });
    reportSheet.addRow({ type: 'Total Checks', status: totalChecks });
    reportSheet.addRow({ type: 'Passed Checks', status: passedChecks });
    reportSheet.addRow({ type: 'Failed Checks', status: failedChecks });

    const reportBuffer = await reportWorkbook.xlsx.writeBuffer();

    return {
        summary: { totalChecks, failedChecks, passedChecks },
        reportBuffer: reportBuffer
    };
}


/**
 * Netlify Function handler for Excel file validation.
 * Expects a POST request with multipart/form-data containing the Excel file and validation rules.
 */
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed'
        };
    }

    if (!event.headers['content-type'] || !event.headers['content-type'].includes('multipart/form-data')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Content-Type must be multipart/form-data' })
        };
    }

    try {
        const { fields, files } = await parseMultipartForm(event);
        const excelFile = files.excelFile; // 'excelFile' is the name attribute from the input type="file"

        if (!excelFile || !excelFile.data) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'No Excel file uploaded.' })
            };
        }

        // Load the uploaded Excel file (even if we're doing mock validation, we'd still load it)
        const workbook = new exceljs.Workbook();
        await workbook.xlsx.load(excelFile.data);

        // Perform validation based on options
        const { summary, reportBuffer } = await performMockValidation(workbook, fields);

        // Respond with the validation report (base64 encoded) and the summary
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Validation complete!',
                validationReportBase64: reportBuffer.toString('base64'), // Report as base64 string
                summary: summary,
                fileName: `validation_report_${excelFile.filename}` // Suggest a new file name
            })
        };

    } catch (error) {
        console.error('Error in validate-excel function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error processing validation.', error: error.message })
        };
    }
};
