import "dotenv/config";
import http from "http";
import amqplib from "amqplib"
import jwt from "jsonwebtoken"
import { text } from "express";

const port = '7000'
const host = '0.0.0.0'

const JWT_SECRET = 'secret_key_123';

const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // Use `true` for port 465, `false` for all other ports
    auth: {
      user: "brown.zulauf@ethereal.email",
      pass: "j6y2vSnQ2kqbDxgkp4",
    },
});

let connection;
let channel;

const receiveQueue = "confirmMail"
const sendQueue = "mailConfirmed"

async function main() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    await setupAMQP(connection, channel, receiveQueue);

    app.get('/confirm/:token', async (req, res) => {
        const token = req.params.token

        if(token != null) {
            return res.status(400).send('Empty value for token');
        }

        jwt.verify(token, JWT_SECRET, (err, email) => {
            if (err) {
                console.error('JWT verification failed:', err);
                return res.status(401).send('Unauthorized');
            }

            transporter.sendMail({
                from: '"Brown Zulauf" <brown.zulauf@ethereal.email>',
                to: email,
                subject: "Email confirmed", 
                text: "Email confirmed", 
            });

            sendEmailConfirmedAMQP(channel, sendQueue, email);
            res.send('Confirmation received');
        });
    })

    app.listen(port, host, () => {
        logger.info(`Started server on port ${port}`);
    });
}   

async function setupAMQP(connection, channel, queue){
    try {
        connection = await amqp.connect('amqp://localhost')
        channel = await connection.createChannel();

        console.log("Waiting for messages...")

        channel.consume(queue, async (msg) => {
            if (msg !== null) {
                const email = msg.content.toString()
                console.log('Received message:', email);
            
                await sendConfimation(email);
                
                channel.ack(msg);
            }
        })
        
    } catch (error) {
        console.log("Could not setup AMQP connection")
    }
}

async function sendConfimation(email) {
    
    try {
        const token = jwt.sign({ email }, JWT_SECRET);
        const info = await transporter.sendMail({
            from: '"Brown Zulauf" <brown.zulauf@ethereal.email>',
            to: email,
            subject: "Confirm email", 
            html: setupHtmlContent(token), 
        });

        console.log('Email sent:', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

async function sendEmailConfirmedAMQP(channel, queue, email){
    channel.sendToQueue(queue, Buffer.from(email));
}


main().catch((err) => {
    consolel.log(`Server error: ${err}`)
    connection.close();
})