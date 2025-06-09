// public/tools/data-dictionary-builder.js

// --- Global Variables ---
let currentHeaders = []; // Stores headers extracted from the currently loaded file (for new dicts) or source_headers_json (for editing)
let currentDictionaryId = null; // Stores the ID of the data dictionary currently being edited (null for new)
let uploadedOriginalFileName = null; // Stores the name of the original file (for new dicts) or the dictionary name (for editing)

// Stores column names that already have rules defined in existing data dictionaries (for filtering new uploads)
let existingDataDictionaryColumns = new Set();


// --- Helper Functions (reused and adapted) ---

/**
 * Displays the loading spinner and disables relevant buttons.
 */
function showLoader(targetLoaderId = 'initialLoader') { // Default to initialLoader
    document.getElementById(targetLoaderId).style.display = 'block';
    document.getElementById('existingDictStatus').style.display = 'none';
    document.getElementById('newDictStatus').style.display = 'none';
    document.getElementById('saveStatus').style.display = 'none';

    // Disable all primary action buttons
    document.getElementById('loadExistingDictionaryBtn').disabled = true;
    document.getElementById('createNewDictionaryBtn').disabled = true;
    document.getElementById('saveDictionaryBtn').disabled = true;
    document.getElementById('deleteDictionaryBtn').disabled = true;
}

/**
 * Hides the loading spinner and enables relevant buttons.
 */
function hideLoader(targetLoaderId = 'initialLoader') { // Default to initialLoader
    document.getElementById(targetLoaderId).style.display = 'none';

    // Re-enable primary action buttons, visibility handled elsewhere
    document.getElementById('loadExistingDictionaryBtn').disabled = false;
    document.getElementById('createNewDictionaryBtn').disabled = false;
    document.getElementById('saveDictionaryBtn').disabled = false; // Enabled if builder visible
    document.getElementById('deleteDictionaryBtn').disabled = false; // Enabled if dictionary loaded
}

/**
 * Displays a message on the UI.
 */
function displayMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        // Basic color styling based on type (adapting from previous Tailwind to inline styles)
        if (type === 'error') {
            element.style.color = '#dc3545'; // Red
        } else if (type === 'success') {
            element.style.color = '#28a745'; // Green
        } else {
            element.style.color = '#495057'; // Gray
        }
        element.style.display = 'block'; // Show the message
    }
}

// --- Authentication and Navigation (reused) ---
async function verifyToken() { /* ... */ }
function setupNavigation(userData) { /* ... */ }


// --- Initial Setup: Populate Existing Dictionaries Dropdown & Load Existing Rules ---

/**
 * Populates the dropdown with existing data dictionaries.
 */
async function populateExistingDictionariesDropdown() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    try {
        const listResponse = await fetch('/api/list-data-dictionaries', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!listResponse.ok) {
            throw new Error(`Failed to list data dictionaries: ${listResponse.statusText}`);
        }
        const listResult = await listResponse.json();
        const dataDictionaries = listResult.dictionaries || [];

        const selectElement = document.getElementById('existingDictionarySelect');
        selectElement.innerHTML = '<option value="">-- Select an Existing Dictionary --</option>'; // Clear existing

        if (dataDictionaries.length > 0) {
            dataDictionaries.forEach(dict => {
                const option = document.createElement('option');
                option.value = dict.id;
                option.textContent = dict.name;
                selectElement.appendChild(option);
            });
            selectElement.disabled = false;
            document.getElementById('loadExistingDictionaryBtn').disabled = false;
        } else {
            selectElement.innerHTML = '<option value="">No dictionaries saved yet.</option>';
            selectElement.disabled = true;
            document.getElementById('loadExistingDictionaryBtn').disabled = true;
        }

        // Also load existing rules for the filtering logic in create new
        await loadExistingDataDictionaryRules();

    } catch (error) {
        console.error('Error populating existing dictionaries dropdown:', error);
        displayMessage('existingDictStatus', 'Could not load existing dictionaries. Please try again.', 'error');
        document.getElementById('existingDictionarySelect').disabled = true;
        document.getElementById('loadExistingDictionaryBtn').disabled = true;
    }
}

/**
 * Fetches all existing data dictionaries' rules to build a Set of column names that are already defined.
 * Used for filtering new file uploads.
 */
async function loadExistingDataDictionaryRules() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    existingDataDictionaryColumns.clear(); // Clear previous state

    try {
        const listResponse = await fetch('/api/list-data-dictionaries', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!listResponse.ok) {
            throw new Error(`Failed to list data dictionaries: ${listResponse.statusText}`);
        }
        const listResult = await listResponse.json();
        const dataDictionaries = listResult.dictionaries || [];

        for (const dict of dataDictionaries) {
            try {
                const getDictResponse = await fetch(`/api/get-data-dictionary?id=${dict.id}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!getDictResponse.ok) {
                    console.warn(`Could not retrieve rules for dictionary ID ${dict.id}: ${getDictResponse.statusText}`);
                    continue;
                }
                const dictionaryContent = await getDictResponse.json();
                const rules = dictionaryContent.rules_json || []; 

                rules.forEach(rule => {
                    if (rule['Column Name'] && rule['Validation Type'] && rule['Validation Type'].trim() !== '' && rule['Validation Type'].trim().toLowerCase() !== 'none') {
                        existingDataDictionaryColumns.add(String(rule['Column Name']).trim().toLowerCase());
                    }
                });
            } catch (error) {
                console.error(`Error processing data dictionary ${dict.id}:`, error);
            }
        }
        console.log('Existing columns with defined rules (for filtering new uploads):', existingDataDictionaryColumns);

    } catch (error) {
        console.error('Error loading existing data dictionary rules:', error);
    }
}

/**
 * Loads a selected data dictionary into the builder for editing.
 */
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

        currentDictionaryId = dictionary.id; // Set ID for update operation
        document.getElementById('dictionaryName').value = dictionary.name; // Pre-fill name

        // Use source_headers_json to populate the table for editing
        currentHeaders = dictionary.source_headers_json || []; 
        const rulesToPreFill = dictionary.rules_json || [];

        renderHeadersTable(currentHeaders, rulesToPreFill); // Pass rules to pre-fill

        document.getElementById('initialSelectionSection').style.display = 'none'; // Hide initial choice
        document.getElementById('dictionaryBuilderSection').style.display = 'block'; // Show builder
        document.getElementById('deleteDictionaryBtn').style.display = 'inline-block'; // Show delete button

        displayMessage('existingDictStatus', `Dictionary "${dictionary.name}" loaded for editing.`, 'success');

    } catch (error) {
        console.error('Error loading dictionary for editing:', error);
        displayMessage('existingDictStatus', `Failed to load dictionary: ${error.message}`, 'error');
        currentDictionaryId = null; // Clear ID on error
    } finally {
        hideLoader('initialLoader');
    }
}

/**
 * Initiates the process for creating a new dictionary by prompting for file upload.
 */
async function startNewDictionaryFromUpload() {
    const excelFile = document.getElementById('excelFile').files[0];
    if (!excelFile) {
        displayMessage('newDictStatus', 'Please select an Excel or CSV file to start a new dictionary.', 'error');
        return;
    }

    showLoader('initialLoader');
    displayMessage('newDictStatus', `Extracting headers from ${excelFile.name}...`, 'info');
    uploadedOriginalFileName = excelFile.name; // Store for later reference
    currentDictionaryId = null; // Ensure it's null for new creation

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellNF: true, cellDates: false });

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length === 0) {
                displayMessage('newDictStatus', 'File is empty or contains no data.', 'error');
                hideLoader('initialLoader');
                return;
            }
            
            let extractedHeaders = jsonData[0] || [];

            if (extractedHeaders.length === 0) {
                displayMessage('newDictStatus', 'No headers found in the first row of the file.', 'error');
                hideLoader('initialLoader');
                return;
            }

            // Store ALL extracted headers for potential saving in source_headers_json
            // Filtered headers will be passed to renderHeadersTable below.
            currentHeaders = extractedHeaders; 

            // Filter out headers that already have rules defined (from existingDataDictionaryColumns)
            const filteredHeaders = extractedHeaders.filter(header => {
                return !existingDataDictionaryColumns.has(String(header).trim().toLowerCase());
            });

            if (filteredHeaders.length === 0 && extractedHeaders.length > 0) { // Only show message if headers were actually extracted
                displayMessage('newDictStatus', 'All headers in this file already have rules defined in your existing dictionaries. No new rules to build.', 'info');
                document.getElementById('dictionaryBuilderSection').style.display = 'none';
                document.getElementById('saveDictionaryBtn').disabled = true;
                document.getElementById('deleteDictionaryBtn').style.display = 'none'; // Ensure delete button is hidden for new
                hideLoader('initialLoader');
                return;
            }

            // Display message about filtered columns if any
            const skippedCount = extractedHeaders.length - filteredHeaders.length;
            if (skippedCount > 0) {
                displayMessage('newDictStatus', `Headers loaded from ${excelFile.name}. ${skippedCount} column(s) skipped (rules exist). Define rules for new columns below.`, 'success');
            } else {
                displayMessage('newDictStatus', `Headers loaded from ${excelFile.name}. Define your rules.`, 'success');
            }
            
            // Render the table with only new headers, no pre-filled rules for new creation
            renderHeadersTable(filteredHeaders, []); 

            document.getElementById('initialSelectionSection').style.display = 'none'; // Hide initial choice
            document.getElementById('dictionaryBuilderSection').style.display = 'block'; // Show builder
            document.getElementById('deleteDictionaryBtn').style.display = 'none'; // Hide delete button for new creation

            document.getElementById('dictionaryName').value = uploadedOriginalFileName.replace(/\.(xlsx|xls|csv)$/i, '') + ' Dictionary'; // Suggest a name
            
        } catch (error) {
            console.error('Error processing file for new dictionary:', error);
            displayMessage('newDictStatus', 'Error reading or parsing file. Please ensure it is valid Excel/CSV.', 'error');
            document.getElementById('dictionaryBuilderSection').style.display = 'none';
        } finally {
            hideLoader('initialLoader');
        }
    };
    reader.readAsArrayBuffer(excelFile);
}

// --- Core Logic: Render Headers Table for Rule Definition ---

/**
 * Renders the table of headers, pre-filling rules if `rulesToPreFill` are provided.
 * @param {Array<string>} headers - Headers to display in the table.
 * @param {Array<object>} rulesToPreFill - Existing rules to pre-fill the form (optional).
 */
function renderHeadersTable(headers, rulesToPreFill = []) {
    const tbody = document.querySelector('#headersTable tbody');
    tbody.innerHTML = ''; // Clear existing rows

    // Create a map for quick lookup of rules by column name
    const rulesMap = new Map();
    rulesToPreFill.forEach(rule => {
        const colName = String(rule['Column Name']).trim();
        if (!rulesMap.has(colName)) {
            rulesMap.set(colName, []);
        }
        rulesMap.get(colName).push(rule);
    });

    const validationTypes = [
        { value: '', text: 'None' },
        { value: 'REQUIRED', text: 'Required (Not Blank)' },
        { value: 'ALLOWED_VALUES', text: 'Allowed Values (Comma-separated)' },
        { value: 'NUMERIC_RANGE', text: 'Numeric Range (e.g., 0-100)' },
        { value: 'REGEX', text: 'Regex Pattern' },
        { value: 'DATE_PAST', text: 'Date in Past' },
        { value: 'UNIQUE', text: 'Unique Value' }
    ];

    headers.forEach((header, index) => {
        const row = tbody.insertRow();
        row.insertCell().textContent = header; // Column Name (read-only)

        const typeCell = row.insertCell();
        const typeSelect = document.createElement('select');
        typeSelect.classList.add('validation-type-select');
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
        valueInput.classList.add('validation-value-input');
        valueInput.name = `value_${index}`;
        valueInput.placeholder = 'e.g., Value1,Value2 or 0-100 or ^\\d{5}$';
        valueInput.classList.add('hidden-rule-value'); // Initially hidden
        valueCell.appendChild(valueInput);
        valueCell.appendChild(document.createElement('div')).classList.add('rule-description'); // For dynamic hints

        const messageCell = row.insertCell();
        const messageInput = document.createElement('input');
        messageInput.type = 'text';
        messageInput.classList.add('failure-message-input');
        messageInput.name = `message_${index}`;
        messageInput.placeholder = 'e.g., Field cannot be blank.';
        messageCell.appendChild(messageInput);

        // Pre-fill existing rules if available
        const existingRulesForColumn = rulesMap.get(String(header).trim());
        if (existingRulesForColumn && existingRulesForColumn.length > 0) {
            // For simplicity, take the first rule for a column. If multiple rules per column are allowed,
            // this needs a more complex UI (e.g., "Add Rule" button per column).
            // Based on previous discussions, it was one rule per column, so this is fine.
            const firstRule = existingRulesForColumn[0]; 
            typeSelect.value = firstRule['Validation Type'] || '';
            valueInput.value = firstRule['Validation Value'] || '';
            messageInput.value = firstRule['Failure Message'] || '';
            // Trigger change event to set visibility/placeholder correctly
            typeSelect.dispatchEvent(new Event('change')); 
        }

        // Add event listener to toggle visibility of value input and update placeholder
        typeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            const input = e.target.closest('tr').querySelector('.validation-value-input');
            const descriptionDiv = e.target.closest('tr').querySelector('.rule-description');

            input.value = ''; // Clear value when type changes
            descriptionDiv.textContent = ''; // Clear description

            if (['ALLOWED_VALUES', 'NUMERIC_RANGE', 'REGEX'].includes(selectedType)) {
                input.classList.remove('hidden-rule-value');
                input.required = true;
                if (selectedType === 'ALLOWED_VALUES') {
                    input.placeholder = 'Comma-separated values (e.g., Apple,Orange,Banana)';
                    descriptionDiv.textContent = 'Enter values separated by commas (e.g., "Yes,No").';
                } else if (selectedType === 'NUMERIC_RANGE') {
                    input.placeholder = 'Min-Max (e.g., 0-100)';
                    descriptionDiv.textContent = 'Enter a numeric range (e.g., "1-100").';
                } else if (selectedType === 'REGEX') {
                    input.placeholder = 'Regular Expression (e.g., ^\\d{5}$ for 5 digits)';
                    descriptionDiv.textContent = 'Enter a regular expression (e.g., "^\\d{5}$").';
                }
            } else {
                input.classList.add('hidden-rule-value');
                input.required = false;
                input.placeholder = '';
            }

            if (selectedType === 'REQUIRED') {
                descriptionDiv.textContent = 'Cell must not be empty.';
            } else if (selectedType === 'DATE_PAST') {
                descriptionDiv.textContent = 'Date must be in the past.';
            } else if (selectedType === 'UNIQUE') {
                 descriptionDiv.textContent = 'Values in this column must be unique across the sheet.';
            }
        });
    });
}

// --- Core Logic: Save/Update Data Dictionary ---

async function saveDataDictionary() {
    const dictionaryName = document.getElementById('dictionaryName').value.trim();
    if (!dictionaryName) {
        displayMessage('saveStatus', 'Please provide a name for your data dictionary.', 'error');
        return;
    }

    showLoader('dictionaryBuilderSection'); // Use section-specific loader
    displayMessage('saveStatus', 'Saving data dictionary...', 'info');

    const tbody = document.querySelector('#headersTable tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    const rulesData = [];
    let hasRules = false;

    rows.forEach(row => {
        const columnName = row.cells[0].textContent;
        const typeSelect = row.querySelector('.validation-type-select');
        const valueInput = row.querySelector('.validation-value-input');
        const messageInput = row.querySelector('.failure-message-input');

        const validationType = typeSelect.value;
        const validationValue = valueInput.value.trim();
        const failureMessage = messageInput.value.trim();

        if (validationType) { // Only add rules if a type is selected
            hasRules = true;
            const rule = {
                'Column Name': columnName,
                'Validation Type': validationType,
                'Validation Value': validationValue || null,
                'Failure Message': failureMessage || null
            };
            rulesData.push(rule);
        }
    });

    if (!hasRules) {
        displayMessage('saveStatus', 'Please define at least one validation rule.', 'error');
        hideLoader('dictionaryBuilderSection');
        return;
    }

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        displayMessage('saveStatus', 'Authentication failed. Please log in again.', 'error');
        hideLoader('dictionaryBuilderSection');
        return;
    }

    try {
        const payload = {
            dictionaryName: dictionaryName,
            rules: rulesData,
            sourceHeaders: currentHeaders // All headers from the loaded file/existing dictionary
        };

        let endpoint = '/api/save-data-dictionary'; // For INSERT
        let method = 'POST';

        if (currentDictionaryId) { // If editing an existing dictionary
            payload.dictionaryId = currentDictionaryId; // Add ID for UPDATE
            // Endpoint remains the same, but backend will use dictionaryId for UPDATE
        }

        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save data dictionary.');
        }

        const result = await response.json();
        currentDictionaryId = result.dictionaryId; // Update ID (especially for new inserts)
        
        displayMessage('saveStatus', 'Data Dictionary saved successfully! You can now use it in the Excel Validate tool.', 'success');
        document.getElementById('deleteDictionaryBtn').style.display = 'inline-block'; // Show delete button
        document.getElementById('deleteDictionaryBtn').textContent = `Delete This Data Dictionary ("${dictionaryName}")`;

        // Refresh existing dictionaries list and rules after save/update
        await populateExistingDictionariesDropdown();
        await loadExistingDataDictionaryRules();

    } catch (error) {
        console.error('Error saving data dictionary:', error);
        displayMessage('saveStatus', `Error saving data dictionary: ${error.message}`, 'error');
    } finally {
        hideLoader('dictionaryBuilderSection');
    }
}

// --- Core Logic: Delete Data Dictionary ---

async function deleteDataDictionary() { 
    const dictionaryIdToDelete = currentDictionaryId; 
    const dictionaryName = document.getElementById('dictionaryName').value.trim();

    if (!dictionaryIdToDelete) {
        displayMessage('saveStatus', 'No data dictionary selected or saved to delete.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete the data dictionary "${dictionaryName}"? This action cannot be undone.`)) {
        return;
    }

    showLoader('dictionaryBuilderSection');
    displayMessage('saveStatus', 'Deleting data dictionary...', 'info');

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        displayMessage('saveStatus', 'Authentication failed. Please log in again.', 'error');
        hideLoader('dictionaryBuilderSection');
        return;
    }

    try {
        const response = await fetch(`/api/delete-data-dictionary?id=${dictionaryIdToDelete}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete data dictionary.');
        }

        displayMessage('saveStatus', 'Data dictionary deleted successfully!', 'success');
        
        // Reset the UI to initial selection
        resetBuilderUI();

        // Refresh existing dictionaries list and rules after deletion
        await populateExistingDictionariesDropdown();
        await loadExistingDataDictionaryRules();

    } catch (error) {
        console.error('Error deleting data dictionary:', error);
        displayMessage('saveStatus', `Error deleting data dictionary: ${error.message}`, 'error');
    } finally {
        hideLoader('dictionaryBuilderSection');
    }
}

/**
 * Resets the builder section UI to its initial empty state.
 */
function resetBuilderUI() {
    currentDictionaryId = null;
    uploadedOriginalFileName = null;
    currentHeaders = [];
    document.getElementById('dictionaryName').value = '';
    document.querySelector('#headersTable tbody').innerHTML = ''; // Clear table rows
    document.getElementById('excelFile').value = ''; // Clear file input
    document.getElementById('deleteDictionaryBtn').style.display = 'none'; // Hide delete button

    document.getElementById('dictionaryBuilderSection').style.display = 'none'; // Hide builder
    document.getElementById('initialSelectionSection').style.display = 'block'; // Show initial selection
    document.getElementById('existingDictionarySelect').value = ''; // Reset dropdown
    document.getElementById('newDictStatus').style.display = 'none'; // Hide status messages
    document.getElementById('existingDictStatus').style.display = 'none';
    document.getElementById('saveStatus').style.display = 'none';
}


// --- Event Listeners and Initial Load ---

document.addEventListener('DOMContentLoaded', async () => {
    const userData = await verifyToken();
    if (userData) {
        setupNavigation(userData);
        await populateExistingDictionariesDropdown(); // Populate dropdown on load
    }

    // Event listeners for initial selection screen
    document.getElementById('loadExistingDictionaryBtn').addEventListener('click', loadDictionaryForEditing);
    document.getElementById('createNewDictionaryBtn').addEventListener('click', startNewDictionaryFromUpload);
    
    // Event listener for main builder actions
    document.getElementById('saveDictionaryBtn').addEventListener('click', saveDataDictionary);
    document.getElementById('deleteDictionaryBtn').addEventListener('click', deleteDataDictionary);

    // Clear file input if existing dictionary selected (UX)
    document.getElementById('existingDictionarySelect').addEventListener('change', () => {
        document.getElementById('excelFile').value = '';
        displayMessage('newDictStatus', '', 'info');
    });

    // Clear existing dictionary selection if new file uploaded (UX)
    document.getElementById('excelFile').addEventListener('change', () => {
        document.getElementById('existingDictionarySelect').value = '';
        displayMessage('existingDictStatus', '', 'info');
    });
});
