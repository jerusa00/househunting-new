
const mysql = require("mysql2");

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "househunting_new_db",

    // Secure connection for TiDB Cloud
    ssl: process.env.DB_SSL === "true"
        ? { minVersion: "TLSv1.2" }
        : undefined,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
    } else {
        console.log("MySQL Database Connected Successfully!");
        connection.release();
    }
});

module.exports = db.promise();
