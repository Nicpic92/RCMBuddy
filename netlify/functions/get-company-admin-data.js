// --- Replace the OLD authenticateAdmin function inside get-company-admin-data.js with THIS ---

const authenticateAdmin = (authHeader) => {
    if (!authHeader) {
        throw new Error('Access denied. No token provided.');
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        throw new Error('Access denied. Token format is "Bearer [token]".');
    }
    
    // Verify the token is valid
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Now, we can trust the role inside the token because login.js put it there.
    if (decoded.role !== 'admin') {
        throw new Error('Forbidden. User is not an administrator.');
    }
    
    // If they are an admin, return their company ID from the token
    return { companyId: decoded.company_id };
};
