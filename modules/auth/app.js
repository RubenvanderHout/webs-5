import express from "express"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import mysql from "mysql2/promise"

const app = express();

const PORT = '5000'
const HOST = '0.0.0.0'

const JWT_SECRET_KEY = "aghast-feed-crux-footpath-untimed-skincare-thyself-emotion";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function setupDB(){
    
    try {
        const connection = await mysql.createConnection({
            host: '0.0.0.0',
            user: 'user',
            password: 'magicman',
            database: 'auth',
            port: '5050'
        });

        // Create users table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                email varchar(250) NOT NULL,
                password varchar(250) NOT NULL
            )
        `);

        return connection;
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}

async function saveUser(user){
    
    const connection = await setupDB();

    try {
        await connection.execute('INSERT INTO users (email, password) VALUES (?, ?)', [user.email, user.password]);
    } catch(err) {
        console.log(err)
        throw err;
    } finally {
        connection.end();
    }
}

async function findUser(email){
    
    const connection = await setupDB();

    try {
        const [rows] = await connection.execute('SELECT email, password FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];
            return user
        } else{
            throw new Error("no user found")
        }
    } catch(err) {
        console.log(err)
        throw err;
    } finally {
        connection.end();
    }
}

app.put('/api/auth/authenticateToken', async (req, res) => {
    const token = req.body.authorization;
    if (!token) return res.status(401).send();

    jwt.verify(token, JWT_SECRET_KEY, (err, rights) => {
        if (err) return res.sendStatus(403);
        res.status(200).send(rights);
    });
});

// Register a new user
app.post('/api/auth/register/:email', async (req, res) => {
    
    console.log(req.params.email, req.body.password)


    if(req.params.email === null || typeof req.params.email !== "string"){
        return res.status(400).send('Email not correct');
    }

    if(req.body.password === null || typeof req.body.password !== "string"){
        return res.status(400).send('Password not correct');
    }
    
    try {
        const pass = await bcrypt.hash(req.body.password, 10);
        const user = { email: req.params.email, password: pass };
        await saveUser(user);
        res.status(201).send('User registered successfully');
    } catch {
        res.status(500).send("Internal Server Error");
    }
});

// Login and get JWT token
app.post('/api/auth/login/:email', async (req, res) => {
    
    if(req.params.email === null || typeof req.params.email !== "string"){
        return res.status(400).send('Email not correct');
    }
    
    if(req.body.password === null || typeof req.body.password !== "string"){
        return res.status(400).send('Password not correct');
    }

    try {
        const user = await findUser(req.params.email);
    
        if (user === null) {
            return res.sendStatus(404);
        }

        if (await bcrypt.compare(req.body.password, user.password)) {
            const rights = { email: user.email  };
            
            
            const accessToken = jwt.sign(rights, JWT_SECRET_KEY);
            res.json({ accessToken: accessToken });
        } else {
            res.status(401).send('Incorrect password');
        }
    } catch (err) {
        console.log(err)
        res.status(500).send("Internal Server Error");
    }
});


app.listen(PORT, HOST, () => {
    console.info(`Started server on port ${PORT}`);
});