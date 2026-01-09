-- 1. Création de la base de données
CREATE DATABASE IF NOT EXISTS haitipay_db;
USE haitipay_db;

-- 2. Table des Wallets (Portefeuilles clients)
-- En DECIMAL pour la précision monétaire 
CREATE TABLE IF NOT EXISTS Wallets (
    id VARCHAR(50) PRIMARY KEY,
    firstName VARCHAR(100) NOT NULL,
    lastName VARCHAR(100) NOT NULL,
    phoneNumber VARCHAR(15) UNIQUE NOT NULL, -- Format +509...
    dateOfBirth DATE NOT NULL,               -- Pour la validation des 16 ans
    pin VARCHAR(4) NOT NULL,                 -- Utilisé pour x-pin
    balance DECIMAL(15, 2) DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Table du Ledger (Compte de compensation central)
CREATE TABLE IF NOT EXISTS Ledger (
    id VARCHAR(50) PRIMARY KEY,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 1000000.00
) ENGINE=InnoDB;

-- 4. Table des Transactions (Audit Trail / Traçabilité)
CREATE TABLE IF NOT EXISTS Transactions (
    id VARCHAR(50) PRIMARY KEY,
    type ENUM('RECHARGE', 'TRANSFER') NOT NULL,
    sender VARCHAR(50),                      -- NULL pour les recharges
    receiver VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    fees DECIMAL(15, 2) DEFAULT 0,           -- Pour stocker les 2%
    status VARCHAR(20) DEFAULT 'SUCCESS',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. Initialisation obligatoire du Ledger Master
-- Indispensable pour que les recharges fonctionnent immédiatement
INSERT IGNORE INTO Ledger (id, balance) VALUES ('LEDGER_MASTER', 1000000.00);