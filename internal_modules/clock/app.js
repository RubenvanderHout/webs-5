import { MongoClient, Collection  } from "mongodb"
import express from "express";

const port = '8000'
const host = '0.0.0.0'
const uri = 'mongodb://admin:password@localhost:27017/clock';

const client = new MongoClient(uri);

async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));

    /** @type {Collection} */
    const collection = await connectMongoDB();


    server.post('/', (req, res) => {
        const { name, age } = req.body;

        collection.insertOne({name: name, age: age})

        res.send('Hello World!')
    });

    server.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    })
}

async function connectMongoDB() {
    try {
        await client.connect(); // Corrected line
        console.log('Connected to MongoDB');

        const db = client.db('clock');
        const collection = db.collection('timings');

        return collection
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
}

main();