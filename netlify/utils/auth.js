// netlify/utils/auth.js
const jwt = require('jsonwebtoken');

// This function checks the token and ensures the user is a company_admin
function requireAdmin(event) {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        throw { statusCode: 401, message: 'Authorization header required.' };
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
        throw { statusCode: 401, message: 'Token required.' };
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.role !== 'company_admin') {
            throw { statusCode: 403, message: 'Forbidden: Admin access required.' };
        }
        
        // Return the decoded payload (contains userId, companyId, etc.)
        return decoded; 
    } catch (error) {
        if (error.statusCode) throw error; // Re-throw our custom errors
        throw { statusCode: 401, message: 'Invalid or expired token.' };
    }
}

module.exports = { requireAdmin };
