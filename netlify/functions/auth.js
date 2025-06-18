// netlify/functions/auth.js

const jwt = require('jsonwebtoken');
const { handler: loginHandler } = require('./login');
const { handler: registerHandler } = require('./register');

/**
 * Verifies the JWT token from the request headers.
 * @param {Object} event - The Netlify Function event object.
 * @returns {Object} An object containing statusCode and user data if successful, or an error response.
 */
const verifyToken = (event) => {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing.' }),
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Token missing from Authorization header.' }),
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            statusCode: 200,
            user: decoded,
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
const hasRole = (user, requiredRole) => {
    const roles = {
        standard: 1,
        admin: 2,
        superadmin: 3,
    };
    if (!user || !user.role || !roles[requiredRole]) {
        return false;
    }
    return roles[user.role] >= roles[requiredRole];
};

/**
 * Netlify Function handler to route authentication requests.
 */
exports.handler = async (event, context) => {
    try {
        const { httpMethod, body } = event;
        if (httpMethod !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ message: 'Method not allowed.' }),
            };
        }

        const parsedBody = body ? JSON.parse(body) : {};

        // Route to registerHandler if email or company_name is present
        if (parsedBody.email || parsedBody.company_name) {
            if (!parsedBody.username || !parsedBody.email || !parsedBody.password || !parsedBody.company_name) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Username, email, password, and company name are required for registration.' }),
                };
            }
            return await registerHandler(event, context);
        }

        // Route to loginHandler if identifier is present
        if (parsedBody.identifier) {
            if (!parsedBody.password) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Identifier and password are required for login.' }),
                };
            }
            return await loginHandler(event, context);
        }

        // Handle token verification
        if (event.path.includes('/verify')) {
            const result = verifyToken(event);
            return {
                statusCode: result.statusCode,
                body: result.body || JSON.stringify({ user: result.user }),
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid request. Missing required fields.' }),
        };
    } catch (error) {
        console.error('Auth handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error.' }),
        };
    }
};

exports.verifyToken = verifyToken;
exports.hasRole = hasRole;
