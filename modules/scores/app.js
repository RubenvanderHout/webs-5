import "dotenv/config";
import express from "express"
import amqp from "amqplib"
import { MongoClient, ObjectId } from "mongodb"


const port = process.env.PORT
const host = process.env.HOST

const receiveCompetitionDataQueue = process.env.QUEUE_RECEIVE_SCORES;
const sendEmailRequestQueue = process.env.QUEUE_SEND_EMAIL_REQUEST
const receiveQueueCompTime = process.env.QUEUE_RECEIVE_COMPTIME


const uri = process.env.DB_CONNECTION_STRING
const client = new MongoClient(uri);

const AMQP_HOST = process.env.AMQP_HOST;


let db;
let channel;
let timings = [];
let collection;

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

    app.get("/api/competitions/scores/:competitionId", async (req, res) => {
        checkEventEndTimes(req.params.competitionId);
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
        collection = db.collection('competitionTimings');
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
                console.log(competition)
                insertCompetitionData(competition)
                channel.ack(msg);
            }
        })

        const exchange = 'file_exchange';

        await channel.assertExchange(exchange,"fanout",  { durable: false });
        console.log("Waiting for messages...")

        channel.assertQueue(receiveQueueCompTime,  {
            durable: false
        });
        await channel.bindQueue(receiveQueueCompTime, exchange, '');

        channel.consume(receiveQueueCompTime, async (msg) => {
            if (msg !== null) {
                const string = JSON.parse(msg.content.toString())
                const timing = string;
                saveTiming(timing)

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
    const competitionId = Object.keys(competition)[2];

    try {
        const competitionsCollection = db.collection('competitions');
        console.log(competitionId)
        const entries = competition[competitionId];
        console.log(entries)
        for (const entry of entries) {
          const { distance, id } = entry;
    
          let email = id;
          let score = distance  

          // Insert or update user information
          await competitionsCollection.insertOne({
            competitionId: competitionId,
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

async function saveTiming(timing){
    try{
        console.log("Saving timing:", timing);
        await collection.insertOne(timing);
    } catch (error) {
        console.error("Error saving timing:", error);
    }
}

async function sendTimings(timings){
    
    let toBeRemoved = [];
    
    try {
        channel.assertQueue(sendQueueCompTimeUp,  {
            durable: false
        });

        timings.forEach(timing => {
            channel.sendToQueue(sendQueueCompTimeUp, Buffer.from(JSON.stringify(timing)));
            toBeRemoved.push(timing._id);
            console.log(" [x] Sent '%s'", timing);
        });
    } catch (error) {
        console.error(error);
    } finally {
        return toBeRemoved;
    }
}

async function checkEventEndTimes(competition_id){
    try {

    console.log("Checking timings...");

    timings = await collection.find().toArray();

    let sendtimings = [];

    // Iterate through timings
    timings.forEach(timing => {

        if (competition_id == timing.competition_id) {
            sendtimings.push(timing); 
        }
    });

    const toBeRemoved = await sendTimings(sendtimings);
    await deleteTimings(toBeRemoved);
    
        }
    catch (error) {
        console.error("Error checking timings:", error);
    }

}

main();