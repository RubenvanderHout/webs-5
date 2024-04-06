import "dotenv/config";
import express from "express";
import http from "http";
import { BlobServiceClient } from "@azure/storage-blob";
import amqp from 'amqplib';
import multer from "multer";
import { MongoClient } from 'mongodb';

const port = '2000'
const host = '0.0.0.0'

const accountName = "webs5";
const accountKey = "wj/JqeTo1gEHtl3EGY86lCq5DuxkYI2sMrzatYwNZAXpwB474OKw0i1lbyg4v8Eenvp5tT6pejP7+AStxGzp9A==";
const containerName = "picturemmo";

async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));
    const app = http.createServer(server);

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });


    const upload = multer();

    server.post('/upload', upload.single('file'), async (req, res) => {
        try {
            const fileData = req.file.buffer;
            console.log("Uploading picture...");
            await uploadPictureToAzureStorage(accountName, accountKey, containerName, req.body.filename, fileData);
            console.log("Picture uploaded successfully.");
            
            // Saving file information to MongoDB
            const mongoClient = new MongoClient("mongodb://root:magicman@localhost:27018/",{auth: {
                username: 'root',
                password: 'magicman'
            }});
            await mongoClient.connect();
            const db = mongoClient.db('targets');
            const collection = db.collection('competition_files');
            const fileInformation = {
                filename: req.body.filename,
                username: req.body.username,
                start: req.body.start,
                end: req.body.end,
                competition_id: req.body.competition_id
            };
            await collection.insertOne(fileInformation);
            console.log("File information saved to MongoDB.");
    
            try {
                const message = JSON.stringify(fileInformation);
                const connection = await amqp.connect('amqp://localhost');
                const channel = await connection.createChannel();
                const queueName = 'file_queue';
                await channel.assertQueue(queueName, { durable: false });
                channel.sendToQueue(queueName, Buffer.from(message));
                console.log(`Message sent to queue '${queueName}': ${message}`);
                await channel.close();
                await connection.close();
            } catch (error) {
                console.error('Error sending message to queue:', error);
            }
            res.json("Picture uploaded successfully.");
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
            console.error('Error:', error);
        }
    });
        
    server.get('/download', async (req, res) => {
        try {
            console.log("Downloading picture...");
            const filename = req.query.filename;
            console.log("Downloading picture:", filename);
            const fileData = await downloadPictureFromAzureStorage(accountName, accountKey, containerName, filename);
            console.log("Picture downloaded successfully.");
            res.setHeader('Content-Type', 'image/jpeg');
            res.send(fileData);
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
            console.error('Error:', error);
        }
    });


}


async function uploadPictureToAzureStorage(accountName, accountKey, containerName, blobName, fileData) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    try {
        await blockBlobClient.uploadData(fileData);
        console.log("Picture uploaded successfully.");
    } catch (error) {
        console.error("Error uploading picture:", error);
    }
}

async function downloadPictureFromAzureStorage(accountName, accountKey, containerName, blobName) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    const fileData = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return fileData;
}

async function streamToBuffer(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data instanceof Buffer ? data : Buffer.from(data));
        });
        readableStream.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        readableStream.on('error', reject);
    });
}



main();