// public/tools/lag-report-validation/lag-report-validation.js

// --- Global Elements ---
const messageBox = document.getElementById('messageBox');
const buttonText = document.getElementById('buttonText');
const loadingSpinner = document.getElementById('loadingSpinner');
const displayDashboardButton = document.getElementById('displayDashboardButton');
const lagReportFile = document.getElementById('lagReportFile');
const dashboardDisplayArea = document.getElementById('dashboardDisplayArea');
const lagReportTable = document.getElementById('lagReportTable');
const rowCountElement = document.getElementById('rowCount');

// --- Helper Functions (specific to this page) ---

/**
 * Displays messages in a dedicated box on the UI.
 * @param {string} message - The message text.
 * @param {'info' | 'success' | 'error'} type - The type of message (influences styling).
 */
function displayMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`; // Add classes for styling
    messageBox.classList.remove('hidden'); // Show the box
}

/**
 * Hides the message box.
 */
function hideMessage() {
    messageBox.classList.add('hidden');
}

/**
 * Shows/hides the loading spinner and disables/enables the button.
 * @param {boolean} isLoading - True to show loader, false to hide.
 */
function setLoading(isLoading) {
    if (isLoading) {
        buttonText.textContent = 'Processing...';
        loadingSpinner.classList.remove('hidden');
        displayDashboardButton.disabled = true;
    } else {
        buttonText.textContent = 'Display Dashboard';
        loadingSpinner.classList.add('hidden');
        displayDashboardButton.disabled = false;
    }
}

/**
 * Reads an Excel/CSV file and displays its contents in the dashboard table.
 * @param {File} file - The Excel/CSV file to read.
 * @returns {Promise<void>} Resolves when done, rejects on error.
 */
function readFileAndDisplay(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0]; // Assume first sheet is the main data
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to array of arrays (raw data for table), skipping empty rows
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Filter out entirely empty rows after conversion (common with sheet_to_json)
                const filteredJsonData = jsonData.filter(row => row.some(cell => cell !== null && String(cell).trim() !== ''));

                if (filteredJsonData.length === 0) {
                    reject('File is empty or contains no readable data after filtering.');
                    return;
                }

                const headers = filteredJsonData[0]; // First row is headers
                const rows = filteredJsonData.slice(1); // Remaining rows are data

                const tableHeadRow = lagReportTable.querySelector('thead tr');
                const tableBody = lagReportTable.querySelector('tbody');

                tableHeadRow.innerHTML = ''; // Clear old headers
                tableBody.innerHTML = ''; // Clear old data

                // Populate headers
                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    tableHeadRow.appendChild(th);
                });

                // Populate data rows
                rows.forEach(rowData => {
                    const tr = document.createElement('tr');
                    headers.forEach((header, colIndex) => { // Use headers for consistent column order
                        const td = document.createElement('td');
                        // Ensure we access the cell data by index matching the header order
                        td.textContent = rowData[colIndex] !== undefined && rowData[colIndex] !== null ? String(rowData[colIndex]) : '';
                        tr.appendChild(td);
                    });
                    tableBody.appendChild(tr);
                });

                dashboardDisplayArea.classList.remove('hidden'); // Show the dashboard area
                rowCountElement.textContent = `Displaying ${rows.length} rows.`;
                resolve();

            } catch (error) {
                reject('Error parsing file: ' + error.message);
            }
        };
        reader.onerror = (error) => {
            reject('FileReader error: ' + error.message);
        };
        reader.readAsArrayBuffer(file);
    });
}

// --- Event Listeners ---

// Main button click handler
displayDashboardButton.addEventListener('click', async () => {
    hideMessage(); // Clear previous messages
    setLoading(true); // Show loading spinner
    dashboardDisplayArea.classList.add('hidden'); // Hide previous dashboard

    const file = lagReportFile.files[0];

    if (!file) {
        displayMessage('Please select a Lag Detail Report to display.', 'error');
        setLoading(false);
        return;
    }

    try {
        await readFileAndDisplay(file);
        displayMessage('Lag Report loaded and displayed successfully!', 'success');
    } catch (error) {
        console.error('Error displaying dashboard:', error);
        displayMessage(`Error displaying dashboard: ${error}`, 'error');
    } finally {
        setLoading(false); // Hide loading spinner
    }
});
