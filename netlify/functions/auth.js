// netlify/functions/auth.js

const jwt = require('jsonwebtoken');
const { createDbClient } = require('./db'); // Adjust path if needed

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
            statusCode: 200,
            user: decoded, // Contains userId, username, role, companyId from JWT payload
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
 * Netlify Function handler for authentication-related operations.
 * Handles login, registration, or token verification based on the request.
 */
exports.handler = async (event, context) => {
    try {
        // Determine the operation based on HTTP method or path
        const { httpMethod, path, body } = event;

        // Example: Handle token verification
        if (httpMethod === 'GET' && path.includes('/verify')) {
            const result = verifyToken(event);
            return {
                statusCode: result.statusCode,
                body: result.body || JSON.stringify({ user: result.user }),
            };
        }

        // Example: Handle login
        if (httpMethod === 'POST' && path.includes('/login')) {
            const { username, password } = JSON.parse(body || '{}');
            if (!username || !password) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Username and password required.' }),
                };
            }

            // Initialize database client (adjust based on your db.js)
            const dbClient = await createDbClient();
            const user = await dbClient.queryUserByUsername(username); // Example: Implement queryUserByUsername in db.js

            if (!user || user.password !== password) { // Replace with proper password hashing
                return {
                    statusCode: 401,
                    body: JSON.stringify({ message: 'Invalid credentials.' }),
                };
            }

            // Generate JWT
            const token = jwt.sign(
                { userId: user.id, username: user.username, role: user.role, companyId: user.companyId },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            return {
                statusCode: 200,
                body: JSON.stringify({ token, user: { id: user.id, username: user.username, role: user.role } }),
            };
        }

        // Example: Handle registration
        if (httpMethod === 'POST' && path.includes('/register')) {
            const { username, password, role, companyId } = JSON.parse(body || '{}');
            if (!username || !password || !role) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Username, password, and role required.' }),
                };
            }

            const dbClient = await createDbClient();
            const existingUser = await dbClient.queryUserByUsername(username);
            if (existingUser) {
                return {
                    statusCode: 409,
                    body: JSON.stringify({ message: 'Username already exists.' }),
                };
            }

            // Insert new user (replace with actual db insert logic)
            const newUser = await dbClient.insertUser({ username, password, role, companyId }); // Implement insertUser in db.js
            const token = jwt.sign(
                { userId: newUser.id, username: newUser.username, role: newUser.role, companyId: newUser.companyId },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            return {
                statusCode: 201,
                body: JSON.stringify({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role } }),
            };
        }

        // If no matching route
        return {
            statusCode: 404,
            body: JSON.stringify({ message: 'Invalid auth route.' }),
        };
    } catch (error) {
        console.error('Auth handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error.' }),
        };
    }
};
