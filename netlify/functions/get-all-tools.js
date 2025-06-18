const { createDbClient } = require('./db');
const { verifyToken, hasRole } = require('./auth');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    const token = event.headers.authorization ? event.headers.authorization.split(' ')[1] : null;
    if (!token) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authentication required' }),
        };
    }

    try {
        const user = verifyToken(token);

        // Check for superadmin role
        if (!hasRole(user, 'superadmin')) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Forbidden: Insufficient role permissions' }),
            };
        }

        const client = createDbClient();
        await client.connect();

        const result = await client.query('SELECT id, name, identifier, display_name, description, is_global FROM tools ORDER BY display_name ASC');
        const tools = result.rows;

        await client.end();

        return {
            statusCode: 200,
            body: JSON.stringify({ tools }),
        };

    } catch (error) {
        console.error('Error fetching tools:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to fetch tools', error: error.message }),
        };
    }
};
