import amqp from "amqplib"
import jwt from "jsonwebtoken"
import express from "express";
import nodemailer from "nodemailer"

const port = '7000'
const host = '0.0.0.0'

const JWT_SECRET = 'secret_key_123';

const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "brown.zulauf@ethereal.email",
      pass: "j6y2vSnQ2kqbDxgkp4",
    },
});

let connection;
let channel;

const receiveConfirmQueue = "confirmMail"
const sendQueue = "mailConfirmed"
const recieveScoreQueue = "scores"

async function main() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    await setupAMQP();

    app.get('/confirm/:token', async (req, res) => {

        const token = req.params.token

        if(token === null) {
            return res.status(400).send('Empty value for token');
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                console.error('JWT verification failed:', err);
                return res.status(401).send('Unauthorized');
            }

            transporter.sendMail({
                from: 'Brown Zulauf <brown.zulauf@ethereal.email>',
                to: user.email,
                subject: "Email confirmed", 
                text: "Email confirmed", 
            });

            sendEmailConfirmedAMQP(user);
            res.send('Confirmation received');
        });
    })

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });
}   

async function setupAMQP(){
    try {
        connection = await amqp.connect('amqp://localhost')
        channel = await connection.createChannel();

        console.log("Waiting for messages...")

        channel.assertQueue(receiveConfirmQueue,  {
            durable: false
        });

        channel.consume(receiveConfirmQueue, async (msg) => {
            if (msg !== null) {
                const string = msg.content.toString()
                const user = JSON.parse(string);
                console.log('Received message:', user);
            
                await sendConfimation(user);
                
                channel.ack(msg);
            }
        })
        
    } catch (error) {
        console.log("Could not setup AMQP connection")
    }
}

async function sendConfimation(user) {
    
    try {
        const token = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET);
        
        console.log(user.email)
        
        const info = await transporter.sendMail({
            from: '"Brown Zulauf" <brown.zulauf@ethereal.email>',
            to: user.email,
            subject: "Confirm email", 
            html: setupHtmlContent(token), 
        });

        console.log('Email sent:', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

async function sendEmailConfirmedAMQP(user){
    const string = JSON.stringify(user);

    try {
        channel.assertQueue(sendQueue,  {
            durable: false
        });
        channel.sendToQueue(sendQueue, Buffer.from(string));
        console.log("Send confirmed to Auth")
    } catch (error) {
        console.log(error)
    }
}

function setupHtmlContent(token){
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Email Confirmation</title>
        </head>
        <body>
            <h2>Confirm Your Email</h2>
            <p>Hello, please confirm your email by clicking the button below:</p>
            <button><a href="http://localhost:7000/confirm/${token}">Confirm Email</a></button>
        </body>
        </html>
    `;
}



main().catch((err) => {
    consolel.log(`Server error: ${err}`)
    connection.close();
})