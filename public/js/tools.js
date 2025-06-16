// public/js/tools.js

const API_BASE = '/.netlify/functions'; // Or '/api' if you use the redirect

// This function will be called from the <body> onload after verifyAndSetupUser has run
async function initToolsPage(user) {
    // These elements are in tools.html itself
    const navList = document.getElementById('nav-list');
    
    // Check if user object is available (passed from verifyAndSetupUser)
    if (!user) {
        // Fallback if user is null/undefined, auth.js should ideally handle redirect
        console.error("User data not available for initToolsPage. Redirecting.");
        window.location.href = '/index.html';
        return;
    }

    // Dynamically add the "Admin Console" link if the user is an admin or superadmin
    // (This duplicates logic from dashboard.js, but keeps page-specific JS separate)
    if (user.role === 'admin' || user.role === 'superadmin') {
        const adminLinkLi = document.createElement('li');
        adminLinkLi.innerHTML = `<a href="/admin.html" class="text-blue-600 font-bold hover:underline">Admin Console</a>`;
        
        // Insert the admin link before the profile/logout elements
        const profileLinkLi = document.getElementById('profileLink').closest('li');
        if (profileLinkLi) {
            navList.insertBefore(adminLinkLi, profileLinkLi);
        } else {
            navList.appendChild(adminLinkLi);
        }
    }

    // --- Enforce Permissions: Show/Hide Tool Cards ---
    // Fetch accessible tools from the backend (same call as dashboard)
    try {
        const token = localStorage.getItem('jwtToken');
        if (!token) throw new Error('JWT token missing for tool access check.');

        const response = await fetch(`${API_BASE}/user-auth/get-accessible-tools`, { // Updated API path
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to fetch accessible tools for tools page:', response.status, errorData.message);
            // If fetch fails, default to showing all cards, or show an error message
            alert('Failed to load your tool access permissions. Displaying all tools.');
            const allToolCards = document.querySelectorAll('[data-tool-identifier]');
            allToolCards.forEach(card => card.style.display = 'block');
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
        console.error('Error in initToolsPage while checking tool permissions:', error);
        // Fallback: If any error, show all tool cards by default
        alert('An error occurred loading tool permissions. Displaying all tools.');
        const allToolCards = document.querySelectorAll('[data-tool-identifier]');
        allToolCards.forEach(card => card.style.display = 'block');
    }
}
