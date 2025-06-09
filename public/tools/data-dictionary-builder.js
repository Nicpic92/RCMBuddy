// public/tools/data-dictionary-builder.js

// --- Global Variables ---
let currentHeaders = []; // Stores headers extracted from the uploaded file
let originalFileId = null; // Stores the ID of the original file if uploaded to the server
let uploadedOriginalFileName = null; // Stores the name of the original file for display/reference

// --- Helper Functions (reused from other tools) ---

function showLoader() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('uploadStatus').classList.add('hidden');
    document.getElementById('saveStatus').classList.add('hidden');
    document.getElementById('loadHeadersBtn').disabled = true;
    document.getElementById('saveDictionaryBtn').disabled = true;
    document.getElementById('deleteOriginalFileBtn').disabled = true;
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
    document.getElementById('loadHeadersBtn').disabled = false;
    document.getElementById('saveDictionaryBtn').disabled = false; // Enable Save after load
    document.getElementById('deleteOriginalFileBtn').disabled = false; // Enable Delete after load
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
            // Get headers from the first row
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length === 0) {
                displayMessage('uploadStatus', 'File is empty or contains no data.', 'error');
                hideLoader();
                return;
            }
            
            currentHeaders = jsonData[0] || []; // Store the first row as headers

            if (currentHeaders.length === 0) {
                displayMessage('uploadStatus', 'No headers found in the first row of the file.', 'error');
                hideLoader();
                return;
            }

            // Optional: Upload the file to server immediately if you want it tracked/deleted
            // This is a design choice. For now, we assume local processing first.
            // If you want to upload it, you'd call a similar /api/upload-file here
            // and store the returned originalFileId.
            // For now, originalFileId will only be set if you later add an explicit "Upload Original File" step.
            // We'll add a placeholder if you decide to implement this.

            renderHeadersTable(currentHeaders);
            document.getElementById('dictionaryBuilderSection').classList.remove('hidden');
            document.getElementById('dictionaryName').value = uploadedOriginalFileName.replace(/\.(xlsx|xls|csv)$/i, '') + ' Dictionary'; // Suggest a name
            displayMessage('uploadStatus', `Headers loaded for ${excelFile.name}. Now define your rules.`, 'success');
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

// --- Core Logic: Render Headers Table for Rule Definition ---

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

            // For REQUIRED, DATE_PAST, UNIQUE, no value input is needed.
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

// --- Core Logic: Save Data Dictionary ---

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
        document.getElementById('deleteOriginalFileBtn').setAttribute('data-original-file-id', originalFileId); // Store the ID on the button
        document.getElementById('deleteOriginalFileBtn').textContent = `Delete Original Uploaded File (${uploadedOriginalFileName})`; // Update button text

    } catch (error) {
        console.error('Error saving data dictionary:', error);
        displayMessage('saveStatus', `Error saving data dictionary: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

// --- Core Logic: Delete Original Uploaded File ---

async function deleteOriginalFile() {
    const fileIdToDelete = originalFileId; // Use the stored ID of the dictionary just created
    // Or, if you implemented uploading the *original* file to the server and got its ID, use that instead.
    // For now, originalFileId refers to the new data dictionary file itself.
    // If you want to delete the *source* file, you'd need to first upload it to the server
    // (e.g., in handleFileUpload) and store its ID in a separate global variable.

    if (!fileIdToDelete) {
        displayMessage('saveStatus', 'No file ID to delete. Please save a dictionary first or upload an original file.', 'error');
        return;
    }

    // For now, this button will delete the Data Dictionary file itself.
    // If your intent was to delete the *source Excel file* that you used to BUILD the dictionary,
    // you would need to:
    // 1. Modify handleFileUpload() to ALSO upload the source Excel file to the DB (using your /api/upload-file).
    // 2. Store that *source file's* ID in a separate global variable (e.g., `sourceExcelFileId`).
    // 3. Change this function to use `sourceExcelFileId`.
    // Given the current flow, this button will delete the *newly created Data Dictionary file*.
    // This is a design decision you need to clarify. Let's assume it deletes the dictionary for now.

    if (!confirm(`Are you sure you want to delete the data dictionary "${document.getElementById('dictionaryName').value}"?`)) {
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
        document.getElementById('excelFile').value = ''; // Clear file input
        document.getElementById('dictionaryBuilderSection').classList.add('hidden'); // Hide builder section
        document.getElementById('uploadStatus').classList.remove('hidden'); // Show initial upload status
        document.getElementById('uploadStatus').textContent = 'Ready to build another dictionary.';
        document.getElementById('dictionaryName').value = '';

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
    }

    document.getElementById('loadHeadersBtn').addEventListener('click', handleFileUpload);
    document.getElementById('saveDictionaryBtn').addEventListener('click', saveDataDictionary);
    document.getElementById('deleteOriginalFileBtn').addEventListener('click', deleteOriginalFile);
});
