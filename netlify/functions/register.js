const { Client } = require('pg');
const bcrypt = require('bcryptjs');

exports.handler = async function(event) {
  // We only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { username, email, password, company_name } = JSON.parse(event.body);

  // Basic validation
  if (!username || !email || !password) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Username, email, and password are required.' }) };
  }

  // Hash the password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const query = `
      INSERT INTO users (username, email, password_hash, company_name)
      VALUES ($1, $2, $3, $4)
    `;
    await client.query(query, [username, email, password_hash, company_name]);
    await client.end();

    return {
      statusCode: 201, // 201 Created
      body: JSON.stringify({ message: 'User registered successfully!' }),
    };
  } catch (error) {
    await client.end();
    // Handle specific error for duplicate username/email
    if (error.code === '23505') { // 'unique_violation'
      return {
        statusCode: 409, // 409 Conflict
        body: JSON.stringify({ message: 'Username or email already exists.' }),
      };
    }
    // Generic server error
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Could not register user.' }),
    };
  }
};
