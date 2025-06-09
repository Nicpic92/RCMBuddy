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
 * @param {string} targetLoaderId - The ID of the loader element to show.
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
 * @param {string} targetLoaderId - The ID of the loader element to hide.
 */
function hideLoader(targetLoaderId = 'initialLoader') { // Default to initialLoader
    document.getElementById(targetLoaderId).style.display = 'none';

    // Re-enable primary action buttons, visibility handled elsewhere
    document.getElementById('loadExistingDictionaryBtn').disabled = false;
    document.getElementById('createNewDictionaryBtn').disabled = false;
    document.getElementById('saveDictionaryBtn').disabled = false; // Enabled if builder visible
    document.getElementById('deleteDictionaryBtn').disabled = false; // Enabled if dictionary loaded (its visibility will be set by JS)
}

/**
 * Displays a message on the UI.
 * @param {string} elementId - The ID of the HTML element to display the message in.
 * @param {string} message - The message text.
 * @param {'info' | 'success' | 'error'} type - The type of message (influences styling).
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

// --- Authentication and Navigation (reused from other tools) ---

/**
 * Verifies the JWT token stored in localStorage with the backend.
 * Redirects to login if token is missing or invalid.
 * @returns {Promise<object | null>} User data if token is valid, otherwise null.
 */
async function verifyToken() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/'; // Redirect to login if no token
        return null;
    }

    try {
        const response = await fetch('/api/protected', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error('Token verification failed:', response.statusText);
            localStorage.removeItem('jwtToken');
            window.location.href = '/';
            return null;
        }

        const data = await response.json();
        console.log('User data:', data);
        return data;
    } catch (error) {
        console.error('Error verifying token:', error);
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
        return null;
    }
}

/**
 * Sets up navigation elements based on user data.
 * @param {object} userData - The user data obtained from token verification.
 */
function setupNavigation(userData) {
    const profileLink = document.getElementById('profileLink');
    if (profileLink && userData) {
        profileLink.textContent = `Hello, ${userData.username}`;
        profileLink.href = '#'; // Placeholder, replace with actual profile page link if exists
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('jwtToken');
            window.location.href = '/';
        });
    }
}

// --- Initial Setup: Populate Existing Dictionaries Dropdown & Load Existing Rules ---

/**
 * Populates the dropdown with existing data dictionaries from the backend.
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

        // Also load existing rules for the filtering logic in create new (this doesn't show loader)
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
 * This set is used for filtering new file uploads so users only define new rules.
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
            throw new Error(`Failed to list data dictionaries for filtering: ${listResponse.statusText}`);
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
                    console.warn(`Could not retrieve rules for dictionary ID ${dict.id} for filtering: ${getDictResponse.statusText}`);
                    continue;
                }
                const dictionaryContent = await getDictResponse.json();
                const rules = dictionaryContent.rules_json || []; 

                rules.forEach(rule => {
                    // Consider a column "defined" only if it has an active validation type (not 'None')
                    if (rule['Column Name'] && rule['Validation Type'] && rule['Validation Type'].trim() !== '' && rule['Validation Type'].trim().toLowerCase() !== 'none') {
                        existingDataDictionaryColumns.add(String(rule['Column Name']).trim().toLowerCase());
                    }
                });
            }
            // Catch errors specific to processing a single dictionary, allowing others to proceed
            catch (error) {
                console.error(`Error processing data dictionary ${dict.id} for filtering rules:`, error);
            }
        }
        console.log('Existing columns with defined rules (for filtering new uploads):', existingDataDictionaryColumns);

    } catch (error) {
        console.error('Error loading existing data dictionary rules for filtering:', error);
    }
}

/**
 * Loads a selected data dictionary from the backend into the builder for editing.
 */
async function loadDictionaryForEditing() {
    const selectedDictId = document.getElementById('existingDictionarySelect').value;
    if (!selectedDictId) {
        displayMessage('existingDictStatus', 'Please select a dictionary from the list.', 'error');
        return;
    }

    showLoader('initialLoader'); // Show loader on the initial selection section
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

        console.log("loadDictionaryForEditing: Received dictionary data:", dictionary); // Verify incoming data
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


        renderHeadersTable(currentHeaders, rulesToPreFill); // Pass headers and rules to pre-fill

        document.getElementById('initialSelectionSection').style.display = 'none';
        document.getElementById('dictionaryBuilderSection').style.display = 'block';
        document.getElementById('deleteDictionaryBtn').style.display = 'inline-block';

        displayMessage('existingDictStatus', `Dictionary "${dictionary.name}" loaded for editing.`, 'success');

    } catch (error) {
        console.error('Error loading dictionary for editing:', error);
        displayMessage('existingDictStatus', `Failed to load dictionary: ${error.message}`, 'error');
        currentDictionaryId = null; // Clear ID on error
    } finally {
        hideLoader('initialLoader'); // Hide loader on the initial selection section
    }
}

/**
 * Initiates the process for creating a new dictionary by extracting headers from a file upload.
 */
async function startNewDictionaryFromUpload() {
    const excelFile = document.getElementById('excelFile').files[0];
    if (!excelFile) {
        displayMessage('newDictStatus', 'Please select an Excel or CSV file to start a new dictionary.', 'error');
        return;
    }

    showLoader('initialLoader'); // Show loader on the initial selection section
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
            currentHeaders = extractedHeaders; 

            // Filter out headers that already have rules defined (from existingDataDictionaryColumns)
            const filteredHeaders = extractedHeaders.filter(header => {
                return !existingDataDictionaryColumns.has(String(header).trim().toLowerCase());
            });

            if (filteredHeaders.length === 0 && extractedHeaders.length > 0) {
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

            // Hide initial choice, show builder section
            document.getElementById('initialSelectionSection').style.display = 'none';
            document.getElementById('dictionaryBuilderSection').style.display = 'block';
            document.getElementById('deleteDictionaryBtn').style.display = 'none'; // Hide delete button for new creation

            document.getElementById('dictionaryName').value = uploadedOriginalFileName.replace(/\.(xlsx|xls|csv)$/i, '') + ' Dictionary'; // Suggest a name
            
        } catch (error) {
            console.error('Error processing file for new dictionary:', error);
            displayMessage('newDictStatus', 'Error reading or parsing file. Please ensure it is valid Excel/CSV.', 'error');
            document.getElementById('dictionaryBuilderSection').style.display = 'none';
        } finally {
            hideLoader('initialLoader'); // Hide loader on the initial selection section
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
        valueInput.style.display = 'none'; // Initially hidden
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

            // --- Manual update of visibility and placeholder based on selectedType (REVISED) ---
            const selectedType = typeSelect.value;
            if (['ALLOWED_VALUES', 'NUMERIC_RANGE', 'REGEX'].includes(selectedType)) {
                valueInput.style.display = 'block'; // Explicitly show input
                valueInput.required = true;
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
                valueInput.style.display = 'none'; // Explicitly hide input
                valueInput.required = false;
                valueInput.placeholder = '';
            }
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
            valueInput.style.display = 'none'; 
            valueInput.required = false;
            valueInput.placeholder = '';
            descriptionDiv.textContent = ''; // No description by default
        }

        // Add event listener to toggle visibility of value input and update placeholder
        typeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            const input = e.target.closest('tr').querySelector('.validation-value-input');
            const descDiv = e.target.closest('tr').querySelector('.rule-description'); // Use local var

            input.value = ''; // Clear value when type changes
            descDiv.textContent = ''; // Clear description

            if (['ALLOWED_VALUES', 'NUMERIC_RANGE', 'REGEX'].includes(selectedType)) {
                input.style.display = 'block'; // Show input
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
                input.style.display = 'none'; // Hide input
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
