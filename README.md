HaitiPay - API de Gestion de Portefeuille Électronique
Cette application est une solution Backend robuste développée en Node.js pour le test technique de HaitiPay . Elle gère l'intégralité du cycle de vie d'un portefeuille numérique, de la création sécurisée aux transferts inter-utilisateurs avec gestion de commissions.

 Architecture Technique & Sécurité
Environnement d'exécution : Node.js (v18+)

Framework : Express.js

Base de Données : MySQL (Pool de connexions pour la stabilité).

Gestion des Secrets : Utilisation de variables d'environnement ( .env) pour protéger les accès critiques.

Identifiants : Utilisation d' UUID v4 pour garantir l'unicité mondiale de chaque transaction et utilisateur.

 Logique Métier (Conformité A à Z)
1. Inscription et KYC (Connaissance du client)
Validation 509 : Le système vérifie par Regex que le numéro commence par 509et contient 11 chiffres au total.

Majorité Financière : Une vérification dynamique bloque la création de compte pour toute personne de moins de 16 ans .

2. Le Système de Ledger (Grand Livre)
Pour garantir la traçabilité des fonds, j'ai implémenté un système de double écriture :

L'argent injecté dans les Wallets provient d'un compte central ( LEDGER_MASTER) initialisé à 1 000 000 HTG.

Cela permet un équilibre constant entre la monnaie en circulation et les réserves de la plateforme.

3. Transferts et frais de 2%
Chaque transfert entre utilisateurs déclenche un prélèvement automatique de 2% .

Calcul : Si A envoie 100 HTG à B, A est débité de 102 HTG, B reçoit 100 HTG, et HaitiPay (le Ledger) encaisse 2 HTG.

Atomicité SQL : Utilisation de transactions ( START TRANSACTION, COMMIT, ROLLBACK) pour garantir qu'en cas de panne, aucune somme ne disparaît.

 Installation et Déploiement
Installation des dépendances :
npm install
Importer database dans Mysql
Lancement d serveur :
node app.js

udit et Maintenance
Audit Trail : La table Transactionsenregistre chaque événement avec un horodatage précis pour faciliter les réconciliations bancaires.

Sécurité Git : Cretion du  fichier .gitignore.

Développeur : Marc-Arthur Edouard Version : 1.0.0 (janvier 2026) Projet : Test technique HaitiPay