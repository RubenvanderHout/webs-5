import "dotenv/config";
import express from "express";
import http from "http";
import { BlobServiceClient } from "@azure/storage-blob";
import amqp from 'amqplib';
import multer from "multer";
import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';

const port = process.env.PORT

const MONGO_URI = process.env.DB_CONNECTION_STRING
const AMQP_HOST = process.env.AMQP_HOST
const accountName = process.env.BLOB_ACCOUNT_NAME
const accountKey = process.env.BLOB_ACCOUNT_KEY
const containerName = process.env.BLOB_CONTAINER_NAME

async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));

    // Routes
    server.post('/api/targets/upload', upload.single('file'), uploadPicture);
    server.get('/api/targets/target/:competitionId', getFilesByCompetitionId);
    server.get('/api/targets/target', getAllFiles);
    server.get('/api/targets/download', downloadPicture);

    const app = http.createServer(server);
    app.listen(port, () => {
        console.info(`Server is running on port ${port}`);
    });
}

const upload = multer();

// Upload picture route handler
async function uploadPicture(req, res) {
    try {
        const fileData = req.file.buffer;
        console.log("Uploading picture...");
        await uploadPictureToAzureStorage(accountName, accountKey, containerName, req.body.filename, fileData);
        console.log("Picture uploaded successfully.");

        // Assuming req.headers.authorization contains the JWT token
        console.log(req.headers.authorization);
        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = jwt.verify(token, 'secret_key_123'); // replace 'your_secret_key' with your actual secret key

        const mongoClient = await connectToMongoDB();
        const collection = mongoClient.db('targets').collection('competition_files');
        const competitionId = req.body.end ? await getNextCompetitionId(collection) : req.body.competition_id;

        const fileInformation = {
            filename: req.body.filename,
            username: decodedToken.username, // Extracting username from the decoded token
            email: decodedToken.email, // Extracting email from the decoded token
            end: req.body.end,
            competition_id: competitionId
        };
        await collection.insertOne(fileInformation);
        console.log("File information saved to MongoDB.");

        await sendMessageToQueue(fileInformation);
        res.json("Picture uploaded successfully.");
    } catch (error) {
        handleError(res, error);
    }
}

// Get files by competition ID route handler
async function getFilesByCompetitionId(req, res) {
    try {
        const competitionId = req.params.competitionId;
        const mongoClient = await connectToMongoDB();
        const collection = mongoClient.db('targets').collection('competition_files');
        const query = { competition_id: competitionId, end: { $ne: null } };
        const files = await collection.find(query).toArray();
        res.json(files);
    } catch (error) {
        handleError(res, error);
    }
}

// Get all files route handler
async function getAllFiles(req, res) {
    try {
        const mongoClient = await connectToMongoDB();
        const collection = mongoClient.db('targets').collection('competition_files');
        const query = { end: { $ne: null } };
        const files = await collection.find(query).toArray();
        res.json(files);
    } catch (error) {
        handleError(res, error);
    }
}

// Download picture route handler
async function downloadPicture(req, res) {
    try {
        console.log("Downloading picture...");
        const filename = req.query.filename;
        const fileData = await downloadPictureFromAzureStorage(accountName, accountKey, containerName, filename);
        console.log("Picture downloaded successfully.");
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(fileData);
    } catch (error) {
        handleError(res, error);
    }
}

// Function to connect to MongoDB
async function connectToMongoDB() {
    const mongoClient = new MongoClient(MONGO_URI,{auth: {
        username: 'root',
        password: 'magicman'
    }});
    await mongoClient.connect();
    return mongoClient;
}

// Function to get the next competition ID
async function getNextCompetitionId(collection) {
    const result = await collection.find({}, { projection: { competition_id: 1 } })
                                   .sort({ competition_id: -1 })
                                   .limit(1)
                                   .toArray();
    if (result.length === 0) {
        return 0;
    }
    else {
        const highestCompetitionId = result[0].competition_id; // Example value, replace this with your actual value
        const parsedId = parseInt(highestCompetitionId);
        const incrementedId = parsedId + 1;
        const incrementedIdString = incrementedId.toString();
        return incrementedIdString
    }
}

// Function to upload picture to Azure Storage
async function uploadPictureToAzureStorage(accountName, accountKey, containerName, blobName, fileData) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(fileData);
    console.log("Picture uploaded to Azure Storage.");
}

// Function to download picture from Azure Storage
async function downloadPictureFromAzureStorage(accountName, accountKey, containerName, blobName) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    const fileData = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return fileData;
}

// Function to handle errors
function handleError(res, error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
}

// Helper function to convert stream to buffer
async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// Function to send message to queue
async function sendMessageToQueue(message) {
    try {
        console.log('Sending message to queue:', message);
        const connection = await amqp.connect(AMQP_HOST);
        const channel = await connection.createChannel();
        const queueName = 'file_exchange';
        await channel.assertExchange(queueName, "fanout", { durable: false });
        channel.publish(queueName, '', Buffer.from(JSON.stringify(message)));
        console.log(`Message sent to queue '${queueName}':`, message);
        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Error sending message to queue:', error);
    }
}

main();
