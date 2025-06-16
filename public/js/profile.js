// public/js/profile.js

// This function will be called from the <body> onload after verifyAndSetupUser has run
async function initProfilePage(user) {
    // Check if user object is available (passed from verifyAndSetupUser)
    if (!user) {
        // Fallback if user is null/undefined, auth.js should ideally handle redirect
        console.error("User data not available for initProfilePage. Redirecting.");
        window.location.href = '/index.html'; // Fallback redirect
        return;
    }

    // Populate profile details
    document.getElementById('profileUsername').textContent = user.username || 'N/A';
    document.getElementById('profileEmail').textContent = user.email || 'N/A';
    document.getElementById('profileCompanyName').textContent = user.company_name || 'N/A'; // company_name from /api/protected
    
    if (user.created_at) {
        const date = new Date(user.created_at);
        document.getElementById('profileMemberSince').textContent = date.toLocaleDateString() || 'N/A';
    } else {
        document.getElementById('profileMemberSince').textContent = 'N/A';
    }

    // You can add more profile-specific logic here if needed
}
