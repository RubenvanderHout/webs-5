import express from "express"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import mysql from "mysql2/promise"
import amqp from "amqplib"

const app = express();

const PORT = '5000'
const HOST = '0.0.0.0'

const JWT_SECRET_KEY = "aghast-feed-crux-footpath-untimed-skincare-thyself-emotion";

let connection;
let channel;

const receiveQueue = "mailConfirmed"
const sendQueue = "confirmMail"
const RECEIVER_EMAIL = '"Loma Krajcik" <loma.krajcik@ethereal.email>';

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function main(){

    await setupAMQP();

    app.put('/api/auth/authenticateToken', async (req, res) => {
        const token = req.body.authorization;
        if (!token) return res.status(401).send();
    
        jwt.verify(token, JWT_SECRET_KEY, (err, rights) => {
            if (err) return res.sendStatus(403);
            res.status(200).send(rights);
        });
    });
    
    // Register a new user
    app.post('/api/auth/register/:username', async (req, res) => {
        
        if(req.params.username === null || typeof req.params.username !== "string"){
            return res.status(400).send('Username not correct');
        }
    
        if(req.body.password === null || typeof req.body.password !== "string"){
            return res.status(400).send('Password not correct');
        }
        
        try {
            const pass = await bcrypt.hash(req.body.password, 10);
            const user = { username: req.params.username, email: RECEIVER_EMAIL, password: pass, confirmed: 0 };
            await saveUser(user);
            await sendConfirmUserNameAMQP({ username: user.username, email: user.email });
            res.status(201).send('User registered successfully');
        } catch(err) {
            console.error(err)
            res.status(500).send("Internal Server Error");
        }
    });
    
    // Login and get JWT token
    app.post('/api/auth/login/:username', async (req, res) => {
        
        if(req.params.username === null || typeof req.params.username !== "string"){
            return res.status(400).send('Username not correct');
        }
        
        if(req.body.password === null || typeof req.body.password !== "string"){
            return res.status(400).send('Password not correct');
        }
    
        try {
            const user = await findUser(req.params.username);
        
            if (user === null) {
                return res.sendStatus(404);
            }
    
            if(user.confirmed === 0){
                return res.status(401).send('User not confirmed yet');
            }

            if (await bcrypt.compare(req.body.password, user.password)) {
                const rights = { username: user.username, email: user.email, confirmed: user.confirmed };
                const accessToken = jwt.sign(rights, JWT_SECRET_KEY);
                res.json({ token: accessToken });
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
}

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
                username varchar(250) PRIMARY KEY NOT NULL,
                email varchar(250) NOT NULL,
                password varchar(250) NOT NULL,
                confirmed TINYINT
            )
        `);

        return connection;
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}

async function setupAMQP(){
    try {
        connection = await amqp.connect('amqp://localhost')
        channel = await connection.createChannel();

        console.log("Waiting for messages...")

        channel.assertQueue(receiveQueue, {
            durable: false
        });

        channel.consume(receiveQueue, async (msg) => {
            if (msg !== null) {
                const string = msg.content.toString()
                const user = JSON.parse(string);
                updateUserConfirmed(user.username);
                channel.ack(msg);
            }
        })
        
    } catch (error) {
        console.log(`Could not setup AMQP connection, ${error}`)
    }
}

async function updateUserConfirmed(username){
    const connection = await setupDB();

    try {
        await connection.execute('UPDATE users SET confirmed = ? WHERE username = ?', [1, username])
    } catch(err) {
        console.log(err)
        throw err;
    } finally {
        connection.end();
    }
}

async function saveUser(user){
    
    const connection = await setupDB();

    try {
        await connection.execute('INSERT IGNORE INTO users (username, email, password, confirmed) VALUES (?, ?, ?, ?)', [user.username, user.email, user.password, user.confirmed])
    } catch(err) {
        console.log(err)
        throw err;
    } finally {
        connection.end();
    }
}

async function sendConfirmUserNameAMQP(data){
    const string = JSON.stringify(data)

    channel.assertQueue(sendQueue,  {
        durable: false
    });

    channel.sendToQueue(sendQueue, Buffer.from(string));
}

async function findUser(username){
    
    const connection = await setupDB();

    try {
        const [rows] = await connection.execute('SELECT username, email, password, confirmed FROM users WHERE username = ?', [username]);

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

main().catch((err) => {
    consolel.log(`Server error: ${err}`)
    connection.close();
})