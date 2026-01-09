const express = require('express');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- MIDDLEWARE : AUTHENTIFICATION ---
const verifyPin = async (req, res, next) => {
    const pinHeader = req.headers['x-pin'];
    const phoneNumber = req.body.phoneNumber || req.body.senderPhone;

    if (!pinHeader) {
        return res.status(401).json({ error: "Authentification requise (Header x-pin manquant)." });
    }

    try {
        const [rows] = await db.query("SELECT pin FROM Wallets WHERE phoneNumber = ?", [phoneNumber]);
        if (rows.length === 0 || rows[0].pin !== pinHeader) {
            return res.status(401).json({ error: "Code PIN incorrect ou compte inexistant." });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: "Erreur de sécurité serveur." });
    }
};

// --- ROUTES CLIENTS ---

// 1. Création de Wallet
app.post('/wallet/create', async (req, res) => {
    const { firstName, lastName, phoneNumber, dateOfBirth, pin } = req.body;

    if (!/^509[0-9]{8}$/.test(phoneNumber)) {
        return res.status(400).json({ error: "Format invalide. Utilisez 509XXXXXXXX." });
    }

    const age = (new Date() - new Date(dateOfBirth)) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 16) {
        return res.status(400).json({ error: "Âge minimum requis : 16 ans." });
    }

    try {
        const id = uuidv4();
        await db.query(
            "INSERT INTO Wallets (id, firstName, lastName, phoneNumber, dateOfBirth, pin, balance) VALUES (?, ?, ?, ?, ?, ?, 0)",
            [id, firstName, lastName, phoneNumber, dateOfBirth, pin]
        );
        res.status(201).json({ message: "Wallet créé avec succès", walletId: id });
    } catch (e) {
        res.status(500).json({ error: "Erreur (Numéro déjà utilisé ou DB pleine)." });
    }
});

// 2. Recharge (Cash-in avec 2% de frais)
app.post('/wallet/recharge', verifyPin, async (req, res) => {
    const { phoneNumber, amount } = req.body;
    const fees = amount * 0.02;
    const netAmount = amount - fees;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [ledger] = await conn.query("SELECT balance FROM Ledger WHERE id = 'LEDGER_MASTER'");
        if (ledger[0].balance < amount) throw new Error("Fonds Ledger insuffisants.");

        await conn.query("UPDATE Ledger SET balance = balance - ? WHERE id = 'LEDGER_MASTER'", [amount]);
        await conn.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [netAmount, phoneNumber]);
        await conn.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]);

        await conn.query(
            "INSERT INTO Transactions (id, type, receiver, amount, fees, status) VALUES (?, 'RECHARGE', ?, ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, netAmount, fees]
        );

        await conn.commit();
        res.json({ message: "Recharge réussie", montant_net: netAmount, frais: fees });
    } catch (e) {
        await conn.rollback();
        res.status(400).json({ error: e.message });
    } finally {
        conn.release();
    }
});

// 3. Transfert P2P
app.post('/wallet/transfer', verifyPin, async (req, res) => {
    const { phoneNumber, receiverPhone, amount } = req.body;
    const fees = amount * 0.02;
    const totalToPay = amount + fees;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [sender] = await conn.query("SELECT balance FROM Wallets WHERE phoneNumber = ?", [phoneNumber]);
        if (!sender[0] || sender[0].balance < totalToPay) throw new Error("Solde insuffisant (Frais inclus).");

        await conn.query("UPDATE Wallets SET balance = balance - ? WHERE phoneNumber = ?", [totalToPay, phoneNumber]);
        await conn.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [amount, receiverPhone]);
        await conn.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]);

        await conn.query(
            "INSERT INTO Transactions (id, type, sender, receiver, amount, fees, status) VALUES (?, 'TRANSFER', ?, ?, ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, receiverPhone, amount, fees]
        );

        await conn.commit();
        res.json({ message: "Transfert effectué avec succès" });
    } catch (e) {
        await conn.rollback();
        res.status(400).json({ error: e.message });
    } finally {
        conn.release();
    }
});

// --- ROUTES ADMIn ---

// Route 7 : Statut du Ledger
app.get('/admin/ledger/status', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT balance FROM Ledger WHERE id = 'LEDGER_MASTER'");
        if (rows.length === 0) return res.status(404).json({ error: "Ledger non trouvé" });
        res.json({ status: "success", balance: rows[0].balance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Route 8 : Historique Ledger
app.get('/admin/ledger/transactions', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM Transactions ORDER BY createdAt DESC LIMIT 50");
        res.json({ status: "success", transactions: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API HaitiPay prête sur http://localhost:${PORT}`);
    console.log(`Vérifiez le statut ici: http://localhost:${PORT}/admin/ledger/status`);
});