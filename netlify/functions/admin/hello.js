// Code for: netlify/functions/admin/hello.js
exports.handler = async () => {
    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Success! The route to the admin folder is working." })
    };
};
