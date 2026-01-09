const express = require('express');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- MIDDLEWARE : AUTHENTIFICATION PAR PIN (Header x-pin) ---
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
        res.status(500).json({ error: "Erreur lors de la vérification du PIN." });
    }
};

// --- ROUTES CLIENTS ---

/**
 * 1. CRÉATION DE WALLET (Validation format + Âge 16 ans)
 */
app.post('/wallet/create', async (req, res) => {
    const { firstName, lastName, phoneNumber, dateOfBirth, pin } = req.body;

    const haitiPhoneRegex = /^509[0-9]{8}$/;
    if (!haitiPhoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: "Le numéro doit être au format 509XXXXXXXX." });
    }

    const birthDate = new Date(dateOfBirth);
    const age = (new Date() - birthDate) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 16) {
        return res.status(400).json({ error: "L'utilisateur doit avoir au moins 16 ans." });
    }

    try {
        const id = uuidv4();
        await db.query(
            "INSERT INTO Wallets (id, firstName, lastName, phoneNumber, dateOfBirth, pin, balance) VALUES (?, ?, ?, ?, ?, ?, 0)",
            [id, firstName, lastName, phoneNumber, dateOfBirth, pin]
        );
        res.status(201).json({ message: "Wallet créé avec succès", walletId: id });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la création (Numéro peut-être déjà utilisé)." });
    }
});

/**
 * 2. RECHARGE (Ledger -> Wallet avec 2% de frais)
 */
app.post('/wallet/recharge', verifyPin, async (req, res) => {
    const { phoneNumber, amount } = req.body;

    if (amount < 50 || amount > 50000) {
        return res.status(400).json({ error: "Montant doit être entre 50 et 50,000 HTG." });
    }

    const fees = amount * 0.02;
    const amountToCredit = amount - fees;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Vérification fonds Ledger
        const [ledger] = await connection.query("SELECT balance FROM Ledger WHERE id = 'LEDGER_MASTER'");
        if (ledger[0].balance < amount) {
            throw new Error("Fonds insuffisants dans le Ledger Master.");
        }

        // Mouvements
        await connection.query("UPDATE Ledger SET balance = balance - ? WHERE id = 'LEDGER_MASTER'", [amount]);
        await connection.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [amountToCredit, phoneNumber]);
        await connection.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]); // Les frais restent/retournent au Ledger

        await connection.query(
            "INSERT INTO Transactions (id, type, receiver, amount, fees, status) VALUES (?, 'RECHARGE', ?, ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, amountToCredit, fees]
        );

        await connection.commit();
        res.json({ message: "Recharge réussie", credited: amountToCredit, fees: fees });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

/**
 * 3. TRANSFERT (Wallet -> Wallet + 2% Frais)
 */
app.post('/wallet/transfer', verifyPin, async (req, res) => {
    const { phoneNumber, receiverPhone, amount } = req.body;
    const fees = amount * 0.02;
    const totalDebit = amount + fees;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [sender] = await connection.query("SELECT balance FROM Wallets WHERE phoneNumber = ?", [phoneNumber]);
        if (!sender[0] || sender[0].balance < totalDebit) {
            throw new Error("Solde insuffisant (Frais de 2% inclus).");
        }

        await connection.query("UPDATE Wallets SET balance = balance - ? WHERE phoneNumber = ?", [totalDebit, phoneNumber]);
        await connection.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [amount, receiverPhone]);
        await connection.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]);

        await connection.query(
            "INSERT INTO Transactions (id, type, sender, receiver, amount, fees, status) VALUES (?, 'TRANSFER', ?, ?, ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, receiverPhone, amount, fees]
        );

        await connection.commit();
        res.json({ message: "Transfert réussi", amountSent: amount, fees: fees });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// --- ROUTES ADMIN  ---

/**
 * 7. STATUT DU LEDGER
 */
app.get('/admin/ledger/status', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT balance, last_update FROM Ledger WHERE id = 'LEDGER_MASTER'");
        res.json({ status: "success", data: rows[0] });
    } catch (error) {
        res.status(500).json({ error: "Erreur accès Ledger." });
    }
});

/**
 * 8. HISTORIQUE DU LEDGER
 */
app.get('/admin/ledger/transactions', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
        const [rows] = await db.query("SELECT * FROM Transactions ORDER BY created_at DESC LIMIT ?", [limit]);
        res.json({ status: "success", count: rows.length, transactions: rows });
    } catch (error) {
        res.status(500).json({ error: "Erreur accès historique." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API HaitiPay Conforme sur le port ${PORT}`));