// netlify/functions/test-function.js
exports.handler = async (event, context) => {
  console.log("Test function invoked!");
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from a simple test function!" }),
  };
};
