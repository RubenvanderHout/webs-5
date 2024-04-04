import "dotenv/config";
import http from "http";
import { MongoClient  } from "mongodb"

const port = '8000'
const host = '0.0.0.0'

const uri = 'mongodb://admin:password@localhost:27017/clock';

async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));
    const app = http.createServer(server);






    app.listen(port, host, () => {
        logger.info(`Started server on port ${port}`);
    })
}

async function connectMongoDB() {
    try {
        // Connect to the MongoDB server
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('clock');
        const collection = db.collection('timings');

        await collection.insertOne({ name: 'John', age: 30 });
        console.log('Document inserted');
        
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
}




main();





    

  