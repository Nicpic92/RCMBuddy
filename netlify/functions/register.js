const { Client } = require('pg');
const bcrypt = require('bcryptjs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { username, email, password, company_name } = JSON.parse(event.body);

  if (!username || !email || !password || !company_name) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Username, email, password, and company name are required.' }) };
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    // Start a transaction to ensure both operations succeed or fail together
    await client.query('BEGIN');

    // 1. Find or create the company and get its ID
    let companyResult = await client.query('SELECT id FROM companies WHERE name = $1', [company_name]);
    let companyId;

    if (companyResult.rows.length > 0) {
      companyId = companyResult.rows[0].id;
    } else {
      companyResult = await client.query('INSERT INTO companies(name) VALUES($1) RETURNING id', [company_name]);
      companyId = companyResult.rows[0].id;
    }

    // 2. Insert the new user with the company_id
    // The role defaults to 'user' in the database, so we don't need to specify it.
    const userQuery = `
      INSERT INTO users (username, email, password_hash, company_name, company_id)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await client.query(userQuery, [username, email, password_hash, company_name, companyId]);

    // Commit the transaction
    await client.query('COMMIT');

    await client.end();
    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'User registered successfully!' }),
    };
  } catch (error) {
    await client.query('ROLLBACK'); // Roll back on error
    await client.end();

    if (error.code === '23505') {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Username or email already exists.' }),
      };
    }
    console.error('Database error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Could not register user.' }),
    };
  }
};
