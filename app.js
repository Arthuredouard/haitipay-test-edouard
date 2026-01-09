const express = require('express');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- MIDDLEWARE : AUTHENTIFICATION PAR PIN (CONSIGNE x-pin) ---
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

// --- ROUTES ---

/**
 * 1. CRÉATION DE WALLET
 * Consignes : Format 509 + Âge minimum 16 ans
 */
app.post('/wallet/create', async (req, res) => {
    const { firstName, lastName, phoneNumber, dateOfBirth, pin } = req.body;

    // Validation Format 509 (Haïti)
    const haitiPhoneRegex = /^509[0-9]{8}$/;
    if (!haitiPhoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: "Le numéro doit être au format 509XXXXXXXX." });
    }

    // Validation de l'âge (Minimum 16 ans)
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
        res.status(500).json({ error: "Erreur (Numéro peut-être déjà utilisé)." });
    }
});

/**
 * 2. RECHARGE (Ledger Master -> Wallet)
 * Consignes : Limites 50 à 50,000 HTG
 */
app.post('/wallet/recharge', verifyPin, async (req, res) => {
    const { phoneNumber, amount } = req.body;

    if (amount < 50 || amount > 50000) {
        return res.status(400).json({ error: "Montant doit être entre 50 et 50,000 HTG." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Débiter le Ledger central
        await connection.query("UPDATE Ledger SET balance = balance - ? WHERE id = 'LEDGER_MASTER'", [amount]);
        // 2. Créditer le Wallet utilisateur
        await connection.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [amount, phoneNumber]);
        // 3. Tracer la transaction
        await connection.query(
            "INSERT INTO Transactions (id, type, receiver, amount, status) VALUES (?, 'RECHARGE', ?, ?, 'SUCCESS')",
            [uuidv4(), phoneNumber, amount]
        );

        await connection.commit();
        res.json({ message: "Recharge effectuée avec succès" });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: "Échec de la recharge." });
    } finally {
        connection.release();
    }
});

/**
 * 3. TRANSFERT (Wallet -> Wallet + 2% Frais Ledger)
 */
app.post('/wallet/transfer', verifyPin, async (req, res) => {
    const { phoneNumber, receiverPhone, amount } = req.body;
    const fees = amount * 0.02;
    const totalDebit = amount + fees;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Vérifier  du solde émetteur
        const [sender] = await connection.query("SELECT balance FROM Wallets WHERE phoneNumber = ?", [phoneNumber]);
        if (!sender[0] || sender[0].balance < totalDebit) {
            throw new Error("Solde insuffisant pour couvrir le transfert et les 2% de frais.");
        }

        // Mouvements  et circulation d'argent
        await connection.query("UPDATE Wallets SET balance = balance - ? WHERE phoneNumber = ?", [totalDebit, phoneNumber]);
        await connection.query("UPDATE Wallets SET balance = balance + ? WHERE phoneNumber = ?", [amount, receiverPhone]);
        await connection.query("UPDATE Ledger SET balance = balance + ? WHERE id = 'LEDGER_MASTER'", [fees]);

        // Historique
        await connection.query(
            "INSERT INTO Transactions (id, type, sender, receiver, amount, fees) VALUES (?, 'TRANSFER', ?, ?, ?, ?)",
            [uuidv4(), phoneNumber, receiverPhone, amount, fees]
        );

        await connection.commit();
        res.json({ message: "Transfert réussi", fees_applied: fees });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 HaitiPay API tourne sur le port ${PORT}`));