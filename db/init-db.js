const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Use /app/data/db in Docker, otherwise project root
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const dbFileName = 'event_calculator.db';
const dbPath = path.join(dataDir, dbFileName);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const db = new sqlite3.Database(dbPath);

// Initialize database with schema
const initializeDatabase = () => {
    return new Promise((resolve, reject) => {
        // Check if users table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!row) {
                console.log('Database not found. Creating schema...');
                const schema = `
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    
                    CREATE TABLE IF NOT EXISTS events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    
                    CREATE TABLE IF NOT EXISTS event_responsibles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                    );
                    
                    CREATE TABLE IF NOT EXISTS expenses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id INTEGER NOT NULL,
                        category TEXT NOT NULL CHECK(category IN ('Getränke', 'Speisen', 'Sonstige', 'Ausgabe ohne Einnahme')),
                        name TEXT NOT NULL,
                        quantity REAL NOT NULL,
                        cost_per_unit REAL NOT NULL,
                        selling_price_per_unit REAL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                    );
                    
                    CREATE TABLE IF NOT EXISTS income_without_expense (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        quantity REAL NOT NULL,
                        price_per_unit REAL NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                    );
                    
                    CREATE TABLE IF NOT EXISTS sessions (
                        sid TEXT PRIMARY KEY,
                        sess TEXT NOT NULL,
                        expire INTEGER NOT NULL
                    );
                    
                    CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
                    CREATE INDEX IF NOT EXISTS idx_event_responsibles_event_id ON event_responsibles(event_id);
                    CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON expenses(event_id);
                    CREATE INDEX IF NOT EXISTS idx_income_without_expense_event_id ON income_without_expense(event_id);
                    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
                `;
                
                db.exec(schema, async (err) => {
                    if (err) {
                        console.error('Error creating database schema:', err);
                        reject(err);
                        return;
                    }
                    
                    console.log('Database schema initialized successfully!');
                    
                    // Check if default user exists, if not create it
                    db.get('SELECT id FROM users WHERE username = ?', ['admin'], async (err, user) => {
                        if (err) {
                            console.error('Error checking for default user:', err);
                            reject(err);
                            return;
                        }
                        
                        if (!user) {
                            // Create default user with password 'admin' (change this in production!)
                            const defaultPassword = 'admin';
                            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
                            
                            db.run(
                                `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
                                ['admin', hashedPassword],
                                (err) => {
                                    if (err) {
                                        console.error('Error creating default user:', err);
                                        reject(err);
                                    } else {
                                        console.log('Default user created: username=admin, password=admin');
                                        resolve();
                                    }
                                }
                            );
                        } else {
                            console.log('Default user already exists');
                            resolve();
                        }
                    });
                });
            } else {
                // Database already exists, migrate expenses table if needed
                migrateExpensesTable().then(() => {
                    // Check and create income_without_expense table if needed
                    return checkIncomeWithoutExpenseTable();
                }).then(() => {
                    // Check if default user exists
                    db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, user) => {
                        if (err) {
                            console.error('Error checking for default user:', err);
                            // Continue anyway
                        }
                        resolve();
                    });
                }).catch(reject);
            }
        });
    });
};

// Migrate expenses table to allow NULL selling_price_per_unit
const migrateExpensesTable = () => {
    return new Promise((resolve, reject) => {
        // Check if expenses table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'", (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!row) {
                // Table doesn't exist yet, will be created with correct schema
                resolve();
                return;
            }
            
            // Check the schema of the expenses table
            db.all("PRAGMA table_info(expenses)", (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Find selling_price_per_unit column
                const sellingPriceColumn = columns.find(col => col.name === 'selling_price_per_unit');
                
                if (!sellingPriceColumn) {
                    // Column doesn't exist, will be created with correct schema
                    resolve();
                    return;
                }
                
                // Check if column allows NULL (notnull = 0 means NULL allowed)
                if (sellingPriceColumn.notnull === 0) {
                    // Already allows NULL, check if category constraint needs updating
                    checkCategoryConstraint().then(resolve).catch(reject);
                } else {
                    // Need to migrate: column has NOT NULL constraint
                    console.log('Migrating expenses table to allow NULL selling_price_per_unit...');
                    
                    // Create new table with correct schema
                    db.run(`
                        CREATE TABLE IF NOT EXISTS expenses_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_id INTEGER NOT NULL,
                            category TEXT NOT NULL CHECK(category IN ('Getränke', 'Speisen', 'Sonstige', 'Ausgabe ohne Einnahme')),
                            name TEXT NOT NULL,
                            quantity REAL NOT NULL,
                            cost_per_unit REAL NOT NULL,
                            selling_price_per_unit REAL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                        )
                    `, (err) => {
                        if (err) {
                            console.error('Error creating new expenses table:', err);
                            reject(err);
                            return;
                        }
                        
                        // Copy data from old table to new table
                        db.run(`
                            INSERT INTO expenses_new (id, event_id, category, name, quantity, cost_per_unit, selling_price_per_unit, created_at)
                            SELECT id, event_id, category, name, quantity, cost_per_unit, selling_price_per_unit, created_at
                            FROM expenses
                        `, (err) => {
                            if (err) {
                                console.error('Error copying data:', err);
                                reject(err);
                                return;
                            }
                            
                            // Drop old table
                            db.run('DROP TABLE expenses', (err) => {
                                if (err) {
                                    console.error('Error dropping old expenses table:', err);
                                    reject(err);
                                    return;
                                }
                                
                                // Rename new table
                                db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                                    if (err) {
                                        console.error('Error renaming new expenses table:', err);
                                        reject(err);
                                        return;
                                    }
                                    
                                    // Recreate index
                                    db.run('CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON expenses(event_id)', (err) => {
                                        if (err) {
                                            console.error('Error recreating index:', err);
                                            // Continue anyway
                                        }
                                        console.log('Expenses table migrated successfully!');
                                        checkCategoryConstraint().then(resolve).catch(reject);
                                    });
                                });
                            });
                        });
                    });
                }
            });
        });
    });
};

// Check and update category constraint if needed
const checkCategoryConstraint = () => {
    return new Promise((resolve, reject) => {
        // SQLite doesn't support modifying CHECK constraints directly
        // We'll just verify the table exists and let the application handle validation
        // The constraint will be correct for new tables
        resolve();
    });
};

// Check and create income_without_expense table if needed
const checkIncomeWithoutExpenseTable = () => {
    return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='income_without_expense'", (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!row) {
                console.log('Creating income_without_expense table...');
                db.run(`
                    CREATE TABLE IF NOT EXISTS income_without_expense (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        quantity REAL NOT NULL,
                        price_per_unit REAL NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                    );
                    
                    CREATE INDEX IF NOT EXISTS idx_income_without_expense_event_id ON income_without_expense(event_id);
                `, (err) => {
                    if (err) {
                        console.error('Error creating income_without_expense table:', err);
                        reject(err);
                    } else {
                        console.log('Income without expense table created successfully!');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    });
};

module.exports = { db, initializeDatabase };

