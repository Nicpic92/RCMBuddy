// public/tools/data-dictionary-builder.js

// --- Global Variables ---
let currentHeaders = []; // Stores the headers of the currently processed file/dictionary (for active sheet)
let currentDictionaryId = null; // DEPRECATED: This global is less relevant now, dictionaryId is managed per sheet in sheetRulesMap
let uploadedOriginalFileName = null; // Stores the name of the file uploaded to extract headers for a NEW dictionary
let isEditingExistingDictionary = false; // DEPRECATED: This global is less relevant now, inferred per sheet
let allExistingRulesMap = new Map(); // Stores all rules from all existing dictionaries for pre-population by column name

let currentWorkbook = null; // Stores the parsed Excel workbook object for multi-sheet validation
let currentSheetName = null; // Stores the name of the currently active sheet for rule definition

let sheetHeadersMap = new Map(); // Stores headers for each sheet: Map<sheetName, Array<headerStrings>>
// MODIFIED: sheetRulesMap now stores an object { rules: Array<ruleObjects>, dictionaryId: string | null }
let sheetRulesMap = new Map(); // Stores rules and dictionaryId for each sheet: Map<sheetName, { rules: Array<ruleObjects>, dictionaryId: string | null }>


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
    document.getElementById('printDictionaryBtn').disabled = true; // Disable print button
}

/**
 * Hides the loading spinner and enables relevant buttons/sections.
 * @param {string} targetLoaderId - The ID of the loader element to hide.
 */
function hideLoader(targetLoaderId = 'initialLoader') {
    document.getElementById(targetLoaderId).style.display = 'none';
    // Re-enable primary action buttons, save/print will be managed by table content
    document.getElementById('loadExistingDictionaryBtn').disabled = false;
    document.getElementById('createNewDictionaryBtn').disabled = false;
    // Save/print buttons re-enabled based on whether headers are loaded or existing dict is loaded
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
        profileLink.textContent = `Hello, ${userData.user.username}`;
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
 * Also populates allExistingRulesMap for pre-population feature.
 */
async function populateExistingDictionariesDropdown() {
    console.log("populateExistingDictionariesDropdown: Starting fetch."); // DEBUG
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        console.warn('populateExistingDictionariesDropdown: No token found. Cannot fetch dictionaries.');
        return;
    }

    displayMessage('existingDictStatus', 'Loading existing dictionaries...', 'info');
    const dropdown = document.getElementById('existingDictionarySelect');
    dropdown.innerHTML = '<option value="">-- Loading --</option>'; // Temporary loading message

    allExistingRulesMap = new Map(); // Clear previous map content

    try {
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
        const dataDictionaries = result.dictionaries || [];
        console.log("populateExistingDictionariesDropdown: Fetched dataDictionaries:", dataDictionaries); // DEBUG

        dropdown.innerHTML = '<option value="">-- Select an Existing Dictionary --</option>';

        let hasDataDictionaries = false;
        if (dataDictionaries.length > 0) {
            dataDictionaries.forEach(dict => {
                const option = document.createElement('option');
                option.value = dict.id;
                option.textContent = dict.name;
                dropdown.appendChild(option);

                // Populate allExistingRulesMap for pre-population
                if (dict.rules_json && Array.isArray(dict.rules_json)) {
                    dict.rules_json.forEach(rule => {
                        const colName = String(rule['Column Name'] || rule.column_name || '').trim(); // Adapt to potential old/new naming
                        if (colName && !allExistingRulesMap.has(colName)) {
                            allExistingRulesMap.set(colName, rule);
                        }
                    });
                }
            });
            hasDataDictionaries = true;
            displayMessage('existingDictStatus', `${dataDictionaries.length} dictionaries loaded.`, 'success');
        } else {
            displayMessage('existingDictStatus', 'No data dictionaries found for your company.', 'info');
            dropdown.innerHTML = '<option value="">No data dictionaries available.</option>';
        }

        dropdown.disabled = !hasDataDictionaries;
        document.getElementById('loadExistingDictionaryBtn').disabled = !hasDataDictionaries;

        console.log("populateExistingDictionariesDropdown: allExistingRulesMap populated with (size):", allExistingRulesMap.size); // DEBUG
        console.log("populateExistingDictionariesDropdown: allExistingRulesMap contents (first 5):", Array.from(allExistingRulesMap.entries()).slice(0, 5)); // DEBUG

    } catch (error) {
        console.error('populateExistingDictionariesDropdown: Network or parsing error:', error);
        displayMessage('existingDictStatus', `An unexpected error occurred: ${error.message}`, 'error');
        dropdown.innerHTML = '<option value="">-- Error --</option>';
        dropdown.disab
