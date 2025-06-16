// public/js/admin.js

const API_BASE = '/.netlify/functions'; // Or '/api' if you use the redirect

// Global caches for dropdowns and lists
let allCompanyUsers = [];
let availableToolsForAssignment = [];
let allCompanies = []; // Superadmin only
let allTools = [];     // Superadmin only

// Element references
const adminContent = document.getElementById('admin-content');
const loader = document.getElementById('loader-container');
const authError = document.getElementById('auth-error');
const userListDiv = document.getElementById('user-list');
const assignUserSelect = document.getElementById('assign-user-select');
const assignToolsMultiselect = document.getElementById('assign-tools-multiselect');
const companyDefaultToolsMultiselect = document.getElementById('company-default-tools-multiselect');
const superadminSection = document.getElementById('superadmin-section');
const assignCompanySelect = document.getElementById('assign-company-select');
const assignCompToolSelect = document.getElementById('assign-comp-tool-select');


// --- Dashboard Initialization Function (called from admin.html onload) ---
async function initAdminPage(user) {
    if (!user) {
        // This case should ideally be handled by verifyAndSetupUser redirecting
        authError.textContent = 'User data not available. Please log in again.';
        authError.classList.remove('hidden');
        loader.classList.add('hidden');
        return;
    }

    try {
        // 1. Check if user has admin/superadmin role
        if (user.role !== 'admin' && user.role !== 'superadmin') {
            authError.textContent = 'Access Denied: You do not have administrator privileges.';
            authError.classList.remove('hidden');
            loader.classList.add('hidden');
            return;
        }

        // Display admin sections
        adminContent.style.display = 'grid'; // Show the main admin content grid
        loader.classList.add('hidden'); // Hide loader

        // If superadmin, show superadmin section and load its specific data
        if (user.role === 'superadmin') {
            superadminSection.classList.remove('hidden');
            await loadAllCompaniesForSuperadmin();
            await loadAllToolsForSuperadmin();
        }

        // Load initial data for admin sections (common for admin/superadmin)
        await loadCompanyUsers();
        await loadAvailableToolsForAssignment(); // Load tools *before* loading company defaults
        await loadCompanyDefaultTools(user.company_id);


    } catch (error) {
        console.error('Error in initAdminPage:', error);
        authError.textContent = `An error occurred: ${error.message}. Please try again or contact support.`;
        authError.classList.remove('hidden');
        loader.classList.add('hidden');
        // Basic error handling for frontend, auth.js handles token removal/redirect
    }
}


// --- Message Display Helpers ---
function displayFormMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `mt-4 text-center ${type === 'error' ? 'text-red-700' : (type === 'success' ? 'text-green-700' : 'text-gray-700')}`;
        element.classList.remove('hidden');
    }
}
function hideFormMessage(elementId) {
    document.getElementById(elementId).classList.add('hidden');
}


// --- Admin/Superadmin Data Loaders ---

// Function to load company users for "Manage Users" and "Assign Tools" sections
async function loadCompanyUsers() {
    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/admin/get-company-users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            allCompanyUsers = data.users;
            userListDiv.innerHTML = ''; // Clear existing list
            assignUserSelect.innerHTML = '<option value="">-- Select a User --</option>'; // Clear existing dropdown

            if (allCompanyUsers.length > 0) {
                allCompanyUsers.forEach(user => {
                    const userItem = document.createElement('div');
                    userItem.className = 'user-list-item';
                    const userStatusClass = user.is_active ? 'active' : 'inactive';
                    const userStatusText = user.is_active ? 'Active' : 'Inactive';

                    userItem.innerHTML = `
                        <div class="user-info">
                            <span class="font-semibold"><span class="math-inline">\{user\.username\}</span\> \(</span>{user.email}) - <span class="user-status <span class="math-inline">\{userStatusClass\}"\></span>{userStatusText}</span>
                        </div>
                        <div class="user-actions">
                            ${user.is_active ? `<button class="deactivate-btn bg-red-500 hover:bg-red-600 text-white" data-user-id="${user.id}">Deactivate</button>` : ''}
                            </div>
                    `;
                    userListDiv.appendChild(userItem);

                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = `<span class="math-inline">\{user\.username\} \(</span>{user.email}) - ${userStatusText}`;
                    assignUserSelect.appendChild(option);
                });

                // Attach event listeners for deactivate buttons (using delegation)
                userListDiv.querySelectorAll('.deactivate-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const userIdToDeactivate = e.target.dataset.userId;
                        if (confirm(`Are you sure you want to deactivate ${e.target.closest('.user-list-item').querySelector('.font-semibold').textContent}? This action cannot be undone.`)) {
                            e.target.disabled = true;
                            e.target.textContent = 'Deactivating...';
                            await deactivateUser(userIdToDeactivate);
                            e.target.disabled = false; // Re-enable in case of error
                            e.target.textContent = 'Deactivate';
                        }
                    });
                });

            } else {
                userListDiv.innerHTML = '<p class="text-gray-500 italic">No other users found in your company.</p>';
            }
        } else {
            displayFormMessage('user-manage-message', data.message || 'Failed to load users.', 'error');
        }
    } catch (error) {
        console.error('Error loading company users:', error);
        displayFormMessage('user-manage-message', 'Network error loading users.', 'error');
    }
}

// Function to load tools for "Assign Tools to User" dropdown and "Company Default Tools"
async function loadAvailableToolsForAssignment() {
    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/user-auth/get-accessible-tools`, { // Reuse get-accessible-tools
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            availableToolsForAssignment = data.tools; // This is an array of identifiers
            // Populate "Assign Tools to User" multiselect
            assignToolsMultiselect.innerHTML = ''; // Clear existing options
            if (availableToolsForAssignment.length > 0) {
                availableToolsForAssignment.forEach(toolIdentifier => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'multiselect-option';
                    optionDiv.textContent = toolIdentifier; // Display identifier
                    optionDiv.dataset.toolIdentifier = toolIdentifier;
                    optionDiv.addEventListener('click', () => {
                        optionDiv.classList.toggle('selected');
                    });
                    assignToolsMultiselect.appendChild(optionDiv);
                });
            } else {
                assignToolsMultiselect.innerHTML = '<div class="multiselect-option">No tools available to assign.</div>';
            }
        } else {
            displayFormMessage('assign-tools-message', data.message || 'Failed to load available tools.', 'error');
        }
    } catch (error) {
        console.error('Error loading available tools for assignment:', error);
        displayFormMessage('assign-tools-message', 'Network error loading tools for assignment.', 'error');
    }
}

// Function to load company default tools (for update-company-defaults)
async function loadCompanyDefaultTools(companyId) {
    try {
        const token = localStorage.getItem('jwtToken');
        // You'll need a backend function to get the current company's default tools.
        // Assuming /api/admin/get-company-defaults. This is a NEW API you'd create.
        const response = await fetch(`<span class="math-inline">\{API\_BASE\}/admin/get\-company\-defaults?companyId\=</span>{companyId}`, { // NEW API PATH
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            const currentDefaults = data.default_tools || []; // Array of identifiers
            companyDefaultToolsMultiselect.innerHTML = ''; // Clear existing options

            if (availableToolsForAssignment.length > 0) { // Reuse the list from loadAvailableToolsForAssignment
                availableToolsForAssignment.forEach(toolIdentifier => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'multiselect-option';
                    optionDiv.textContent = toolIdentifier;
                    optionDiv.dataset.toolIdentifier = toolIdentifier;
                    if (currentDefaults.includes(toolIdentifier)) {
                        optionDiv.classList.add('selected');
                    }
                    optionDiv.addEventListener('click', () => {
                        optionDiv.classList.toggle('selected');
                    });
                    companyDefaultToolsMultiselect.appendChild(optionDiv);
                });
            } else {
                companyDefaultToolsMultiselect.innerHTML = '<div class="multiselect-option">No tools available to set as default.</div>';
            }
        } else {
            displayFormMessage('company-defaults-message', data.message || 'Failed to load company defaults.', 'error');
        }
    } catch (error) {
        console.error('Error loading company default tools:', error);
        displayFormMessage('company-defaults-message', 'Network error loading company defaults.', 'error');
    }
}


// --- Superadmin Data Loaders ---

// Function to load all companies for superadmin's "Assign Tool to Company" dropdown
async function loadAllCompaniesForSuperadmin() {
    try {
        const token = localStorage.getItem('jwtToken');
        // This is a new API you'd create for superadmins
        const response = await fetch(`${API_BASE}/admin/get-all-companies`, { // NEW API PATH for superadmin
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            allCompanies = data.companies; // Array of {id, name}
            assignCompanySelect.innerHTML = '<option value="">-- Select a Company --</option>';

            allCompanies.forEach(company => {
                const option = document.createElement('option');
                option.value = company.id;
                option.textContent = company.name;
                assignCompanySelect.appendChild(option);
            });
        } else {
            displayFormMessage('assign-comp-tool-message', data.message || 'Failed to load companies for superadmin.', 'error');
        }
    } catch (error) {
        console.error('Error loading all companies for superadmin:', error);
        displayFormMessage('assign-comp-tool-message', 'Network error loading companies.', 'error');
    }
}

// Function to load all tools for superadmin's "Assign Tool to Company" dropdown
async function loadAllToolsForSuperadmin() {
    try {
        const token = localStorage.getItem('jwtToken');
        // This is a new API you'd create for superadmins
        const response = await fetch(`${API_BASE}/admin/get-all-tools`, { // NEW API PATH for superadmin
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            allTools = data.tools; // Array of {id, name, identifier, is_global}
            assignCompToolSelect.innerHTML = '<option value="">-- Select a Tool --</option>';

            allTools.forEach(tool => {
                const option = document.createElement('option');
                option.value = tool.id;
                option.textContent = `<span class="math-inline">\{tool\.name\} \(</span>{tool.identifier || 'N/A'})`;
                assignCompToolSelect.appendChild(option);
            });
        } else {
            displayFormMessage('assign-comp-tool-message', data.message || 'Failed to load tools for superadmin.', 'error');
        }
    } catch (error) {
        console.error('Error loading all tools for superadmin:', error);
        displayFormMessage('assign-comp-tool-message', 'Network error loading tools.', 'error');
    }
}


// --- Admin Form Submission Handlers ---

// Register New User
document.getElementById('register-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    displayFormMessage('register-message', 'Registering user...', 'info');

    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/user-auth/register`, { // Reusing main register API
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Admin must be authenticated
            },
            body: JSON.stringify({ username, email, password })
        });
        const data = await response.json();

        if (response.ok) {
            displayFormMessage('register-message', data.message, 'success');
            document.getElementById('register-user-form').reset();
            loadCompanyUsers(); // Refresh user list
        } else {
            displayFormMessage('register-message', data.message || 'Registration failed.', 'error');
        }
    } catch (error) {
        console.error('Register user error:', error);
        displayFormMessage('register-message', `Network error: ${error.message}`, 'error');
    }
});

// Deactivate User (Event listener added in loadCompanyUsers)
async function deactivateUser(userId) {
    displayFormMessage('user-manage-message', 'Deactivating user...', 'info');
    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/admin/deactivate-user`, {
            method: 'POST', // Or DELETE if preferred in backend
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userIdToDeactivate: userId })
        });
        const data = await response.json();

        if (response.ok) {
            displayFormMessage('user-manage-message', data.message, 'success');
            loadCompanyUsers(); // Refresh user list
        } else {
            displayFormMessage('user-manage-message', data.message || 'Deactivation failed.', 'error');
        }
    } catch (error) {
        console.error('Deactivate user error:', error);
        displayFormMessage('user-manage-message', `Network error: ${error.message}`, 'error');
    }
}

// Assign Tools to User
document.getElementById('assign-tools-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userIdToUpdate = document.getElementById('assign-user-select').value;
    const selectedTools = Array.from(document.querySelectorAll('#assign-tools-multiselect .multiselect-option.selected'))
                            .map(option => option.dataset.toolIdentifier);
    
    if (!userIdToUpdate) {
        displayFormMessage('assign-tools-message', 'Please select a user.', 'error');
        return;
    }
    displayFormMessage('assign-tools-message', 'Updating user tools...', 'info');

    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/admin/update-user-tools`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userIdToUpdate, toolIdentifiers: selectedTools })
        });
        const data = await response.json();

        if (response.ok) {
            displayFormMessage('assign-tools-message', data.message, 'success');
            document.getElementById('assign-tools-form').reset();
            loadCompanyUsers(); // Refresh user list
            // Re-select tools in multiselect for the next operation (or reset)
            document.querySelectorAll('#assign-tools-multiselect .multiselect-option').forEach(option => option.classList.remove('selected'));
        } else {
            displayFormMessage('assign-tools-message', data.message || 'Failed to update tools.', 'error');
        }
    } catch (error) {
        console.error('Assign tools error:', error);
        displayFormMessage('assign-tools-message', `Network error: ${error.message}`, 'error');
    }
});

// Save Company Defaults
document.getElementById('company-defaults-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedDefaultTools = Array.from(document.querySelectorAll('#company-default-tools-multiselect .multiselect-option.selected'))
                                    .map(option => option.dataset.toolIdentifier);
    displayFormMessage('company-defaults-message', 'Saving company defaults...', 'info');

    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/admin/update-company-defaults`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ defaultToolIdentifiers: selectedDefaultTools })
        });
        const data = await response.json();

        if (response.ok) {
            displayFormMessage('company-defaults-message', data.message, 'success');
        } else {
            displayFormMessage('company-defaults-message', data.message || 'Failed to save defaults.', 'error');
        }
    } catch (error) {
        console.error('Save company defaults error:', error);
        displayFormMessage('company-defaults-message', `Network error: ${error.message}`, 'error');
    }
});

// Superadmin: Create New Tool
document.getElementById('create-tool-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-tool-name').value;
    const description = document.getElementById('new-tool-description').value;
    const isGlobal = document.getElementById('new-tool-is-global').checked;
    displayFormMessage('create-tool-message', 'Creating new tool...', 'info');

    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/admin/create-tool`, { // Target new create-tool function
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, description, is_global: isGlobal })
        });
        const data = await response.json();

        if (response.ok) {
            displayFormMessage('create-tool-message', data.message, 'success');
            document.getElementById('create-tool-form').reset();
            loadAllToolsForSuperadmin(); // Refresh tool list for assignments
            loadAvailableToolsForAssignment(); // Refresh if this superadmin's company is using it
        } else {
            displayFormMessage('create-tool-message', data.message || 'Failed to create tool.', 'error');
        }
    } catch (error) {
        console.error('Create tool error:', error);
        displayFormMessage('create-tool-message', `Network error: ${error.message}`, 'error');
    }
});

// Superadmin: Assign Tool to Company
document.getElementById('assign-tool-to-company-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const companyId = document.getElementById('assign-company-select').value;
    const toolId = document.getElementById('assign-comp-tool-select').value;
    displayFormMessage('assign-comp-tool-message', 'Assigning tool to company...', 'info');

    if (!companyId || !toolId) {
        displayFormMessage('assign-comp-tool-message', 'Please select both a company and a tool.', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_BASE}/admin/assign-tool-to-company`, { // Target new assign-tool-to-company function
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ companyId, toolId })
        });
        const data = await response.json();

        if (response.ok) {
            displayFormMessage('assign-comp-tool-message', data.message, 'success');
            document.getElementById('assign-tool-to-company-form').reset();
            // Optionally refresh other related lists
            loadAvailableToolsForAssignment(); // Refresh if this superadmin's company is impacted
        } else {
            displayFormMessage('assign-comp-tool-message', data.message || 'Failed to assign tool to company.', 'error');
        }
    } catch (error) {
        console.error('Assign tool to company error:', error);
        displayFormMessage('assign-comp-tool-message', `Network error: ${error.message}`, 'error');
    }
});
