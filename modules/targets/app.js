import "dotenv/config";
import express from "express";
import http from "http";
import { BlobServiceClient } from"@azure/storage-blob";
import amqp from 'amqplib';
import multer from "multer";

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
            try {
                const message = JSON.stringify({
                    filename: req.body.filename,
                    username: req.body.username,
                    end: req.body.end
                });
                // Connect to RabbitMQ server
                const connection = await amqp.connect('amqp://localhost');
                // Create a channel
                const channel = await connection.createChannel();
                // Assert the queue
                const queueName = 'file_queue';
                await channel.assertQueue(queueName, { durable: false });
                // Send message to the queue
                channel.sendToQueue(queueName, Buffer.from(message));
                console.log(`Message sent to queue '${queueName}': ${message}`);
                // Close the channel and connection
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
    server.get('/rabbitget', async (req, res) => {
        try {
            // Receive messages from RabbitMQ queue
            receiveMessageFromQueue('file_queue', (message) => {
                console.log(`Received message: ${message}`);
                res.json({ message }); // Responding to the client with the received message
            });
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
            res.setHeader('Content-Type', 'image/jpeg'); // Set the appropriate content type
            res.send(fileData);
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
            console.error('Error:', error);
        }
    });


}

const receiveMessageFromQueue = async (queueName, callback) => {
    try {
        // Connect to RabbitMQ server
        const connection = await amqp.connect('amqp://localhost');
        // Create a channel
        const channel = await connection.createChannel();
        // Assert the queue
        await channel.assertQueue(queueName, { durable: false });
        // Consume messages from the queue
        channel.consume(queueName, async (msg) => {
            if (msg !== null) {
                // Execute callback with the received message
                callback(msg.content.toString());
                // Acknowledge the message
                channel.ack(msg);
            }
        });
        console.log(`Waiting for messages from queue '${queueName}'...`);
    } catch (error) {
        console.error('Error receiving messages from queue:', error);
    }
};
async function uploadPictureToAzureStorage(accountName, accountKey, containerName, blobName, fileData) {
    // Create BlobServiceClient object
    const blobServiceClient = BlobServiceClient.fromConnectionString(`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`);

    // Get a reference to a container
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Get a block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    try {
        // Upload picture data to Azure Storage
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