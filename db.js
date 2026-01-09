const mysql = require('mysql2');
require('dotenv').config();

// Configuration du "Pool" de connexions des utilisateurs 
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 25,     // Permet jusqu'à 25 transactions simultanées
    queueLimit: 0
});

/**
 * TEST DE CONNEXION IMMÉDIAT
 * Demarrer le serveur et verificationd e si MySQL répond.
 */
pool.getConnection((err, connection) => {
    if (err) {
        console.error(" ERREUR DE CONNEXION MYSQL :");
        console.error("Détails :", err.message);
        console.log("Vérifie que XAMPP est lancé et que la DB 'haitipay_db' existe.");
    } else {
        console.log("CONNECTÉ À LA BASE DE DONNÉES HAITIPAY");
        connection.release(); // Liberation de la connexion pour les futurs clients
    }
});

//  Exportation du pool en mode "Promise" pour utiliser async/await dans app.js
module.exports = pool.promise();