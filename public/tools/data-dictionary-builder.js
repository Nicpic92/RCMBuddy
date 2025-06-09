// public/tools/data-dictionary-builder.js

// --- Global Variables ---
let currentHeaders = [];
let currentDictionaryId = null;
let uploadedOriginalFileName = null;
let existingDataDictionaryColumns = new Set();


// --- Helper Functions (reused and adapted) ---
function showLoader(targetLoaderId = 'initialLoader') { /* ... */ }
function hideLoader(targetLoaderId = 'initialLoader') { /* ... */ }
function displayMessage(elementId, message, type = 'info') { /* ... */ }

// --- Authentication and Navigation (reused) ---
async function verifyToken() { /* ... */ }
function setupNavigation(userData) { /* ... */ }

// --- Initial Setup: Populate Existing Dictionaries Dropdown & Load Existing Rules ---
async function populateExistingDictionariesDropdown() { /* ... */ }
async function loadExistingDataDictionaryRules() { /* ... */ }

async function loadDictionaryForEditing() {
    const selectedDictId = document.getElementById('existingDictionarySelect').value;
    if (!selectedDictId) {
        displayMessage('existingDictStatus', 'Please select a dictionary from the list.', 'error');
        return;
    }

    showLoader('initialLoader');
    displayMessage('existingDictStatus', 'Loading dictionary for editing...', 'info');

    const token = localStorage.getItem('jwtToken');
    try {
        const response = await fetch(`/api/get-data-dictionary?id=${selectedDictId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to load dictionary: ${response.statusText}`);
        }
        const dictionary = await response.json();

        console.log("loadDictionaryForEditing: Received dictionary data:", dictionary);
        console.log("loadDictionaryForEditing: dictionary.source_headers_json:", dictionary.source_headers_json);
        console.log("loadDictionaryForEditing: dictionary.rules_json:", dictionary.rules_json);

        currentDictionaryId = dictionary.id;
        document.getElementById('dictionaryName').value = dictionary.name;

        currentHeaders = dictionary.source_headers_json || []; 
        const rulesToPreFill = dictionary.rules_json || [];

        if (currentHeaders.length === 0) {
            console.warn("loadDictionaryForEditing: No source headers found in the loaded dictionary. This dictionary might not have been created from a file with headers.");
            displayMessage('existingDictStatus', 'Dictionary loaded, but no source headers found to build table. Consider uploading a new file to get headers, or editing an existing dictionary that has source headers.', 'info');
        }
        if (rulesToPreFill.length === 0) {
             console.warn("loadDictionaryForEditing: No rules found in the loaded dictionary.");
        }


        renderHeadersTable(currentHeaders, rulesToPreFill);

        document.getElementById('initialSelectionSection').style.display = 'none';
        document.getElementById('dictionaryBuilderSection').style.display = 'block';
        document.getElementById('deleteDictionaryBtn').style.display = 'inline-block';

        displayMessage('existingDictStatus', `Dictionary "${dictionary.name}" loaded for editing.`, 'success');

    } catch (error) {
        console.error('Error loading dictionary for editing:', error);
        displayMessage('existingDictStatus', `Failed to load dictionary: ${error.message}`, 'error');
        currentDictionaryId = null;
    } finally {
        hideLoader('initialLoader');
    }
}

async function startNewDictionaryFromUpload() { /* ... */ }

// --- Core Logic: Render Headers Table for Rule Definition ---

/**
 * Renders the table of headers, pre-filling rules if `rulesToPreFill` are provided.
 * @param {Array<string>} headers - Headers to display in the table.
 * @param {Array<object>} rulesToPreFill - Existing rules to pre-fill the form (optional).
 */
function renderHeadersTable(headers, rulesToPreFill = []) {
    console.log("renderHeadersTable: Function started.");
    console.log("renderHeadersTable: Headers received:", headers);
    console.log("renderHeadersTable: Rules to pre-fill received:", rulesToPreFill);

    const tbody = document.querySelector('#headersTable tbody');
    if (!tbody) {
        console.error("renderHeadersTable: tbody element not found!");
        displayMessage('saveStatus', 'Error: Table body not found in HTML. Please contact support.', 'error');
        return;
    }
    tbody.innerHTML = ''; // Clear existing rows

    // Create a map for quick lookup of rules by column name
    const rulesMap = new Map();
    rulesToPreFill.forEach(rule => {
        const colName = String(rule['Column Name']).trim();
        console.log("renderHeadersTable: Mapping rule for column:", colName, "Rule:", rule);
        if (!rulesMap.has(colName)) {
            rulesMap.set(colName, []);
        }
        rulesMap.get(colName).push(rule);
    });
    console.log("renderHeadersTable: Rules map created:", rulesMap);

    const validationTypes = [
        { value: '', text: 'None' },
        { value: 'REQUIRED', text: 'Required (Not Blank)' },
        { value: 'ALLOWED_VALUES', text: 'Allowed Values (Comma-separated)' },
        { value: 'NUMERIC_RANGE', text: 'Numeric Range (e.g., 0-100)' },
        { value: 'REGEX', text: 'Regex Pattern' },
        { value: 'DATE_PAST', text: 'Date in Past' },
        { value: 'UNIQUE', text: 'Unique Value' }
    ];

    if (headers.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 4; // Span across all columns
        cell.textContent = "No headers available to define rules. Upload a file or load a dictionary with headers.";
        cell.style.textAlign = 'center';
        cell.style.padding = '20px';
        console.warn("renderHeadersTable: No headers provided for rendering.");
        document.getElementById('saveDictionaryBtn').disabled = true;
        return; // Exit early if no headers
    } else {
        document.getElementById('saveDictionaryBtn').disabled = false; // Enable save button if headers exist
    }


    headers.forEach((header, index) => {
        console.log(`renderHeadersTable: Processing header: "${header}" (Index: ${index})`);

        const row = tbody.insertRow();
        row.insertCell().textContent = header; // Column Name (read-only)

        const typeCell = row.insertCell();
        const typeSelect = document.createElement('select');
        typeSelect.classList.add('validation-type-select', 'p-2', 'border', 'border-gray-300', 'rounded-md', 'focus:ring-blue-500', 'focus:border-blue-500', 'text-gray-800');
        typeSelect.name = `type_${index}`;
        validationTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.value;
            option.textContent = type.text;
            typeSelect.appendChild(option);
        });
        typeCell.appendChild(typeSelect);

        const valueCell = row.insertCell();
        const valueInput = document.createElement('input'); 
        valueInput.type = 'text';
        valueInput.classList.add('validation-value-input', 'mt-1', 'block', 'w-full', 'p-2', 'border', 'border-gray-300', 'rounded-md', 'focus:ring-green-500', 'focus:border-green-500', 'text-gray-800');
        valueInput.name = `value_${index}`;
        valueInput.placeholder = 'e.g., Value1,Value2 or 0-100 or ^\\d{5}$';
        valueInput.style.display = 'none'; // Initially hidden, will be managed below
        valueCell.appendChild(valueInput);

        const descriptionDiv = document.createElement('div'); 
        descriptionDiv.classList.add('rule-description');
        valueCell.appendChild(descriptionDiv); // For dynamic hints

        const messageCell = row.insertCell();
        const messageInput = document.createElement('input');
        messageInput.type = 'text';
        messageInput.classList.add('failure-message-input', 'mt-1', 'block', 'w-full', 'p-2', 'border', 'border-gray-300', 'rounded-md', 'focus:ring-green-500', 'focus:border-green-500', 'text-gray-800');
        messageInput.name = `message_${index}`;
        messageInput.placeholder = 'e.g., Field cannot be blank.';
        messageCell.appendChild(messageInput);

        // Pre-fill existing rules if available
        const existingRulesForColumn = rulesMap.get(String(header).trim());
        console.log(`renderHeadersTable: Checking for rules for column "${header}":`, existingRulesForColumn);
        if (existingRulesForColumn && existingRulesForColumn.length > 0) {
            const firstRule = existingRulesForColumn[0]; 
            console.log(`renderHeadersTable: Pre-filling rule for "${header}":`, firstRule);
            
            typeSelect.value = firstRule['Validation Type'] || '';
            valueInput.value = firstRule['Validation Value'] || '';
            messageInput.value = firstRule['Failure Message'] || '';

            // --- Manual update of visibility and placeholder based on selectedType (REVISED with !important) ---
            const selectedType = typeSelect.value;
            if (['ALLOWED_VALUES', 'NUMERIC_RANGE', 'REGEX'].includes(selectedType)) {
                valueInput.style.setProperty('display', 'block', 'important'); // Use !important
                valueInput.required = true;
                console.log(`renderHeadersTable: For "${header}", type "${selectedType}", setting valueInput.style.display = 'block !important'`);
                // Placeholder and description set here
                if (selectedType === 'ALLOWED_VALUES') {
                    valueInput.placeholder = 'Comma-separated values (e.g., Apple,Orange,Banana)';
                    descriptionDiv.textContent = 'Enter values separated by commas (e.g., "Yes,No").';
                } else if (selectedType === 'NUMERIC_RANGE') {
                    valueInput.placeholder = 'Min-Max (e.g., 0-100)';
                    descriptionDiv.textContent = 'Enter a numeric range (e.g., "1-100").';
                } else if (selectedType === 'REGEX') {
                    valueInput.placeholder = 'Regular Expression (e.g., ^\\d{5}$ for 5 digits)';
                    descriptionDiv.textContent = 'Enter a regular expression (e.g., "^\\d{5}$").';
                }
            } else {
                valueInput.style.setProperty('display', 'none', 'important'); // Use !important
                valueInput.required = false;
                valueInput.placeholder = ''; // Clear placeholder if not needed
                descriptionDiv.textContent = ''; // Clear description if not needed
                console.log(`renderHeadersTable: For "${header}", type "${selectedType}", setting valueInput.style.display = 'none !important'`);
            }
            // Update description for types without a value input
            if (selectedType === 'REQUIRED') {
                descriptionDiv.textContent = 'Cell must not be empty.';
            } else if (selectedType === 'DATE_PAST') {
                descriptionDiv.textContent = 'Date must be in the past.';
            } else if (selectedType === 'UNIQUE') {
                 descriptionDiv.textContent = 'Values in this column must be unique across the sheet.';
            }
            // --- End manual update ---
        } else {
            // Default state for columns without pre-filled rules: hide value input
            valueInput.style.setProperty('display', 'none', 'important'); // Use !important
            valueInput.required = false;
            valueInput.placeholder = '';
            descriptionDiv.textContent = ''; // No description by default
            console.log(`renderHeadersTable: No existing rules for "${header}", defaulting valueInput.style.display = 'none !important'`);
        }

        // Add event listener to toggle visibility of value input and update placeholder
        // This listener will use the same !important logic
        typeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            const input = e.target.closest('tr').querySelector('.validation-value-input');
            const descDiv = e.target.closest('tr').querySelector('.rule-description'); // Use local var

            input.value = ''; // Clear value when type changes
            descDiv.textContent = ''; // Clear description

            if (['ALLOWED_VALUES', 'NUMERIC_RANGE', 'REGEX'].includes(selectedType)) {
                input.style.setProperty('display', 'block', 'important'); // Show input with !important
                input.required = true;
                if (selectedType === 'ALLOWED_VALUES') {
                    input.placeholder = 'Comma-separated values (e.g., Apple,Orange,Banana)';
                    descDiv.textContent = 'Enter values separated by commas (e.g., "Yes,No").';
                } else if (selectedType === 'NUMERIC_RANGE') {
                    input.placeholder = 'Min-Max (e.g., 0-100)';
                    descDiv.textContent = 'Enter a numeric range (e.g., "1-100").';
                } else if (selectedType === 'REGEX') {
                    input.placeholder = 'Regular Expression (e.g., ^\\d{5}$ for 5 digits)';
                    descDiv.textContent = 'Enter a regular expression (e.g., "^\\d{5}$").';
                }
            } else {
                input.style.setProperty('display', 'none', 'important'); // Hide input with !important
                input.required = false;
                input.placeholder = '';
            }

            if (selectedType === 'REQUIRED') {
                descDiv.textContent = 'Cell must not be empty.';
            } else if (selectedType === 'DATE_PAST') {
                descDiv.textContent = 'Date must be in the past.';
            } else if (selectedType === 'UNIQUE') {
                 descDiv.textContent = 'Values in this column must be unique across the sheet.';
            }
        });
    });
    console.log("renderHeadersTable: Function finished rendering table.");
}

// --- Core Logic: Save/Update Data Dictionary (unchanged) ---
async function saveDataDictionary() { /* ... */ }
async function deleteDataDictionary() { /* ... */ }
function resetBuilderUI() { /* ... */ }

// --- Event Listeners and Initial Load (unchanged) ---
document.addEventListener('DOMContentLoaded', async () => {
    const userData = await verifyToken();
    if (userData) {
        setupNavigation(userData);
        await populateExistingDictionariesDropdown();
    }

    document.getElementById('loadExistingDictionaryBtn').addEventListener('click', loadDictionaryForEditing);
    document.getElementById('createNewDictionaryBtn').addEventListener('click', startNewDictionaryFromUpload);
    document.getElementById('saveDictionaryBtn').addEventListener('click', saveDataDictionary);
    document.getElementById('deleteDictionaryBtn').addEventListener('click', deleteDataDictionary);
    document.getElementById('existingDictionarySelect').addEventListener('change', () => { /* ... */ });
    document.getElementById('excelFile').addEventListener('change', () => { /* ... */ });
});
