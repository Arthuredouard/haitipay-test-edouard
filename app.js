const express = require('express');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- MIDDLEWARE : VERIFICATION DU PIN ---
const verifyPin = async (req, res, next) => {
    const pinHeader = req.headers['x-pin'];
    const phoneNumber = req.body.phoneNumber || req.body.senderPhone;

    if (!pinHeader) return res.status(401).json({ error: "Authentification x-pin manquante" });

    try {
        const [rows] = await db.query("SELECT pin FROM Wallets WHERE phoneNumber = ?", [phoneNumber]);
        if (rows.length === 0 || rows[0].pin !== pinHeader) {
            return res.status(401).json({ error: "PIN incorrect ou compte inexistant" });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: "Erreur de securite" });
    }
};

// --- ROUTE 1 : ACCUEIL ---
app.get('/', (req, res) => {
    res.send("API HaitiPay Active");
});

// --- ROUTE 2 : STATUT DU LEDGER (ADMIN) ---
app.get('/admin/ledger/status', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT balance FROM Ledger WHERE id = 'LEDGER_MASTER'");
        res.json({ status: "success", account: "MASTER", balance: rows[0].balance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTE 3 : CREER UN WALLET ---
app.post('/wallet/create', async (req, res) => {
    const { firstName, lastName, phoneNumber, dateOfBirth, pin } = req.body;

    if (!/^509[0-9]{8}$/.test(phoneNumber)) {
        return res.status(400).json({ error: "Format invalide (Ex: 50944445555)" });
    }

    try {
        const id = uuidv4();
        await db.query(
            "INSERT INTO Wallets (id, firstName, lastName, phoneNumber, dateOfBirth, pin, balance) VALUES (?, ?, ?, ?, ?, ?, 0)",
            [id, firstName, lastName, phoneNumber, dateOfBirth, pin]
        );
        res.status(201).json({ message: "Portefeuille cree", walletId: id });
    } catch (e) {
        res.status(500).json({ error: "Erreur lors de la creation" });
    }
});

// --- ROUTE 4 : RECHARGE (CASH-IN) ---
app.post('/wallet/recharge', verifyPin, async (req, res) => {
    const { phoneNumber, amount } = req.body;
    const fees = amount * 0.02;
    const netAmount = amount - fees;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query("UPDATE Ledger SET balance = balance - ? WHERE id = 'LEDGER_MASTER'", [amount]);
        await conn.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [netAmount, phoneNumber]);
        await conn.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]);
        
        await conn.query(
            "INSERT INTO Transactions (id, type, receiver, amount, fees, status) VALUES (?, 'RECHARGE', ?, ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, netAmount, fees]
        );
        await conn.commit();
        res.json({ message: "Recharge reussie", net: netAmount, fees: fees });
    } catch (e) {
        await conn.rollback();
        res.status(400).json({ error: e.message });
    } finally {
        conn.release();
    }
});

// --- ROUTE 5 : TRANSFERT (P2P) ---
app.post('/wallet/transfer', verifyPin, async (req, res) => {
    const { phoneNumber, receiverPhone, amount } = req.body;
    const fees = amount * 0.02;
    const total = amount + fees;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [sender] = await conn.query("SELECT balance FROM Wallets WHERE phoneNumber = ?", [phoneNumber]);
        if (!sender[0] || sender[0].balance < total) throw new Error("Solde insuffisant pour couvrir les frais");

        await conn.query("UPDATE Wallets SET balance = balance - ? WHERE phoneNumber = ?", [total, phoneNumber]);
        await conn.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [amount, receiverPhone]);
        await conn.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]);

        await conn.query(
            "INSERT INTO Transactions (id, type, sender, receiver, amount, fees, status) VALUES (?, 'TRANSFER', ?, ?, ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, receiverPhone, amount, fees]
        );
        await conn.commit();
        res.json({ message: "Transfert effectue" });
    } catch (e) {
        await conn.rollback();
        res.status(400).json({ error: e.message });
    } finally {
        conn.release();
    }
});

// --- DEMARRAGE ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\nSERVEUR ACTIF`);
    console.log(` LIEN : http://127.0.0.1:${PORT}/admin/ledger/status\n`);
});