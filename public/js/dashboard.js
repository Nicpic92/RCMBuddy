// public/js/dashboard.js

// This function will be called from the <body> onload after verifyAndSetupUser has run
async function initDashboard(user) {
    // These elements are in dashboard.html itself
    const dashboardHeading = document.getElementById('dashboard-heading');
    const companyDisplay = document.getElementById('company-display');
    const navList = document.getElementById('nav-list');
    
    // Check if user object is available (passed from verifyAndSetupUser)
    if (!user) {
        // This case should ideally be handled by verifyAndSetupUser redirecting to login
        // but as a fallback, ensure UI indicates loading failure.
        dashboardHeading.textContent = 'Welcome!';
        companyDisplay.textContent = 'Please log in.';
        return;
    }

    // Update UI with user information
    // dashboardHeading text already updated with username via auth.js
    companyDisplay.textContent = `Company: ${user.company_name}`;

    // Dynamically add the "Admin Console" link if the user is an admin or superadmin
    if (user.role === 'admin' || user.role === 'superadmin') {
        const adminLinkLi = document.createElement('li');
        adminLinkLi.innerHTML = `<a href="/admin.html" class="text-blue-600 font-bold hover:underline">Admin Console</a>`;
        
        // Insert the admin link before the profile/logout elements for a nice layout
        const profileLinkLi = document.getElementById('profileLink').closest('li'); // Get the <li> containing the profile link
        if (profileLinkLi) {
            navList.insertBefore(adminLinkLi, profileLinkLi);
        } else {
            navList.appendChild(adminLinkLi); // Fallback if profileLinkLi not found
        }
    }

    // --- Enforce Permissions: Show/Hide Tool Cards ---
    // Fetch accessible tools from the backend
    try {
        const token = localStorage.getItem('jwtToken');
        if (!token) throw new Error('JWT token missing for tool access check.');

        // Calling a new backend function to get the list of tools assigned to this user's company
        // You will need to implement this new backend function `get-accessible-tools.js`
        // in `netlify/functions/user-auth/` or similar.
        const response = await fetch('/api/get-accessible-tools', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to fetch accessible tools:', response.status, errorData.message);
            // Decide how to handle this error - maybe show all tools but make them inactive
            // or alert the user. For now, we'll proceed with an empty list of accessible tools.
            showDashboardMessage('Failed to load your assigned tools. Displaying all tools.', 'error');
            const allToolCards = document.querySelectorAll('[data-tool-identifier]');
            allToolCards.forEach(card => card.style.display = 'block'); // Show all if fetch fails
            return;
        }

        const data = await response.json();
        const accessibleToolIdentifiers = data.tools || []; // Expecting an array of identifiers

        const allToolCards = document.querySelectorAll('[data-tool-identifier]');

        allToolCards.forEach(card => {
            const toolIdentifier = card.dataset.toolIdentifier;
            if (accessibleToolIdentifiers.includes(toolIdentifier)) {
                card.style.display = 'block'; // Show the card if tool is accessible
            } else {
                card.style.display = 'none'; // Hide the card if not accessible
            }
        });

    } catch (error) {
        console.error('Error in initDashboard while checking tool permissions:', error);
        // Fallback: If any error, show all tool cards by default or alert the user
        const allToolCards = document.querySelectorAll('[data-tool-identifier]');
        allToolCards.forEach(card => card.style.display = 'block');
        showDashboardMessage('An error occurred loading tool permissions. Displaying all tools.','error');
    }
}

// Helper for dashboard-specific messages
function showDashboardMessage(msg, type) {
    const dashboardMessageDiv = document.getElementById('dashboard-message-area'); // Need to add this div in HTML
    if (dashboardMessageDiv) {
        dashboardMessageDiv.className = `p-3 rounded-lg text-sm text-center ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`;
        dashboardMessageDiv.textContent = msg;
        dashboardMessageDiv.style.display = 'block';
    }
}

// Add a div for dashboard messages (if not already in HTML)
// <div id="dashboard-message-area" style="display:none;" class="mb-4"></div>
