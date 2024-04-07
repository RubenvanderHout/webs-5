import { MongoClient, Collection, ObjectId } from "mongodb"

const uri = 'mongodb://admin:password@localhost:27017';

let connection
let channel

const retrieveQueueCompTime = "comptime"
const sendQueueCompTimeUp = "compdone"

const client = new MongoClient(uri);

let timings = [];

let collection;

async function main() {
    /** @type {Collection} */
    await connectMongoDB();

    await setupAMQP();
    await fetchTimings();
    listenForChanges();
    checkEventEndTimes()
}

async function connectMongoDB() {
    try {
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
        connection = await amqp.connect('amqp://localhost')
        channel = await connection.createChannel();

        console.log("Waiting for messages...")

        channel.assertQueue(receiveConfirmQueue,  {
            durable: false
        });

        channel.consume(retrieveQueueCompTime, async (msg) => {
            if (msg !== null) {
                const string = msg.content.toString()
                const timing = JSON.parse(string);
            
                saveTiming(timing)

                channel.ack(msg);
            }
        })
        
    } catch (error) {
        console.log("Could not setup AMQP connection")
    }
}

function listenForChanges(collection){
    const changeStream = collection.watch();
    
    changeStream.on('change', async (change) => {
        if (change.operationType === 'insert') {
            const newTiming = change.fullDocument;
            console.log('New timing added:', newTiming);
            timings.push(newTiming);
        }
    });
}


function saveTiming(timing){
    collection.save(timing);
}

async function fetchTimings(collection){
    timings = await collection.find().toArray();
}

async function checkEventEndTimes(){

    console.log("Checking timings...");

    let toBeRemoved = [];

    // Iterate through timings
    timings.forEach(timing => {
        const currentTime = new Date();

        if (currentTime > timing.endTime) {
            toBeRemoved.push(timing._id); 
        }
    });

    await deleteTimings(toBeRemoved);

    // Call this function again until end of time
    setTimeout(checkEventEndTimes, 2000);
}

async function deleteTimings(timings){
    if (timings.length > 0) {
        try {
            // Delete timings from the database
            await collection.deleteMany({ _id: { $in: timings.map(id => ObjectId(id)) } });
        } catch (err) {
            console.error('Error deleting timings:', err);
        }
    }
}


main();