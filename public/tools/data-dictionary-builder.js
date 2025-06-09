// public/tools/data-dictionary-builder.js

// --- Global Variables ---
let currentHeaders = []; // Stores the headers of the currently processed file/dictionary
let currentDictionaryId = null; // Stores the ID of the dictionary currently being edited (null for new ones)
let uploadedOriginalFileName = null; // Stores the name of the file uploaded to extract headers for a NEW dictionary
let isEditingExistingDictionary = false; // Flag to differentiate between creating new and editing existing

// --- Helper Functions (reused and adapted) ---

/**
 * Displays the loading spinner and disables relevant buttons/sections.
 * @param {string} targetLoaderId - The ID of the loader element to show.
 */
function showLoader(targetLoaderId = 'initialLoader') {
    document.getElementById(targetLoaderId).style.display = 'block';
    // Disable primary action buttons while loading
    document.getElementById('loadExistingDictionaryBtn').disabled = true;
    document.getElementById('createNewDictionaryBtn').disabled = true;
    document.getElementById('saveDictionaryBtn').disabled = true;
    document.getElementById('deleteDictionaryBtn').disabled = true;
    document.getElementById('printDictionaryBtn').disabled = true; // NEW: Disable print button
}

/**
 * Hides the loading spinner and enables relevant buttons/sections.
 * @param {string} targetLoaderId - The ID of the loader element to hide.
 */
function hideLoader(targetLoaderId = 'initialLoader') {
    document.getElementById(targetLoaderId).style.display = 'none';
    // Re-enable primary action buttons, save/delete will be managed by table content
    document.getElementById('loadExistingDictionaryBtn').disabled = false;
    document.getElementById('createNewDictionaryBtn').disabled = false;
    // Save/delete/print buttons re-enabled based on whether headers are loaded or existing dict is loaded
    // Managed by renderHeadersTable and loadDictionaryForEditing
}

/**
 * Displays a message on the UI.
 * @param {string} elementId - The ID of the HTML element to display the message in.
 * @param {string} message - The message text.
 * @param {'info' | 'success' | 'error'} type - The type of message (influences styling via classes).
 */
function displayMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        // Remove existing color classes to prevent conflicts
        element.classList.remove('text-red-600', 'text-green-600', 'text-gray-600');
        // Add new color class based on message type
        if (type === 'error') {
            element.classList.add('text-red-600');
        } else if (type === 'success') {
            element.classList.add('text-green-600');
        } else {
            element.classList.add('text-gray-600'); // Default for info
        }
        element.style.display = 'block'; // Ensure message is visible
    }
}

// --- Authentication and Navigation (reused) ---

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
        console.log('User data:', data); // Log user data for debugging
        return data; // Contains user and company info
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
    if (profileLink && userData && userData.user) {
        profileLink.textContent = `Hello, ${userData.user.username}`; // FIX: Access nested username
        profileLink.href = '#'; // Placeholder, replace with actual profile page link if exists
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('jwtToken');
            window.location.href = '/'; // Redirect to login page
        });
    }
}

// --- Initial Setup: Populate Existing Dictionaries Dropdown & Load Existing Rules ---

/**
 * Fetches the list of uploaded data dictionaries from the backend and populates the select dropdown.
 */
async function populateExistingDictionariesDropdown() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        console.warn('populateExistingDictionariesDropdown: No token found. Cannot fetch dictionaries.');
        // The verifyToken() on DOMContentLoaded handles initial redirection, but good to prevent fetch.
        return;
    }

    displayMessage('existingDictStatus', 'Loading existing dictionaries...', 'info');
    const dropdown = document.getElementById('existingDictionarySelect');
    dropdown.innerHTML = '<option value="">-- Loading --</option>'; // Temporary loading message

    try {
        // Correctly call the list-data-dictionaries API
        const response = await fetch('/api/list-data-dictionaries', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            console.error('populateExistingDictionariesDropdown: Failed to fetch dictionaries:', response.status, errorData.message);
            displayMessage('existingDictStatus', `Failed to load dictionaries: ${errorData.message || 'Server error.'}`, 'error');
            dropdown.innerHTML = '<option value="">-- Error Loading --</option>';
            dropdown.disabled = true;
            document.getElementById('loadExistingDictionaryBtn').disabled = true;
            return;
        }

        const result = await response.json();
        const dataDictionaries = result.dictionaries || []; // Ensure you're accessing the 'dictionaries' array

        dropdown.innerHTML = '<option value="">-- Select an Existing Dictionary --</option>'; // Reset default option

        let hasDataDictionaries = false;
        if (dataDictionaries.length > 0) {
            dataDictionaries.forEach(dict => {
                const option = document.createElement('option');
                option.value = dict.id;
                option.textContent = dict.name;
                dropdown.appendChild(option);
            });
            hasDataDictionaries = true;
            displayMessage('existingDictStatus', `${dataDictionaries.length} dictionaries loaded.`, 'success');
        } else {
            displayMessage('existingDictStatus', 'No data dictionaries found for your company.', 'info');
            dropdown.innerHTML = '<option value="">No data dictionaries available.</option>';
        }

        // Enable/disable the dropdown and its load button based on data
        dropdown.disabled = !hasDataDictionaries;
        document.getElementById('loadExistingDictionaryBtn').disabled = !hasDataDictionaries;

    } catch (error) {
        console.error('populateExistingDictionariesDropdown: Network or parsing error:', error);
        displayMessage('existingDictStatus', `An unexpected error occurred: ${error.message}`, 'error');
        dropdown.innerHTML = '<option value="">-- Error --</option>';
        dropdown.disabled = true;
        document.getElementById('loadExistingDictionaryBtn').disabled = true;
    }
}

/**
 * Loads the selected data dictionary's rules from the backend for editing.
 */
async function loadDictionaryForEditing() {
    const selectedDictId = document.getElementById('existingDictionarySelect').value;
    if (!selectedDictId) {
        displayMessage('existingDictStatus', 'Please select a dictionary from the list to load for editing.', 'error');
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
            throw new Error(`Failed to load dictionary: ${response.statusText || 'Server error'}`);
        }
        const dictionary = await response.json();

        console.log("loadDictionaryForEditing: Received dictionary data:", dictionary);

        currentDictionaryId = dictionary.id;
        document.getElementById('dictionaryName').value = dictionary.name;
        isEditingExistingDictionary = true; // Set flag

        currentHeaders = dictionary.source_headers_json || []; // Ensure it's an array, even if null/empty
        const rulesToPreFill = dictionary.rules_json || []; // Ensure it's an array, even if null/empty

        if (currentHeaders.length === 0) {
            console.warn("loadDictionaryForEditing: No source headers found in the loaded dictionary. This dictionary might not have been created from a file with headers.");
            displayMessage('existingDictStatus', 'Dictionary loaded, but no source headers found to build table. Consider uploading a new file to get headers, or editing an existing dictionary that has source headers.', 'info');
        }
        if (rulesToPreFill.length === 0) {
            console.warn("loadDictionaryForEditing: No rules found in the loaded dictionary.");
        }

        renderHeadersTable(currentHeaders, rulesToPreFill);

        // Transition UI
        document.getElementById('initialSelectionSection').classList.add('hidden');
        document.getElementById('dictionaryBuilderSection').classList.remove('hidden');
        document.getElementById('deleteDictionaryBtn').classList.remove('hidden'); // Show delete button for existing dict
        document.getElementById('printDictionaryBtn').disabled = false; // NEW: Enable print button

        displayMessage('existingDictStatus', `Dictionary "${dictionary.name}" loaded for editing.`, 'success');

    } catch (error) {
        console.error('Error loading dictionary for editing:', error);
        displayMessage('existingDictStatus', `Failed to load dictionary: ${error.message}`, 'error');
        currentDictionaryId = null;
        isEditingExistingDictionary = false;
    } finally {
        hideLoader('initialLoader');
    }
}

/**
 * Handles the upload of a new Excel/CSV file to extract headers for a new dictionary.
 */
async function startNewDictionaryFromUpload() {
    const excelFile = document.getElementById('excelFile').files[0];
    if (!excelFile) {
        displayMessage('newDictStatus', 'Please select an Excel or CSV file to extract headers.', 'error');
        return;
    }

    showLoader('initialLoader');
    displayMessage('newDictStatus', `Extracting headers from ${excelFile.name}...`, 'info');

    currentDictionaryId = null; // Reset for new dictionary
    uploadedOriginalFileName = excelFile.name; // Store for potential default name
    isEditingExistingDictionary = false; // Set flag

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            if (workbook.SheetNames.length === 0) {
                throw new Error('No sheets found in the uploaded file.');
            }

            // Take headers from the first sheet (you might need to adjust this logic if multiple sheets are relevant)
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

            if (jsonData.length === 0) {
                throw new Error('The first sheet is empty and contains no headers.');
            }

            // Assume the first non-empty row is the header row
            let headers = [];
            for(let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row.some(cell => cell !== null && String(cell).trim() !== '')) {
                    headers = row.map(h => h === null || h === undefined ? '' : String(h).trim()).filter(h => h !== '');
                    break;
                }
            }

            if (headers.length === 0) {
                throw new Error('Could not find any valid headers in the first sheet.');
            }

            currentHeaders = headers;
            document.getElementById('dictionaryName').value = uploadedOriginalFileName.replace(/\.(xlsx|xls|csv)$/i, '').trim(); // Pre-fill name
            
            renderHeadersTable(currentHeaders); // Render table with empty rules
            
            // Transition UI
            document.getElementById('initialSelectionSection').classList.add('hidden');
            document.getElementById('dictionaryBuilderSection').classList.remove('hidden');
            document.getElementById('deleteDictionaryBtn').classList.add('hidden'); // Hide delete button for new dict
            document.getElementById('printDictionaryBtn').disabled = false; // NEW: Enable print button

            displayMessage('newDictStatus', `Headers extracted from "${excelFile.name}". Define your rules.`, 'success');

        } catch (error) {
            console.error('Error processing uploaded file for headers:', error);
            displayMessage('newDictStatus', `Failed to extract headers: ${error.message}`, 'error');
            currentHeaders = []; // Clear headers on error
        } finally {
            hideLoader('initialLoader');
            document.getElementById('excelFile').value = ''; // Clear file input
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
    // Assuming each column will only have ONE rule defined in the UI for simplicity
    // If multiple rules per column are needed, this structure needs to be an array of rules per column
    const rulesMap = new Map();
    rulesToPreFill.forEach(rule => {
        const colName = String(rule['Column Name']).trim();
        if (colName) {
            // Store the rule object directly
            rulesMap.set(colName, rule);
        }
    });
    console.log("renderHeadersTable: Rules map created:", rulesMap);

    // Ensure this list matches the backend validation types
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
        document.getElementById('saveDictionaryBtn').disabled = true; // Disable save button if no headers
        document.getElementById('printDictionaryBtn').disabled = true; // NEW: Disable print button
        return;
    } else {
        document.getElementById('saveDictionaryBtn').disabled = false; // Enable save button if headers exist
        document.getElementById('printDictionaryBtn').disabled = false; // NEW: Enable print button
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
        // Use !important for display style to ensure override over Tailwind/other rules if needed
        valueInput.style.setProperty('display', 'none', 'important'); // Initially hidden
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

        // Pre-fill existing rules if available for this column
        const existingRule = rulesMap.get(String(header).trim());
        console.log(`renderHeadersTable: Checking for rule for column "${header}":`, existingRule);
        if (existingRule) {
            console.log(`renderHeadersTable: Pre-filling rule for "${header}":`, existingRule);
            typeSelect.value = existingRule['Validation Type'] || '';
            valueInput.value = existingRule['Validation Value'] || '';
            messageInput.value = existingRule['Failure Message'] || '';

            // Manually trigger change to set initial visibility and placeholder
            typeSelect.dispatchEvent(new Event('change'));
        } else {
            // Default state for columns without pre-filled rules: ensure value input is hidden
            valueInput.style.setProperty('display', 'none', 'important');
            valueInput.required = false;
            valueInput.placeholder = '';
            descriptionDiv.textContent = ''; // No description by default
            console.log(`renderHeadersTable: No existing rule for "${header}", defaulting valueInput.style.display = 'none !important'`);
        }

        // Add event listener to toggle visibility of value input and update placeholder/description
        typeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            const input = e.target.closest('tr').querySelector('.validation-value-input');
            const descDiv = e.target.closest('tr').querySelector('.rule-description');

            input.value = ''; // Clear value when type changes
            descDiv.textContent = ''; // Clear description

            if (['ALLOWED_VALUES', 'NUMERIC_RANGE', 'REGEX'].includes(selectedType)) {
                input.style.setProperty('display', 'block', 'important'); // Show input
                input.required = true; // Make required if it's a rule that needs a value
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
                input.style.setProperty('display', 'none', 'important'); // Hide input
                input.required = false;
                input.placeholder = '';
            }

            // Update description for types without a value input or with special notes
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

/**
 * Collects all defined rules from the headers table.
 * @returns {Array<object>} An array of rule objects, ready for saving.
 */
function collectRules() {
    const rules = [];
    const tbody = document.querySelector('#headersTable tbody');
    if (!tbody) {
        console.error("collectRules: tbody element not found!");
        return [];
    }

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const columnName = row.cells[0].textContent.trim();
        const validationType = row.querySelector('.validation-type-select').value;
        const validationValueInput = row.querySelector('.validation-value-input');
        const failureMessage = row.querySelector('.failure-message-input').value.trim();

        // Only include rules where a type other than 'None' is selected
        if (validationType && validationType !== '') {
            const rule = {
                "Column Name": columnName,
                "Validation Type": validationType,
                "Validation Value": validationValueInput.style.display !== 'none' ? validationValueInput.value.trim() : "", // Only include value if input is visible
                "Failure Message": failureMessage
            };
            rules.push(rule);
        }
    });
    console.log("Collected Rules:", rules);
    return rules;
}

// --- Core Logic: Save/Update Data Dictionary ---

/**
 * Handles saving a new data dictionary or updating an existing one.
 */
async function saveDataDictionary() {
    const dictionaryNameInput = document.getElementById('dictionaryName');
    const dictionaryName = dictionaryNameInput.value.trim();
    const rules = collectRules();
    const sourceHeaders = currentHeaders; // Use the headers that were used to build the table

    if (!dictionaryName) {
        displayMessage('saveStatus', 'Please enter a name for your data dictionary.', 'error');
        dictionaryNameInput.focus();
        return;
    }
    if (rules.length === 0) {
        displayMessage('saveStatus', 'Please define at least one validation rule.', 'error');
        return;
    }

    displayMessage('saveStatus', 'Saving data dictionary...', 'info');
    document.getElementById('saveDictionaryBtn').disabled = true;
    document.getElementById('printDictionaryBtn').disabled = true; // Disable print button
    document.getElementById('deleteDictionaryBtn').disabled = true; // Disable delete button

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        displayMessage('saveStatus', 'Authentication required. Please log in again.', 'error');
        document.getElementById('saveDictionaryBtn').disabled = false;
        document.getElementById('printDictionaryBtn').disabled = false; // Re-enable
        document.getElementById('deleteDictionaryBtn').disabled = false; // Re-enable
        return;
    }

    // Prepare payload. Send currentDictionaryId if editing existing.
    const payload = {
        dictionaryName,
        rules,
        sourceHeaders,
        // Only include id if we are editing an existing dictionary
        ...(isEditingExistingDictionary && currentDictionaryId && { id: currentDictionaryId })
    };

    try {
        const response = await fetch('/api/save-data-dictionary', { // Target the save-data-dictionary function
            method: 'POST', // Assuming backend will handle UPDATE logic based on payload.id
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            displayMessage('saveStatus', result.message || 'Data dictionary saved successfully!', 'success');
            // Update currentDictionaryId if it was a new creation
            if (!isEditingExistingDictionary && result.dictionaryId) {
                currentDictionaryId = result.dictionaryId;
                isEditingExistingDictionary = true; // Now it's an existing dictionary
                document.getElementById('deleteDictionaryBtn').classList.remove('hidden'); // Show delete for newly saved
            }
            // Refresh the existing dictionaries list in the initial section
            await populateExistingDictionariesDropdown();
        } else {
            displayMessage('saveStatus', `Error saving: ${result.message || 'Unknown error.'}`, 'error');
            console.error('Save error:', result.error || result.message);
        }
    } catch (error) {
        displayMessage('saveStatus', `Network error during save: ${error.message}`, 'error');
        console.error('Frontend save error:', error);
    } finally {
        document.getElementById('saveDictionaryBtn').disabled = false;
        document.getElementById('printDictionaryBtn').disabled = false; // Re-enable
        document.getElementById('deleteDictionaryBtn').disabled = false; // Re-enable
    }
}

/**
 * Handles deleting the currently loaded data dictionary.
 */
async function deleteDataDictionary() {
    console.log("deleteDataDictionary: Function started."); // Log start
    console.log("deleteDataDictionary: currentDictionaryId:", currentDictionaryId); // Log current ID

    if (!currentDictionaryId) {
        console.error("deleteDataDictionary: No dictionary selected for deletion.");
        displayMessage('saveStatus', 'No dictionary selected to delete.', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this data dictionary? This action cannot be undone.')) {
        console.log("deleteDataDictionary: User cancelled deletion.");
        return;
    }

    displayMessage('saveStatus', 'Deleting data dictionary...', 'info');
    document.getElementById('deleteDictionaryBtn').disabled = true;
    document.getElementById('saveDictionaryBtn').disabled = true; // Disable save
    document.getElementById('printDictionaryBtn').disabled = true; // Disable print

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        console.error("deleteDataDictionary: Authentication token missing.");
        displayMessage('saveStatus', 'Authentication required. Please log in again.', 'error');
        document.getElementById('deleteDictionaryBtn').disabled = false;
        document.getElementById('saveDictionaryBtn').disabled = false; // Re-enable
        document.getElementById('printDictionaryBtn').disabled = false; // Re-enable
        return;
    }

    try {
        console.log("deleteDataDictionary: Sending DELETE request to backend.");
        const response = await fetch('/api/delete-data-dictionary', { // Target the delete-data-dictionary function
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id: currentDictionaryId }) // Send ID in body for DELETE
        });

        const result = await response.json();

        if (response.ok) {
            console.log("deleteDataDictionary: Deletion successful.", result);
            displayMessage('saveStatus', result.message || 'Data dictionary deleted successfully!', 'success');
            resetBuilderUI(); // Reset UI after successful deletion
            await populateExistingDictionariesDropdown(); // Refresh list
        } else {
            console.error("deleteDataDictionary: Backend error response:", result.status, result.message, result.error);
            displayMessage('saveStatus', `Error deleting: ${result.message || 'Unknown error.'}`, 'error');
        }
    } catch (error) {
        console.error('deleteDataDictionary: Network error during delete:', error);
        displayMessage('saveStatus', `Network error during deletion: ${error.message}`, 'error');
    } finally {
        console.log("deleteDataDictionary: Finalizing deletion attempt.");
        document.getElementById('deleteDictionaryBtn').disabled = false;
        document.getElementById('saveDictionaryBtn').disabled = false; // Re-enable
        document.getElementById('printDictionaryBtn').disabled = false; // Re-enable
    }
}

/**
 * Handles the printing of the current Data Dictionary.
 */
function handlePrintDictionary() {
    const dictionaryName = document.getElementById('dictionaryName').value.trim();
    const rules = collectRules(); // Get the current rules from the table

    if (!dictionaryName || rules.length === 0) {
        displayMessage('saveStatus', 'Please load or create a data dictionary with rules to print.', 'error');
        return;
    }

    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) {
        alert('Please allow pop-ups for printing this report.');
        return;
    }

    let printContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Data Dictionary Report - ${dictionaryName}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    margin: 20px;
                    color: #333;
                    line-height: 1.6;
                    -webkit-print-color-adjust: exact; /* Keep colors when printing */
                    print-color-adjust: exact;
                }
                h1 {
                    color: #2D62B3;
                    text-align: center;
                    margin-bottom: 20px;
                    font-size: 2em;
                }
                h2 {
                    color: #495057;
                    margin-top: 25px;
                    margin-bottom: 15px;
                    font-size: 1.5em;
                    border-bottom: 2px solid #eee;
                    padding-bottom: 5px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 0.9em;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 10px;
                    text-align: left;
                }
                th {
                    background-color: #f2f2f2;
                    font-weight: bold;
                    color: #555;
                }
                tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                .meta-info p {
                    margin: 5px 0;
                    font-size: 0.95em;
                }
                .meta-info strong {
                    color: #2c3e50;
                }
                /* Print-specific styles to hide elements not needed in printout */
                @media print {
                    /* Ensure all text is black for print contrast */
                    body, h1, h2, h3, p, strong, table, th, td {
                        color: #000 !important;
                    }
                    /* Ensure backgrounds are mostly white, unless critical for meaning */
                    body, table, tr, td {
                        background-color: #fff !important;
                    }
                    th {
                        background-color: #e0e0e0 !important; /* Light grey header background */
                    }
                }
            </style>
        </head>
        <body>
            <h1>Data Dictionary Report</h1>
            <div class="meta-info">
                <p><strong>Dictionary Name:</strong> ${dictionaryName}</p>
                <p><strong>Generated On:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <h2>Validation Rules</h2>
            <table>
                <thead>
                    <tr>
                        <th>Column Name</th>
                        <th>Validation Type</th>
                        <th>Validation Value</th>
                        <th>Failure Message</th>
                    </tr>
                </thead>
                <tbody>
    `;

    rules.forEach(rule => {
        printContent += `
            <tr>
                <td>${rule['Column Name'] || ''}</td>
                <td>${rule['Validation Type'] || ''}</td>
                <td>${rule['Validation Value'] || ''}</td>
                <td>${rule['Failure Message'] || ''}</td>
            </tr>
        `;
    });

    printContent += `
                </tbody>
            </table>
            <h2>Source Headers</h2>
            <p>This dictionary was built from the following original headers:</p>
            <ul>
    `;

    currentHeaders.forEach(header => {
        printContent += `<li>${header}</li>`;
    });

    printContent += `
            </ul>
        </body>
        </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    // No setTimeout to remove, as the window is external and closed by user/browser after print.
}


/**
 * Resets the builder UI to its initial state (showing selection options).
 */
function resetBuilderUI() {
    currentHeaders = [];
    currentDictionaryId = null;
    uploadedOriginalFileName = null;
    isEditingExistingDictionary = false;

    document.getElementById('dictionaryName').value = '';
    document.querySelector('#headersTable tbody').innerHTML = ''; // Clear table
    document.getElementById('saveDictionaryBtn').disabled = true; // Disable save until headers are present
    document.getElementById('printDictionaryBtn').disabled = true; // Disable print button
    document.getElementById('deleteDictionaryBtn').classList.add('hidden'); // Hide delete

    document.getElementById('initialSelectionSection').classList.remove('hidden');
    document.getElementById('dictionaryBuilderSection').classList.add('hidden');

    // Clear status messages for both sections
    displayMessage('existingDictStatus', '', 'info');
    displayMessage('newDictStatus', '', 'info');
    displayMessage('saveStatus', '', 'info');
}

// --- Event Listeners and Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify user's authentication token
    const userData = await verifyToken();
    if (userData) {
        // 2. Set up navigation links (e.g., profile name, logout)
        setupNavigation(userData);
        // 3. Populate the "Load Existing Dictionary" dropdown
        await populateExistingDictionariesDropdown();
    }

    // 4. Attach event listeners to buttons and file inputs
    document.getElementById('loadExistingDictionaryBtn').addEventListener('click', loadDictionaryForEditing);
    document.getElementById('createNewDictionaryBtn').addEventListener('click', startNewDictionaryFromUpload);
    document.getElementById('saveDictionaryBtn').addEventListener('click', saveDataDictionary);
    document.getElementById('deleteDictionaryBtn').addEventListener('click', deleteDataDictionary);
    document.getElementById('printDictionaryBtn').addEventListener('click', handlePrintDictionary); // Attach print handler

    // Listener to clear old status messages when selecting a different existing dictionary
    document.getElementById('existingDictionarySelect').addEventListener('change', () => {
        displayMessage('existingDictStatus', '', 'info');
    });

    // Listener to clear new dict status message when selecting a file
    document.getElementById('excelFile').addEventListener('change', () => {
        displayMessage('newDictStatus', '', 'info');
    });

    // Handle initial reset/display of UI
    resetBuilderUI(); // Call once on load to ensure proper initial state
});
