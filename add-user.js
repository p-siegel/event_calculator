const { db, initializeDatabase } = require('./db/init-db');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function addUser() {
    try {
        await initializeDatabase();
        
        const username = await question('Username: ');
        if (!username.trim()) {
            console.error('Username cannot be empty');
            rl.close();
            process.exit(1);
        }
        
        const password = await question('Password: ');
        if (!password.trim()) {
            console.error('Password cannot be empty');
            rl.close();
            process.exit(1);
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username.trim(), hashedPassword],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        console.error('Username already exists');
                    } else {
                        console.error('Error creating user:', err);
                    }
                    rl.close();
                    process.exit(1);
                } else {
                    console.log(`User "${username}" created successfully!`);
                    rl.close();
                    process.exit(0);
                }
            }
        );
    } catch (error) {
        console.error('Error:', error);
        rl.close();
        process.exit(1);
    }
}

addUser();

