import "dotenv/config";
import { MongoClient, Collection, ObjectId } from "mongodb"
import amqp from "amqplib"

const uri = process.env.DB_CONNECTION_STRING

const AMQP_HOST = process.env.AMQP_HOST
let connection
let channel

const receiveQueueCompTime = process.env.QUEUE_RECEIVE_COMPTIME
const sendQueueCompTimeUp = process.env.QUEUE_SEND_COMPTIMEUP

const client = new MongoClient(uri);

let timings = [];

let collection;

async function main() {
    /** @type {Collection} */
    await connectMongoDB();

    await setupAMQP();
    checkEventEndTimes()
}

async function connectMongoDB() {
    try {
        console.log('Connecting to MongoDB');
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('clock');
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

        channel.assertQueue(receiveQueueCompTime,  {
            durable: false
        });

        channel.consume(receiveQueueCompTime, async (msg) => {
            if (msg !== null) {
                const string = msg.content.toString()
                const timing = JSON.parse(string);
            
                saveTiming(timing)

                channel.ack(msg);
            }
        })
        
    } catch (error) {
        console.log(`Could not setup AMQP connection ${error}`)
        process.exit(1);
    }
}

function saveTiming(timing){
    collection.save(timing);
}

async function checkEventEndTimes(){

    console.log("Checking timings...");

    timings = await collection.find().toArray();

    let sendtimings = [];

    // Iterate through timings
    timings.forEach(timing => {
        const currentTime = new Date();

        if (currentTime > timing.endTime) {
            sendtimings.push(timing); 
        }
    });

    const toBeRemoved = await sendTimings(sendtimings);
    await deleteTimings(toBeRemoved);

    // Call this function again until end of time
    setTimeout(checkEventEndTimes, 2000);
}

async function sendTimings(timings){
    
    let toBeRemoved = [];
    
    try {
        channel.assertQueue(sendQueueCompTimeUp,  {
            durable: false
        });

        timings.forEach(timing => {
            channel.sendToQueue(queue, Buffer.from(JSON.stringify(timing)));
            toBeRemoved.push(timing._id);
            console.log(" [x] Sent '%s'", timing);
        });
    } catch (error) {
        console.error(error);
    } finally {
        return toBeRemoved;
    }
}

async function deleteTimings(timings){
    if (timings.length > 0) {
        try {
            await collection.deleteMany({ _id: { $in: timings.map(id => ObjectId(id)) } });
        } catch (err) {
            console.error('Error deleting timings:', err);
        }
    }
}


main();