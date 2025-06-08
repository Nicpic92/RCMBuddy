// netlify/functions/protected.js
const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Get the Authorization header from the incoming request
    const authHeader = event.headers.authorization;

    // If no Authorization header is present, deny access
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Access denied. No token provided.' }) };
    }

    // Extract the token (assuming "Bearer TOKEN" format)
    const token = authHeader.split(' ')[1];

    // If the token is missing after "Bearer ", deny access
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Access denied. Token format is "Bearer [token]".' }) };
    }

    try {
        // Verify the token using the secret key from environment variables
        // The decoded payload now includes company_id and company_name
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // If verification is successful, the token is valid.
        // Return user details including company information.
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: `Welcome, ${decoded.username}! This is protected data for company ${decoded.company_name}.`,
                user: {
                    id: decoded.id,
                    username: decoded.username,
                    email: decoded.email,
                    company_id: decoded.company_id,      // Include company_id from JWT
                    company_name: decoded.company_name    // Include company_name from JWT
                }
            })
        };

    } catch (error) {
        // Log the error for debugging purposes in Netlify logs
        console.error('Token verification error:', error.message);

        // Handle specific JWT errors to provide clearer messages to the client
        let errorMessage = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expired. Please log in again.';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Invalid token signature.';
        }
        return { statusCode: 403, body: JSON.stringify({ message: errorMessage }) };
    }
};
