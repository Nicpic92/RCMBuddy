// public/tools/validation-engine.js

// --- Global Variables to store parsed data and rules ---
let parsedExcelData = null; // Stores the parsed data from the main Excel file
let parsedDataDictionary = null; // Stores parsed data from the selected data dictionary (if any)
let validationRules = {}; // Stores validation rules extracted from the data dictionary
let analysisResults = {}; // Stores the results of the analysis for each sheet

// Store the selected main file (from server or local)
let selectedMainFileBlob = null;
let selectedMainFileName = null;


// --- Helper Functions (keep as is) ---
function showLoader() { /* ... */ }
function hideLoader() { /* ... */ }
function displayMessage(elementId, message, type = 'info') { /* ... */ }


// --- Authentication and Navigation (keep as is) ---
async function verifyToken() { /* ... */ }
function setupNavigation(userData) { /* ... */ }


// --- File Selection from Server (UPDATED for Data Dictionaries) ---

async function populateFileSelects() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    try {
        // --- Get general files (for main file selection) from OLD API ---
        const filesResponse = await fetch('/api/list-files', { // Still uses list-files for general files
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!filesResponse.ok) {
            console.error('Failed to fetch general files:', filesResponse.statusText);
            // Don't throw, as data dictionaries might still load
        }
        const filesResult = await filesResponse.json();
        const generalFiles = filesResult.files || [];


        // --- Get Data Dictionaries from NEW API ---
        const dictsResponse = await fetch('/api/list-data-dictionaries', { // NEW API for data dictionaries
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!dictsResponse.ok) {
            throw new Error(`Failed to fetch data dictionaries: ${dictsResponse.statusText}`);
        }
        const dictsResult = await dictsResponse.json();
        const dataDictionaries = dictsResult.dictionaries || []; // Access the 'dictionaries' key


        const mainFileSelect = document.getElementById('mainFileSelect');
        const dataDictionarySelect = document.getElementById('dataDictionarySelect');

        // Clear existing options
        mainFileSelect.innerHTML = '<option value="">-- Select a File --</option>';
        dataDictionarySelect.innerHTML = '<option value="">-- No Data Dictionary Selected --</option>';

        let hasMainFiles = false;
        let hasDataDictionaries = false;

        // Populate main file select (from generalFiles)
        generalFiles.forEach(file => {
            const optionMain = document.createElement('option');
            optionMain.value = file.id;
            optionMain.textContent = file.filename; // Uses 'filename' as returned by list-files.js
            mainFileSelect.appendChild(optionMain);
            hasMainFiles = true;
        });

        // Populate data dictionary select (from dataDictionaries)
        dataDictionaries.forEach(dict => {
            const optionDict = document.createElement('option');
            optionDict.value = dict.id;
            optionDict.textContent = dict.name; // Uses 'name' as returned by list-data-dictionaries.js
            dataDictionarySelect.appendChild(optionDict);
            hasDataDictionaries = true;
        });


        // Enable/disable selects and buttons based on fetched files
        if (!hasMainFiles) {
            mainFileSelect.innerHTML = '<option value="">No files uploaded yet.</option>';
            mainFileSelect.disabled = true;
            document.getElementById('loadMainFileBtn').disabled = true;
        } else {
            mainFileSelect.disabled = false;
            document.getElementById('loadMainFileBtn').disabled = false;
        }

        if (!hasDataDictionaries) {
            dataDictionarySelect.innerHTML = '<option value="">No data dictionaries uploaded.</option>';
            dataDictionarySelect.disabled = true;
            document.getElementById('loadDataDictionaryBtn').disabled = true;
        } else {
            dataDictionarySelect.disabled = false;
            document.getElementById('loadDataDictionaryBtn').disabled = false;
        }

    } catch (error) {
        console.error('Error populating file/dictionary selects:', error);
        displayMessage('dataDictionaryStatus', 'Error loading lists. Please try again.', 'error'); // Display error to user
    }
}

async function loadMainFile() {
    const selectedFileId = document.getElementById('mainFileSelect').value;
    if (!selectedFileId) {
        displayMessage('mainFileStatus', 'Please select a file to load.', 'error');
        selectedMainFileBlob = null;
        selectedMainFileName = null;
        return;
    }

    displayMessage('mainFileStatus', 'Loading selected file...', 'info');
    const token = localStorage.getItem('jwtToken');

    try {
        // This still uses the old get-file API for general files
        const response = await fetch(`/api/get-file?id=${selectedFileId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        selectedMainFileBlob = await response.blob(); // Store the file as a Blob
        selectedMainFileName = document.getElementById('mainFileSelect').options[document.getElementById('mainFileSelect').selectedIndex].text;
        displayMessage('mainFileStatus', `File loaded: ${selectedMainFileName}`, 'success');

        // Clear the local file input if a server file is loaded
        document.getElementById('excelFile').value = '';

    } catch (error) {
        console.error('Error fetching main file:', error);
        displayMessage('mainFileStatus', 'Failed to load file. Please try again.', 'error');
        selectedMainFileBlob = null;
        selectedMainFileName = null;
    }
}

/**
 * Loads the selected data dictionary's rules from the new API.
 */
async function loadDataDictionary() {
    const selectedDictId = document.getElementById('dataDictionarySelect').value;
    if (!selectedDictId) {
        displayMessage('dataDictionaryStatus', 'Please select a data dictionary.', 'error');
        parsedDataDictionary = null;
        validationRules = {};
        return;
    }

    displayMessage('dataDictionaryStatus', 'Loading data dictionary...', 'info');
    const token = localStorage.getItem('jwtToken');

    try {
        // Use the NEW get-data-dictionary API
        const response = await fetch(`/api/get-data-dictionary?id=${selectedDictId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const dictionaryContent = await response.json();
        // rules_json is now directly a JSON object from the new API, no base64 decoding needed!
        const rulesData = dictionaryContent.rules_json;

        if (rulesData && Array.isArray(rulesData)) {
            parsedDataDictionary = rulesData; // Store the raw rules array
            extractValidationRules(parsedDataDictionary); // Process rules
            displayMessage('dataDictionaryStatus', `Data dictionary loaded: ${document.getElementById('dataDictionarySelect').options[document.getElementById('dataDictionarySelect').selectedIndex].text}`, 'success');
        } else {
            displayMessage('dataDictionaryStatus', 'Data dictionary content is invalid or empty.', 'error');
            parsedDataDictionary = null;
            validationRules = {};
        }

    } catch (error) {
        console.error('Error fetching data dictionary:', error);
        displayMessage('dataDictionaryStatus', 'Failed to load data dictionary. Please try again.', 'error');
        parsedDataDictionary = null;
        validationRules = {};
    }
}

function extractValidationRules(dataDictionaryRules) {
    validationRules = {}; // Reset rules
    if (!dataDictionaryRules || dataDictionaryRules.length === 0) {
        console.warn("Data dictionary has no rules defined.");
        return;
    }

    dataDictionaryRules.forEach(rule => {
        const columnName = rule['Column Name'] ? String(rule['Column Name']).trim() : null;
        if (columnName) {
            if (!validationRules[columnName]) {
                validationRules[columnName] = [];
            }
            validationRules[columnName].push(rule);
        }
    });
    console.log("Extracted Validation Rules:", validationRules);
}

// --- Main File Analysis Logic (keep as is) ---
async function analyzeFile() { /* ... */ }
function displaySheetResults(sheetName, issues, header) { /* ... */ }
function generateSummaryReport() { /* ... */ }
function exportReportToExcel() { /* ... */ }


// --- Event Listeners and Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    const userData = await verifyToken();
    if (userData) {
        setupNavigation(userData);
        populateFileSelects(); // Call function to populate both dropdowns
    }

    document.getElementById('analyzeFileBtn').addEventListener('click', analyzeFile);
    document.getElementById('loadDataDictionaryBtn').addEventListener('click', loadDataDictionary);
    document.getElementById('loadMainFileBtn').addEventListener('click', loadMainFile);

    document.getElementById('excelFile').addEventListener('change', () => {
        document.getElementById('mainFileSelect').value = '';
        selectedMainFileBlob = null;
        selectedMainFileName = null;
        displayMessage('mainFileStatus', '', 'info');
    });

    document.getElementById('mainFileSelect').addEventListener('change', () => {
        document.getElementById('excelFile').value = '';
    });
});
