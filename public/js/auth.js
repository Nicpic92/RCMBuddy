// public/js/auth.js

const API_BASE = '/.netlify/functions'; // Or '/api' if you use the redirect

/**
 * Verifies the JWT token stored in localStorage with the backend.
 * Redirects to login if token is missing or invalid.
 * Also stores user data in localStorage for convenience.
 * @returns {Promise<object | null>} User data if token is valid, otherwise null.
 */
async function verifyAndSetupUser() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        // console.log("No JWT token found, redirecting to login.");
        localStorage.removeItem('currentUser'); // Clear any stale user data
        window.location.href = '/index.html'; // Redirect to login page
        return null;
    }

    try {
        // Call the protected endpoint to verify token and get user data
        const response = await fetch(`${API_BASE}/protected`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Token verification failed:', response.status, errorData.message);
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('currentUser');
            // Display error message briefly before redirecting
            alert(`Session expired or invalid: ${errorData.message}. Please log in again.`);
            window.location.href = '/index.html';
            return null;
        }

        const data = await response.json();
        // console.log('User data from /protected:', data.user);
        localStorage.setItem('currentUser', JSON.stringify(data.user)); // Update current user data

        // Set up navigation elements based on user data
        const profileLink = document.getElementById('profileLink');
        const logoutBtn = document.getElementById('logoutBtn');
        const welcomeMessage = document.getElementById('welcomeMessage'); // If present on dashboard.html

        if (data.user) {
            if (profileLink) {
                profileLink.textContent = `Hello, ${data.user.username}`;
                profileLink.href = '/profile.html'; // Set actual profile page URL
            }
            if (welcomeMessage) { // For dashboard.html
                welcomeMessage.textContent = `Welcome, <span class="math-inline">\{data\.user\.username\}\! \(</span>{data.user.role})`;
            }
        }

        return data.user; // Return the user data
    } catch (error) {
        console.error('Error during user verification or setup:', error);
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('currentUser');
        alert('A network error occurred or session could not be verified. Please log in again.');
        window.location.href = '/index.html';
        return null;
    }
}

/**
 * Handles user logout.
 * Removes JWT token and user data from localStorage and redirects to login page.
 */
function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/index.html'; // Redirect to login page
}

// Attach logout functionality to the logout button (make sure this ID exists in your HTML headers)
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
    // You might want to call verifyAndSetupUser() on DOMContentLoaded here as well
    // or ensure it's called on page load from the HTML <body> onload attribute.
});

// Make functions globally accessible (optional, if you want to call them directly from HTML `onclick`)
// If using modules or IIFE, you might export them differently.
window.verifyAndSetupUser = verifyAndSetupUser;
window.logout = logout;
