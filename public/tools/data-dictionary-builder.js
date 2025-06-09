// public/tools/data-dictionary-builder.js

// --- Global Variables ---
let currentHeaders = []; // Stores headers extracted from the uploaded file
let originalFileId = null; // Stores the ID of the new data dictionary file saved to the server
let uploadedOriginalFileName = null; // Stores the name of the original file for display/reference

// NEW: Stores column names that already have rules defined in existing data dictionaries
let existingDataDictionaryColumns = new Set();


// --- Helper Functions (reused from other tools) ---

function showLoader() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('uploadStatus').classList.add('hidden');
    document.getElementById('saveStatus').classList.add('hidden');
    // Disable relevant buttons while loading
    document.getElementById('loadHeadersBtn').disabled = true;
    document.getElementById('saveDictionaryBtn').disabled = true;
    document.getElementById('deleteOriginalFileBtn').disabled = true;
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
    // Re-enable buttons
    document.getElementById('loadHeadersBtn').disabled = false;
    // Only enable save/delete if the builder section is visible
    if (!document.getElementById('dictionaryBuilderSection').classList.contains('hidden')) {
        document.getElementById('saveDictionaryBtn').disabled = false;
        // The delete button's visibility is managed by saveDataDictionary()
    }
}

function displayMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden', 'text-red-600', 'text-green-600', 'text-gray-600');
        if (type === 'error') {
            element.classList.add('text-red-600');
        } else if (type === 'success') {
            element.classList.add('text-green-600');
        } else {
            element.classList.add('text-gray-600');
        }
        element.classList.remove('hidden');
    }
}

// --- Authentication and Navigation (reused from other tools) ---

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

function setupNavigation(userData) {
    const profileLink = document.getElementById('profileLink');
    if (profileLink && userData) {
        profileLink.textContent = `Hello, ${userData.username}`;
        profileLink.href = '#';
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

// --- NEW: Load Existing Data Dictionary Rules ---

/**
 * Fetches all existing data dictionaries for the company and populates
 * a Set of column names that already have rules defined.
 */
async function loadExistingDataDictionaryRules() {
    const token = localStorage.getItem('jwtToken');
    if (!token) return;

    existingDataDictionaryColumns.clear(); // Clear previous state

    try {
        // First, get a list of all files, including data dictionaries
        const listResponse = await fetch('/api/list-files', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!listResponse.ok) {
            throw new Error(`Failed to list files: ${listResponse.statusText}`);
        }
        const listResult = await listResponse.json();
        const allFiles = listResult.files || []; // Ensure it's an array

        // Filter for data dictionaries
        const dataDictionaries = allFiles.filter(file => file.is_data_dictionary === true);

        // For each data dictionary, fetch its content (the rules)
        for (const dict of dataDictionaries) {
            try {
                const getFileResponse = await fetch(`/api/get-file?id=${dict.id}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!getFileResponse.ok) {
                    console.warn(`Could not retrieve rules for dictionary ID ${dict.id}: ${getFileResponse.statusText}`);
                    continue; // Skip to next dictionary
                }
                const fileContent = await getFileResponse.json();
                
                // fileContent.fileData is base64 encoded. Decode it.
                const decodedData = atob(fileContent.fileData); // Decode base64 to string
                const rules = JSON.parse(decodedData); // Parse the JSON string to get the rules array

                // Add column names from these rules to our set
                rules.forEach(rule => {
                    // Consider a column "defined" only if it has an active validation type
                    if (rule['Column Name'] && rule['Validation Type'] && rule['Validation Type'].trim() !== '' && rule['Validation Type'].trim().toLowerCase() !== 'none') {
                        existingDataDictionaryColumns.add(String(rule['Column Name']).trim().toLowerCase()); // Store in lowercase for case-insensitive comparison
                    }
                });
            } catch (error) {
                console.error(`Error processing data dictionary ${dict.id}:`, error);
                // Continue to process other dictionaries
            }
        }
        console.log('Existing columns with defined rules:', existingDataDictionaryColumns);

    } catch (error) {
        console.error('Error loading existing data dictionary rules:', error);
        displayMessage('uploadStatus', 'Could not load existing dictionary rules. Please check your connection.', 'error');
    }
}


// --- Core Logic: File Upload and Header Extraction ---

async function handleFileUpload() {
    const excelFile = document.getElementById('excelFile').files[0];
    if (!excelFile) {
        displayMessage('uploadStatus', 'Please select an Excel or CSV file.', 'error');
        return;
    }

    showLoader();
    displayMessage('uploadStatus', `Extracting headers from ${excelFile.name}...`, 'info');
    uploadedOriginalFileName = excelFile.name; // Store for later reference

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length === 0) {
                displayMessage('uploadStatus', 'File is empty or contains no data.', 'error');
                hideLoader();
                return;
            }
            
            let extractedHeaders = jsonData[0] || []; // Get the first row as headers

            if (extractedHeaders.length === 0) {
                displayMessage('uploadStatus', 'No headers found in the first row of the file.', 'error');
                hideLoader();
                return;
            }

            // NEW: Filter out headers that already have rules defined
            const filteredHeaders = extractedHeaders.filter(header => {
                // Keep the header if it's NOT in our set of existing columns
                // Compare in lowercase for case-insensitivity
                return !existingDataDictionaryColumns.has(String(header).trim().toLowerCase());
            });

            // Keep track of original headers for the form, even if filtered
            currentHeaders = filteredHeaders;

            if (filteredHeaders.length === 0) {
                displayMessage('uploadStatus', 'All headers in this file already have rules defined in your existing dictionaries. No new rules to build.', 'info');
                document.getElementById('dictionaryBuilderSection').classList.add('hidden');
                document.getElementById('saveDictionaryBtn').disabled = true; // Disable save button
                document.getElementById('deleteOriginalFileBtn').classList.add('hidden');
                hideLoader();
                return;
            }

            // Display message about filtered columns if any
            const skippedCount = extractedHeaders.length - filteredHeaders.length;
            if (skippedCount > 0) {
                displayMessage('uploadStatus', `Headers loaded for ${excelFile.name}. ${skippedCount} column(s) were skipped as rules already exist for them. Define rules for new columns below.`, 'success');
            } else {
                displayMessage('uploadStatus', `Headers loaded for ${excelFile.name}. Define your rules.`, 'success');
            }
            
            renderHeadersTable(filteredHeaders); // Render table with only new headers
            document.getElementById('dictionaryBuilderSection').classList.remove('hidden');
            document.getElementById('dictionaryName').value = uploadedOriginalFileName.replace(/\.(xlsx|xls|csv)$/i, '') + ' Dictionary'; // Suggest a name
            
        } catch (error) {
            console.error('Error processing file for headers:', error);
            displayMessage('uploadStatus', 'Error reading or parsing file. Please ensure it is a valid Excel/CSV.', 'error');
            document.getElementById('dictionaryBuilderSection').classList.add('hidden');
        } finally {
            hideLoader();
        }
    };
    reader.readAsArrayBuffer(excelFile);
}

// --- Core Logic: Render Headers Table for Rule Definition (unchanged, as it receives filtered headers) ---

function renderHeadersTable(headers) {
    const tbody = document.querySelector('#headersTable tbody');
    tbody.innerHTML = ''; // Clear existing rows

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
        valueInput.classList.add('hidden-rule-value'); // Initially hidden
        valueCell.appendChild(valueInput);
        valueCell.appendChild(document.createElement('div')).classList.add('rule-description'); // For dynamic hints

        const messageCell = row.insertCell();
        const messageInput = document.createElement('input');
        messageInput.type = 'text';
        messageInput.classList.add('failure-message-input', 'mt-1', 'block', 'w-full', 'p-2', 'border', 'border-gray-300', 'rounded-md', 'focus:ring-green-500', 'focus:border-green-500', 'text-gray-800');
        messageInput.name = `message_${index}`;
        messageInput.placeholder = 'e.g., Field cannot be blank.';
        messageCell.appendChild(messageInput);

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

// --- Core Logic: Save Data Dictionary (unchanged) ---

async function saveDataDictionary() {
    const dictionaryName = document.getElementById('dictionaryName').value.trim();
    if (!dictionaryName) {
        displayMessage('saveStatus', 'Please provide a name for your data dictionary.', 'error');
        return;
    }

    showLoader();
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
                'Validation Value': validationValue || null, // Use null if empty
                'Failure Message': failureMessage || null // Use null if empty
            };
            rulesData.push(rule);
        }
    });

    if (!hasRules) {
        displayMessage('saveStatus', 'Please define at least one validation rule.', 'error');
        hideLoader();
        return;
    }

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        displayMessage('saveStatus', 'Authentication failed. Please log in again.', 'error');
        hideLoader();
        return;
    }

    try {
        const response = await fetch('/api/save-data-dictionary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                dictionaryName: dictionaryName,
                rules: rulesData // Send the array of rule objects
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save data dictionary.');
        }

        const result = await response.json();
        originalFileId = result.fileId; // Store the ID of the new dictionary file in DB
        displayMessage('saveStatus', 'Data Dictionary saved successfully! You can now use it in the Excel Validate tool.', 'success');
        document.getElementById('deleteOriginalFileBtn').classList.remove('hidden'); // Show delete button for original upload
        // Update the button's text to indicate what it deletes
        document.getElementById('deleteOriginalFileBtn').textContent = `Delete This Data Dictionary ("${dictionaryName}")`;

        // After saving, re-load existing rules so the next file upload benefits from the newly saved dictionary
        await loadExistingDataDictionaryRules();

    } catch (error) {
        console.error('Error saving data dictionary:', error);
        displayMessage('saveStatus', `Error saving data dictionary: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

// --- Core Logic: Delete Original Uploaded File (or Data Dictionary) ---

async function deleteOriginalFile() {
    const fileIdToDelete = originalFileId; // This refers to the ID of the Data Dictionary just saved
    const dictionaryName = document.getElementById('dictionaryName').value.trim();

    if (!fileIdToDelete) {
        displayMessage('saveStatus', 'No data dictionary to delete. Please save a dictionary first.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete the data dictionary "${dictionaryName}"? This action cannot be undone.`)) {
        return;
    }

    showLoader();
    displayMessage('saveStatus', 'Deleting data dictionary...', 'info');

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        displayMessage('saveStatus', 'Authentication failed. Please log in again.', 'error');
        hideLoader();
        return;
    }

    try {
        const response = await fetch(`/api/delete-file?id=${fileIdToDelete}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete file.');
        }

        displayMessage('saveStatus', 'Data dictionary deleted successfully!', 'success');
        document.getElementById('deleteOriginalFileBtn').classList.add('hidden'); // Hide button after deletion
        originalFileId = null; // Clear stored ID

        // Reset form for new dictionary
        document.getElementById('excelFile').value = '';
        document.getElementById('dictionaryBuilderSection').classList.add('hidden');
        document.getElementById('uploadStatus').classList.remove('hidden');
        document.getElementById('uploadStatus').textContent = 'Ready to build another dictionary.';
        document.getElementById('dictionaryName').value = '';
        document.querySelector('#headersTable tbody').innerHTML = ''; // Clear table
        
        // After deleting, re-load existing rules to update the filter for future uploads
        await loadExistingDataDictionaryRules();

    } catch (error) {
        console.error('Error deleting file:', error);
        displayMessage('saveStatus', `Error deleting file: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}


// --- Event Listeners and Initial Load ---

document.addEventListener('DOMContentLoaded', async () => {
    const userData = await verifyToken();
    if (userData) {
        setupNavigation(userData);
        await loadExistingDataDictionaryRules(); // NEW: Load existing rules on page load
    }

    document.getElementById('loadHeadersBtn').addEventListener('click', handleFileUpload);
    document.getElementById('saveDictionaryBtn').addEventListener('click', saveDataDictionary);
    document.getElementById('deleteOriginalFileBtn').addEventListener('click', deleteOriginalFile);
});
