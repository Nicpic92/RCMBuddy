const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.handler = async function(event) {
  // We only accept POST requests for logging in
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405, // Method Not Allowed
      body: JSON.stringify({ message: 'Only POST requests are allowed.' })
    };
  }

  const { identifier, password } = JSON.parse(event.body);

  // Basic validation to ensure we received the necessary data
  if (!identifier || !password) {
    return {
      statusCode: 400, // Bad Request
      body: JSON.stringify({ message: 'Username/email and password are required.' })
    };
  }

  // Create a new client to connect to our Neon database
  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // The query now selects all the necessary fields, including the new role and company_id
    const query = `
      SELECT id, username, email, role, company_id, password_hash 
      FROM users 
      WHERE username = $1 OR email = $1
    `;
    const result = await client.query(query, [identifier]);

    // We can close the connection as soon as we're done querying
    await client.end();

    const user = result.rows[0];

    // STEP 1: Check if a user with that username/email even exists.
    // If not, we return a generic "Invalid credentials" error to avoid revealing
    // whether a username is valid or not (a security best practice).
    if (!user) {
      return {
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ message: 'Invalid credentials.' })
      };
    }

    // STEP 2: Compare the password from the form with the hashed password in the database.
    // bcrypt.compare will securely handle this check.
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return {
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ message: 'Invalid credentials.' })
      };
    }

    // STEP 3: Authentication successful! Create a JSON Web Token (JWT).
    // The payload of the token contains the user's essential, non-sensitive data.
    // This payload can be read by the frontend to customize the UI.
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        role: user.role,                  // Crucial for frontend UI (e.g., show 'Admin Panel' button)
        companyId: user.company_id        // Crucial for admin API calls (e.g., 'get all users from *my* company')
      },
      process.env.JWT_SECRET,             // The secret key stored in Netlify environment variables
      { expiresIn: '1d' }                 // Define how long the token is valid for (e.g., 1 day)
    );

    // Return a success response with the new token
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Login successful!',
        token: token
      }),
    };

  } catch (error) {
    // If we are still connected to the DB when an error happens, ensure we disconnect.
    if (client._connected) {
      await client.end();
    }
    
    console.error('Login error:', error);
    return {
      statusCode: 500, // Internal Server Error
      body: JSON.stringify({ message: 'An unexpected error occurred during login.' })
    };
  }
};
