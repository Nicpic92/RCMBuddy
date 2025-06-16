const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { identifier, password } = JSON.parse(event.body);

  if (!identifier || !password) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Identifier and password are required.' }) };
  }

  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    // Find user by either username or email
    const result = await client.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [identifier]
    );
    await client.end();

    const user = result.rows[0];

    // 1. Check if user exists
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials.' }) };
    }

    // 2. Compare the provided password with the stored hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Invalid credentials.' }) };
    }

    // 3. Passwords match! Create a JWT.
    const token = jwt.sign(
      { userId: user.id, username: user.username }, // Payload
      process.env.JWT_SECRET,                      // Your secret key from Netlify env vars
      { expiresIn: '1d' }                          // Token expires in 1 day
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Login successful!', token: token }),
    };

  } catch (error) {
    await client.end();
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An error occurred during login.' }),
    };
  }
};
