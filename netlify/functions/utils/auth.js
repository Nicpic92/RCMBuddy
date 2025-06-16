// netlify/functions/utils/auth.js
const jwt = require('jsonwebtoken');

exports.verifyToken = (event) => {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Authorization header missing.' }) };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Token missing.' }) };
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return { statusCode: 200, user: decoded };
    } catch (error) {
        console.error('Token verification error:', error.message);
        return { statusCode: 401, body: JSON.stringify({ message: error.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.' }) };
    }
};

exports.hasRole = (user, requiredRole) => {
    const roles = { 'standard': 1, 'admin': 2, 'superadmin': 3 };
    if (!user || !user.role || !roles[user.role] || roles[user.role] < roles[requiredRole]) {
        return false;
    }
    return true;
};
