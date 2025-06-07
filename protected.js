// netlify/functions/protected.js
const jwt = require('jsonwebtoken');

/**
 * Netlify Function handler for a protected route.
 * Requires a valid JWT in the Authorization header (Bearer token).
 */
exports.handler = async (event, context) => {
    // Only allow GET requests for fetching data
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed'
        };
    }

    // Get the Authorization header
    const authHeader = event.headers.authorization;

    // Check if Authorization header is present
    if (!authHeader) {
        return {
            statusCode: 401, // 401 Unauthorized
            body: JSON.stringify({ message: 'Access denied. No token provided.' })
        };
    }

    // Extract the token (expecting "Bearer TOKEN")
    const token = authHeader.split(' ')[1];

    // If no token part found after 'Bearer'
    if (!token) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Access denied. Token format is "Bearer [token]".' })
        };
    }

    try {
        // Verify the token using the secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // If verification is successful, the token is valid.
        // You can now access user data from the decoded token (e.g., decoded.id, decoded.username).
        // In a real application, you might fetch fresh user data from the DB here if needed,
        // but for a simple example, the decoded data is sufficient.

        return {
            statusCode: 200, // 200 OK
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: `Welcome, ${decoded.username}! You have access to protected data.`,
                user: {
                    id: decoded.id,
                    username: decoded.username,
                    email: decoded.email
                }
            })
        };

    } catch (error) {
        // Log the error for debugging (e.g., token expired, invalid signature)
        console.error('Token verification error:', error.message);

        // Handle different JWT errors
        let errorMessage = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Token expired. Please log in again.';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Invalid token signature.';
        }

        return {
            statusCode: 403, // 403 Forbidden (token is present but invalid/expired)
            body: JSON.stringify({ message: errorMessage })
        };
    }
};
