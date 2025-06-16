// This is a special function to debug the live environment on Netlify.

exports.handler = async (event, context) => {
  console.log('--- RUNNING ENVIRONMENT VARIABLE DEBUGGER ---');

  // Check if the secrets exist. The '!!' converts them to true/false.
  const jwtSecretExists = !!process.env.JWT_SECRET;
  const databaseUrlExists = !!process.env.DATABASE_URL;

  // For security, we will NEVER log the actual secret values.
  // We will only check their length if they exist.
  const secretLength = process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0;
  
  // We can safely check the host of the database URL.
  let databaseHost = 'Not Found';
  if (process.env.DATABASE_URL) {
    try {
      databaseHost = new URL(process.env.DATABASE_URL).hostname;
    } catch (e) {
      databaseHost = 'Invalid URL format';
    }
  }

  const responsePayload = {
    message: 'Live Environment Variable Check',
    jwtSecretExists: jwtSecretExists,
    jwtSecretLength: secretLength,
    databaseUrlExists: databaseUrlExists,
    databaseHost: databaseHost,
  };

  console.log('Debug Payload:', responsePayload);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(responsePayload, null, 2),
  };
};
