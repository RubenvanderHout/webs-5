import "dotenv/config";
import express from "express"
import amqp from "amqplib"
import { MongoClient, ObjectId } from "mongodb"


const port = process.env.PORT
const host = process.env.HOST

const receiveCompetitionDataQueue = process.env.QUEUE_RECEIVE_SCORES;
const sendEmailRequestQueue = process.env.QUEUE_SEND_EMAIL_REQUEST


const uri = process.env.DB_CONNECTION_STRING
const client = new MongoClient(uri);

const AMQP_HOST = process.env.AMQP_HOST;


let db;
let channel;

/** @type mysql.connection */
let connection = null;

async function main() {
    await connectMongoDB();
    await setupAMQP();
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Get all your competitions with your scores
    app.get("/api/competitions/scores", async (_, res) => {
        try {
            const competitionsCollection = db.collection('competitions');
        
            const allCompetitions = await competitionsCollection.find({}).toArray();
        
            res.json(allCompetitions);
        } catch (err) {
            console.error('Error retrieving competitions: ' + err);
            res.status(500).send('Internal Server Error');
        }
    })

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });
}

async function connectMongoDB() {
    try {
        console.log('Connecting to MongoDB');
        await client.connect();
        console.log('Connected to MongoDB');
        db = client.db('competitions');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
}

async function setupAMQP(){
    try {
        connection = await amqp.connect(AMQP_HOST)
        channel = await connection.createChannel();

        console.log("Waiting for messages...")

        channel.assertQueue(receiveCompetitionDataQueue, {
            durable: false
        });

        channel.consume(receiveCompetitionDataQueue, async (msg) => {
            if (msg !== null) {
                const string = msg.content.toString()
                const competition = JSON.parse(string);

                insertCompetitionData(competition)
                sendCompitionEmails(competition);

                channel.ack(msg);
            }
        })

        channel.assertQueue()


        
    } catch (error) {
        console.log(`Could not setup AMQP connection, ${error}`)
        process.exit(1);
    }
}

async function insertCompetitionData(competition){
    // Extract the id of the only competition in the json
    const competitionId = Object.keys(competition)[1];

    try {
        const competitionsCollection = db.collection('competitions');
        const entries = competition[competitionId];
    
        for (const entry of entries) {
          const { distance, id } = entry;
    
          let email = id;
          let score = distance  

          // Insert or update user information
          await competitionsCollection.insertOne({
            competitionId: ObjectId(competitionId),
            user: {
              email,
              score
            }
          });
        }

      } catch (err) {
        console.error('Error inserting data: ' + err);
      }
}

async function sendCompitionEmails(data){
    const string = JSON.stringify(data)

    channel.assertQueue(sendEmailRequestQueue,  {
        durable: false
    });

    channel.sendToQueue(sendEmailRequestQueue, Buffer.from(string));
}


main();