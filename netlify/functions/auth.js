// netlify/functions/auth.js

const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT token from the request headers.
 * @param {Object} event - The Netlify Function event object.
 * @returns {Object} An object containing statusCode and user data if successful, or an error response.
 */
exports.verifyToken = (event) => {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing.' }),
        };
    }

    const token = authHeader.split(' ')[1]; // Expects "Bearer <token>"
    if (!token) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Token missing from Authorization header.' }),
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            statusCode: 200, // Indicate success
            user: decoded // Contains userId, username, role, companyId from JWT payload
        };
    } catch (error) {
        console.error('Token verification error:', error.message);
        if (error.name === 'TokenExpiredError') {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Token expired.' }),
            };
        }
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Invalid token.' }),
        };
    }
};

/**
 * Checks if the authenticated user has the required role.
 * @param {Object} user - The decoded user object from the JWT.
 * @param {string} requiredRole - The minimum role required ('standard', 'admin', 'superadmin').
 * @returns {boolean} True if the user has the required role or higher, false otherwise.
 */
exports.hasRole = (user, requiredRole) => {
    const roles = {
        'standard': 1,
        'admin': 2,
        'superadmin': 3
    };
    // If user or their role is undefined, or required role is invalid
    if (!user || !user.role || !roles[requiredRole]) {
        return false;
    }
    // Check if user's role level is sufficient
    return roles[user.role] >= roles[requiredRole];
};
