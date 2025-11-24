const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const { db, initializeDatabase } = require('./db/init-db');
const bcrypt = require('bcryptjs');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration with SQLite store
let sessionStore;
try {
    const dataDir = process.env.DATA_DIR || __dirname;
    sessionStore = new SQLiteStore({
        db: 'event_calculator.db',
        dir: dataDir,
        table: 'sessions',
        concurrentDB: true
    });
} catch (error) {
    console.error('Error creating SQLite session store:', error);
    console.log('Falling back to memory store');
    sessionStore = undefined;
}

app.use(session({
    store: sessionStore,
    secret: 'event-calculator-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Helper function to check authentication
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Routes

// Serve login page for root and /login
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/index.html');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/login.html', (req, res) => {
    if (req.session.userId) {
        res.redirect('/index.html');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

// Protect index.html - require authentication
app.get('/index.html', (req, res) => {
    if (req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Protect event-wizard.html - require authentication
app.get('/event-wizard.html', (req, res) => {
    if (req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'event-wizard.html'));
    } else {
        res.redirect('/login.html');
    }
});

// API Routes

// POST /api/login - Authenticate user
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    db.get(
        'SELECT id, username, password_hash FROM users WHERE username = ?',
        [username],
        async (err, user) => {
            if (err) {
                console.error('Error during login:', err);
                return res.status(500).json({ error: 'Login failed' });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const isValid = await bcrypt.compare(password, user.password_hash);
            
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            req.session.userId = user.id;
            req.session.username = user.username;
            
            res.json({ success: true, username: user.username });
        }
    );
});

// POST /api/logout - Logout user
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// GET /api/check-auth - Check if user is authenticated
app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true, username: req.session.username });
    } else {
        res.json({ authenticated: false });
    }
});

// GET /api/events - Get all events for user
app.get('/api/events', requireAuth, (req, res) => {
    db.all(
        `SELECT e.id, e.name, e.created_at,
                COUNT(DISTINCT er.id) as responsible_count,
                COUNT(DISTINCT exp.id) as expense_count
         FROM events e
         LEFT JOIN event_responsibles er ON e.id = er.event_id
         LEFT JOIN expenses exp ON e.id = exp.event_id
         WHERE e.user_id = ?
         GROUP BY e.id
         ORDER BY e.created_at DESC`,
        [req.session.userId],
        (err, events) => {
            if (err) {
                console.error('Error fetching events:', err);
                return res.status(500).json({ error: 'Failed to fetch events' });
            }
            
            // Calculate totals for each event
            if (events.length === 0) {
                return res.json(events);
            }
            
            const eventIds = events.map(event => event.id);
            const placeholders = eventIds.map(() => '?').join(',');
            
            // Get total expenses and income for each event
            db.all(
                `SELECT 
                    e.id as event_id,
                    COALESCE(SUM(exp.quantity * exp.cost_per_unit), 0) as total_expenses,
                    COALESCE(SUM(CASE 
                        WHEN exp.selling_price_per_unit IS NOT NULL 
                        THEN (exp.selling_price_per_unit - exp.cost_per_unit) * exp.quantity 
                        ELSE 0 
                    END), 0) as income_from_expenses,
                    COALESCE(SUM(inc.quantity * inc.price_per_unit), 0) as income_without_expenses
                 FROM events e
                 LEFT JOIN expenses exp ON e.id = exp.event_id
                 LEFT JOIN income_without_expense inc ON e.id = inc.event_id
                 WHERE e.id IN (${placeholders})
                 GROUP BY e.id`,
                eventIds,
                (err, totals) => {
                    if (err) {
                        console.error('Error calculating totals:', err);
                        // Continue without totals
                        return res.json(events);
                    }
                    
                    // Create a map of event_id -> totals
                    const totalsMap = {};
                    totals.forEach(row => {
                        totalsMap[row.event_id] = {
                            total_expenses: row.total_expenses || 0,
                            total_income: (row.income_from_expenses || 0) + (row.income_without_expenses || 0),
                            profit_loss: ((row.income_from_expenses || 0) + (row.income_without_expenses || 0)) - (row.total_expenses || 0)
                        };
                    });
                    
                    // Add totals to each event
                    events.forEach(event => {
                        const totals = totalsMap[event.id] || {
                            total_expenses: 0,
                            total_income: 0,
                            profit_loss: 0
                        };
                        event.total_expenses = totals.total_expenses;
                        event.total_income = totals.total_income;
                        event.profit_loss = totals.profit_loss;
                    });
                    
                    res.json(events);
                }
            );
        }
    );
});

// POST /api/events - Create new event
app.post('/api/events', requireAuth, (req, res) => {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Event name is required' });
    }
    
    db.run(
        'INSERT INTO events (user_id, name) VALUES (?, ?)',
        [req.session.userId, name.trim()],
        function(err) {
            if (err) {
                console.error('Error creating event:', err);
                return res.status(500).json({ error: 'Failed to create event' });
            }
            
            const eventId = this.lastID;
            
            // Fetch the created event
            db.get(
                `SELECT e.id, e.name, e.created_at,
                        COUNT(DISTINCT er.id) as responsible_count,
                        COUNT(DISTINCT exp.id) as expense_count
                 FROM events e
                 LEFT JOIN event_responsibles er ON e.id = er.event_id
                 LEFT JOIN expenses exp ON e.id = exp.event_id
                 WHERE e.id = ?
                 GROUP BY e.id`,
                [eventId],
                (err, event) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to fetch created event' });
                    }
                    
                    res.json(event);
                }
            );
        }
    );
});

// GET /api/events/:id - Get single event by ID with responsibles and expenses
app.get('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    // Verify event belongs to user
    db.get(
        'SELECT id, name, created_at FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                console.error('Error fetching event:', err);
                return res.status(500).json({ error: 'Failed to fetch event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            // Fetch responsibles
            db.all(
                'SELECT id, name FROM event_responsibles WHERE event_id = ? ORDER BY created_at ASC',
                [id],
                (err, responsibles) => {
                    if (err) {
                        console.error('Error fetching responsibles:', err);
                        return res.status(500).json({ error: 'Failed to fetch responsibles' });
                    }
                    
                    // Fetch expenses
                    db.all(
                        'SELECT id, category, name, quantity, cost_per_unit, selling_price_per_unit FROM expenses WHERE event_id = ? ORDER BY created_at ASC',
                        [id],
                        (err, expenses) => {
                            if (err) {
                                console.error('Error fetching expenses:', err);
                                return res.status(500).json({ error: 'Failed to fetch expenses' });
                            }
                            
                            // Fetch income without expense
                            db.all(
                                'SELECT id, name, quantity, price_per_unit FROM income_without_expense WHERE event_id = ? ORDER BY created_at ASC',
                                [id],
                                (err, incomeWithoutExpense) => {
                                    if (err) {
                                        console.error('Error fetching income without expense:', err);
                                        return res.status(500).json({ error: 'Failed to fetch income without expense' });
                                    }
                                    
                                    res.json({
                                        ...event,
                                        responsibles: responsibles || [],
                                        expenses: expenses || [],
                                        incomeWithoutExpense: incomeWithoutExpense || []
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// PUT /api/events/:id - Update event
app.put('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Event name is required' });
    }
    
    // Verify event belongs to user
    db.get(
        'SELECT id FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            db.run(
                'UPDATE events SET name = ? WHERE id = ?',
                [name.trim(), id],
                function(err) {
                    if (err) {
                        console.error('Error updating event:', err);
                        return res.status(500).json({ error: 'Failed to update event' });
                    }
                    
                    // Fetch updated event
                    db.get(
                        'SELECT id, name, created_at FROM events WHERE id = ?',
                        [id],
                        (err, updatedEvent) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to fetch updated event' });
                            }
                            
                            res.json(updatedEvent);
                        }
                    );
                }
            );
        }
    );
});

// DELETE /api/events/:id - Delete event
app.delete('/api/events/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    // Verify event belongs to user
    db.get(
        'SELECT id FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            db.run(
                'DELETE FROM events WHERE id = ?',
                [id],
                function(err) {
                    if (err) {
                        console.error('Error deleting event:', err);
                        return res.status(500).json({ error: 'Failed to delete event' });
                    }
                    
                    res.json({ success: true });
                }
            );
        }
    );
});

// POST /api/events/:id/responsibles - Add responsible to event
app.post('/api/events/:id/responsibles', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    // Verify event belongs to user
    db.get(
        'SELECT id FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            db.run(
                'INSERT INTO event_responsibles (event_id, name) VALUES (?, ?)',
                [id, name.trim()],
                function(err) {
                    if (err) {
                        console.error('Error adding responsible:', err);
                        return res.status(500).json({ error: 'Failed to add responsible' });
                    }
                    
                    // Fetch the created responsible
                    db.get(
                        'SELECT id, name FROM event_responsibles WHERE id = ?',
                        [this.lastID],
                        (err, responsible) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to fetch created responsible' });
                            }
                            
                            res.json(responsible);
                        }
                    );
                }
            );
        }
    );
});

// DELETE /api/events/:id/responsibles/:responsibleId - Remove responsible from event
app.delete('/api/events/:id/responsibles/:responsibleId', requireAuth, (req, res) => {
    const { id, responsibleId } = req.params;
    
    // Verify event belongs to user
    db.get(
        'SELECT id FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            // Verify responsible belongs to event
            db.get(
                'SELECT id FROM event_responsibles WHERE id = ? AND event_id = ?',
                [responsibleId, id],
                (err, responsible) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to verify responsible' });
                    }
                    
                    if (!responsible) {
                        return res.status(404).json({ error: 'Responsible not found' });
                    }
                    
                    db.run(
                        'DELETE FROM event_responsibles WHERE id = ?',
                        [responsibleId],
                        function(err) {
                            if (err) {
                                console.error('Error deleting responsible:', err);
                                return res.status(500).json({ error: 'Failed to delete responsible' });
                            }
                            
                            res.json({ success: true });
                        }
                    );
                }
            );
        }
    );
});

// POST /api/events/:id/expenses - Add expense to event
app.post('/api/events/:id/expenses', requireAuth, (req, res) => {
    const { id } = req.params;
    const { category, name, quantity, cost_per_unit, selling_price_per_unit } = req.body;
    
    if (!category || !name || quantity === undefined || cost_per_unit === undefined) {
        return res.status(400).json({ error: 'Category, name, quantity, and cost_per_unit are required' });
    }
    
    const validCategories = ['Getränke', 'Speisen', 'Sonstige', 'Ausgabe ohne Einnahme'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    const quantityNum = parseFloat(quantity);
    const costPerUnitNum = parseFloat(cost_per_unit);
    
    if (isNaN(quantityNum) || isNaN(costPerUnitNum)) {
        return res.status(400).json({ error: 'Invalid numeric values' });
    }
    
    if (quantityNum <= 0 || costPerUnitNum < 0) {
        return res.status(400).json({ error: 'Quantity and cost must be positive' });
    }
    
    // Selling price is optional - can be null
    let sellingPricePerUnitNum = null;
    if (selling_price_per_unit !== undefined && selling_price_per_unit !== null) {
        sellingPricePerUnitNum = parseFloat(selling_price_per_unit);
        if (isNaN(sellingPricePerUnitNum)) {
            return res.status(400).json({ error: 'Invalid selling price value' });
        }
        if (sellingPricePerUnitNum < 0) {
            return res.status(400).json({ error: 'Selling price must be positive' });
        }
    }
    
    // Verify event belongs to user
    db.get(
        'SELECT id FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            db.run(
                'INSERT INTO expenses (event_id, category, name, quantity, cost_per_unit, selling_price_per_unit) VALUES (?, ?, ?, ?, ?, ?)',
                [id, category, name.trim(), quantityNum, costPerUnitNum, sellingPricePerUnitNum],
                function(err) {
                    if (err) {
                        console.error('Error adding expense:', err);
                        return res.status(500).json({ error: 'Failed to add expense' });
                    }
                    
                    // Fetch the created expense
                    db.get(
                        'SELECT id, category, name, quantity, cost_per_unit, selling_price_per_unit FROM expenses WHERE id = ?',
                        [this.lastID],
                        (err, expense) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to fetch created expense' });
                            }
                            
                            res.json(expense);
                        }
                    );
                }
            );
        }
    );
});

// PUT /api/expenses/:id - Update expense
app.put('/api/expenses/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { category, name, quantity, cost_per_unit, selling_price_per_unit } = req.body;
    
    if (!category || !name || quantity === undefined || cost_per_unit === undefined) {
        return res.status(400).json({ error: 'Category, name, quantity, and cost_per_unit are required' });
    }
    
    const validCategories = ['Getränke', 'Speisen', 'Sonstige', 'Ausgabe ohne Einnahme'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    const quantityNum = parseFloat(quantity);
    const costPerUnitNum = parseFloat(cost_per_unit);
    
    if (isNaN(quantityNum) || isNaN(costPerUnitNum)) {
        return res.status(400).json({ error: 'Invalid numeric values' });
    }
    
    if (quantityNum <= 0 || costPerUnitNum < 0) {
        return res.status(400).json({ error: 'Quantity and cost must be positive' });
    }
    
    // Selling price is optional - can be null
    let sellingPricePerUnitNum = null;
    if (selling_price_per_unit !== undefined && selling_price_per_unit !== null) {
        sellingPricePerUnitNum = parseFloat(selling_price_per_unit);
        if (isNaN(sellingPricePerUnitNum)) {
            return res.status(400).json({ error: 'Invalid selling price value' });
        }
        if (sellingPricePerUnitNum < 0) {
            return res.status(400).json({ error: 'Selling price must be positive' });
        }
    }
    
    // Verify expense belongs to user's event
    db.get(
        `SELECT e.id FROM expenses exp
         INNER JOIN events e ON exp.event_id = e.id
         WHERE exp.id = ? AND e.user_id = ?`,
        [id, req.session.userId],
        (err, expense) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify expense' });
            }
            
            if (!expense) {
                return res.status(404).json({ error: 'Expense not found' });
            }
            
            db.run(
                'UPDATE expenses SET category = ?, name = ?, quantity = ?, cost_per_unit = ?, selling_price_per_unit = ? WHERE id = ?',
                [category, name.trim(), quantityNum, costPerUnitNum, sellingPricePerUnitNum, id],
                function(err) {
                    if (err) {
                        console.error('Error updating expense:', err);
                        return res.status(500).json({ error: 'Failed to update expense' });
                    }
                    
                    // Fetch updated expense
                    db.get(
                        'SELECT id, category, name, quantity, cost_per_unit, selling_price_per_unit FROM expenses WHERE id = ?',
                        [id],
                        (err, updatedExpense) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to fetch updated expense' });
                            }
                            
                            res.json(updatedExpense);
                        }
                    );
                }
            );
        }
    );
});

// DELETE /api/expenses/:id - Delete expense
app.delete('/api/expenses/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    // Verify expense belongs to user's event
    db.get(
        `SELECT e.id FROM expenses exp
         INNER JOIN events e ON exp.event_id = e.id
         WHERE exp.id = ? AND e.user_id = ?`,
        [id, req.session.userId],
        (err, expense) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify expense' });
            }
            
            if (!expense) {
                return res.status(404).json({ error: 'Expense not found' });
            }
            
            db.run(
                'DELETE FROM expenses WHERE id = ?',
                [id],
                function(err) {
                    if (err) {
                        console.error('Error deleting expense:', err);
                        return res.status(500).json({ error: 'Failed to delete expense' });
                    }
                    
                    res.json({ success: true });
                }
            );
        }
    );
});

// POST /api/events/:id/income-without-expense - Add income without expense
app.post('/api/events/:id/income-without-expense', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, quantity, price_per_unit } = req.body;
    
    if (!name || quantity === undefined || price_per_unit === undefined) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    const quantityNum = parseFloat(quantity);
    const pricePerUnitNum = parseFloat(price_per_unit);
    
    if (isNaN(quantityNum) || isNaN(pricePerUnitNum)) {
        return res.status(400).json({ error: 'Invalid numeric values' });
    }
    
    if (quantityNum <= 0 || pricePerUnitNum <= 0) {
        return res.status(400).json({ error: 'Values must be positive' });
    }
    
    // Verify event belongs to user
    db.get(
        'SELECT id FROM events WHERE id = ? AND user_id = ?',
        [id, req.session.userId],
        (err, event) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify event' });
            }
            
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            
            db.run(
                'INSERT INTO income_without_expense (event_id, name, quantity, price_per_unit) VALUES (?, ?, ?, ?)',
                [id, name.trim(), quantityNum, pricePerUnitNum],
                function(err) {
                    if (err) {
                        console.error('Error adding income without expense:', err);
                        return res.status(500).json({ error: 'Failed to add income without expense' });
                    }
                    
                    // Fetch the created income
                    db.get(
                        'SELECT id, name, quantity, price_per_unit FROM income_without_expense WHERE id = ?',
                        [this.lastID],
                        (err, income) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to fetch created income' });
                            }
                            
                            res.json(income);
                        }
                    );
                }
            );
        }
    );
});

// DELETE /api/income-without-expense/:id - Delete income without expense
app.delete('/api/income-without-expense/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    // Verify income belongs to user's event
    db.get(
        `SELECT i.id FROM income_without_expense i
         INNER JOIN events e ON i.event_id = e.id
         WHERE i.id = ? AND e.user_id = ?`,
        [id, req.session.userId],
        (err, income) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to verify income' });
            }
            
            if (!income) {
                return res.status(404).json({ error: 'Income not found' });
            }
            
            db.run(
                'DELETE FROM income_without_expense WHERE id = ?',
                [id],
                function(err) {
                    if (err) {
                        console.error('Error deleting income:', err);
                        return res.status(500).json({ error: 'Failed to delete income' });
                    }
                    
                    res.json({ success: true });
                }
            );
        }
    );
});

// Static file serving (must be after route handlers)
app.use(express.static('public'));

const PORT = process.env.PORT || 3002;

// Initialize database before starting server
initializeDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Veranstaltungen running on http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    })
    .catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });

