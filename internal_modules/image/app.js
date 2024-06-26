import "dotenv/config";
import http from "http";
import express from "express";
import axios from "axios";
import FormData from "form-data";
import amqp from 'amqplib';
import { MongoClient } from 'mongodb';
import { BlobServiceClient } from "@azure/storage-blob";



const port = process.env.PORT;
const host =  process.env.HOST;
const apiKey =  process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const mongoUri = process.env.MONGODB_URI;
const accountName = process.env.BLOB_ACCOUNT_NAME;
const accountKey = process.env.BLOB_ACCOUNT_KEY;
const containerName = process.env.BLOB_CONTAINER_NAME;

async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function uploadImage(imagePath, apiKey, apiSecret, user) {
    console.log('Uploading image:', imagePath);
    const categorizerEndpoint = 'https://api.imagga.com/v2/categories/general_v3/';
    const formData = new FormData();
    formData.append('image', imagePath);
    const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const headers = {
        Authorization: authHeader,
    };
    const params =  {
        save_id: user,
        save_index: "picturemmo"
    }
    try {
        const response = await new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const response = await axios.post(categorizerEndpoint, formData, { headers, params });
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            }, 500); // Delay of 500 milliseconds
        });    return response.data.result.upload_id;
    } catch (error) {
        console.error('Error uploading image:');
        console.error('Error:', error.response.data);
    }
}

async function trainIndex(apiKey, apiSecret) {
    const indexEndpoint = `https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo`;
    let ticketId = '';

    try {
        const response = await axios.put(indexEndpoint, null, {
            auth: {
                username: apiKey,
                password: apiSecret
            }
        });

        ticketId = response.data.result.ticket_id;
    } catch (error) {
        console.error('Exception occurred when processing the train call response');
        console.error('Error:', error.response.data);

    }

    return ticketId;
}

async function isResolved(ticketId, apiKey, apiSecret) {
    const ticketsEndpoint = `https://api.imagga.com/v2/tickets/${ticketId}`;
    let resolved = false;

    try {
        const response = await axios.get(ticketsEndpoint, {
            auth: {
                username: apiKey,
                password: apiSecret
            }
        });

        resolved = response.data.result.is_final;
    } catch (error) {
        console.error('Exception occurred during the ticket status check');
        console.error('Error:', error.response.data);

    }

    return resolved;
}

async function compareImages(referenceImage, distanceThreshold, apiKey, apiSecret) {
    const comparisonEndpoint = 'https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo';
    const formData = new FormData();

    // Add the reference image
    formData.append('image',referenceImage);
    console.log(formData);

        const response = await axios.post(comparisonEndpoint, formData, {
            params: { distance: distanceThreshold },
            auth: {
                username: apiKey,
                password: apiSecret
            },
            headers: formData.getHeaders()
        });

        return response.data.result;
}

async function receiveMessageFromQueue() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const exchange = 'file_exchange';
        const queueName = 'file_queue';
        await channel.assertExchange(exchange,"fanout",  { durable: false });

        console.log(`Waiting for messages in exchange '${exchange}'...`);
        // Assert the shared queue
        await channel.assertQueue(queueName, { durable: false });

        // Bind the queue to the exchange
        await channel.bindQueue(queueName, exchange, '');
                
          channel.consume(queueName, async (message) => {
            if (message !== null) {
                try {
                    const content = JSON.parse(message.content.toString());
                    console.log(`Received message from queue '${queueName}':`, content);
                    // Process the message here
                    await uploadImageToMongoDB(content);
                    // Acknowledge message
                    channel.ack(message);
                } catch (error) {
                    console.error('Error processing message:', error);
                    // Reject message if unable to process
                    channel.reject(message, false); // Set requeue to false
                }
            }
        });
        const timerchannel = await connection.createChannel();
        const timerQueueName = 'calculation_time_queue';
        await timerchannel.assertQueue(timerQueueName, { durable: false });
        console.log(`Waiting for messages in queue '${timerQueueName}'...`);
        channel.consume(timerQueueName, async (message) => {
            if (message !== null) {
                try {
                    const content = JSON.parse(message.content.toString());
                    console.log(`Received message from queue '${timerQueueName}':`, content);
                    
                    await upload(content.competition_id);
                    // Process the message here
                    await startcomparison(content.competition_id);
                    // Acknowledge message
                    channel.ack(message);
                } catch (error) {
                    console.error('Error processing message:', error);
                    // Reject message if unable to process
                    channel.reject(message, false); // Set requeue to false
                }
            }
        });

    } catch (error) {
        console.error('Error receiving messages from queue:', error);
    }
}

async function uploadImageToMongoDB(content) {
    const mongoClient = await connectToMongoDB();
    const collection = mongoClient.db('images').collection('competition_files');
    await collection.insertOne(content);

}

// Function to connect to MongoDB
async function connectToMongoDB() {
    const mongoClient = new MongoClient(mongoUri,{auth: {
        username: 'root',
        password: 'magicman'
    }});
    await mongoClient.connect();
    return mongoClient;
}
async function downloadPictureFromAzureStorage(accountName, accountKey, containerName, blobName) {
    console.log('Downloading picture:', blobName);
    const blobServiceClient = BlobServiceClient.fromConnectionString(`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    const fileData = await streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    return fileData;
}

async function startcomparison(competitionId) {
    try {
        // Extract the image path from the request body
        const mongoClient = await connectToMongoDB();
        const collection = mongoClient.db('images').collection('competition_files');
        const query = { competition_id: competitionId, end: { $ne: null } };
        const image = await collection.find(query).toArray();
        console.log(image);
        console.log("Comparing images...");
        const imageBuffer = await downloadPictureFromAzureStorage(accountName, accountKey, containerName, image[0].filename);
        const comparisonResults = await compareImages(imageBuffer, 1.4, apiKey, apiSecret);
        console.log("Images compared successfully.");
        console.log(comparisonResults);
        sendMessageToQueue(comparisonResults);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function sendMessageToQueue(message) {
    try {
        console.log('Sending message to queue:');
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const queueName = 'scoresReceive';
        await channel.assertQueue(queueName, { durable: false });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)));
        console.log(`Message sent to queue '${queueName}':`, message);
        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Error sending message to queue:', error);
    }
}

async function upload(competitionId) {
    try {
        const mongoClient = await connectToMongoDB();
        const collection = mongoClient.db('images').collection('competition_files');
        const query = { competition_id: competitionId};
        const images = await collection.find(query).toArray();

        
        console.log("Deleting previous data...");
        // Perform deletion of previous data
        try{
            await axios.delete('https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo', {
                auth: {
                    username: apiKey,
                    password: apiSecret
                }
            });
        } catch (error) {
            console.error('Error deleting previous data:', error.response.data);
        }

        console.log("Uploading images...");
        console.log(images);
        await Promise.all(images.map(async image  => {
                const imageBuffer = await downloadPictureFromAzureStorage(accountName, accountKey, containerName, image.filename);
                await uploadImage(imageBuffer, apiKey, apiSecret, image.email); // Upload the image to Imagga
        }));

        console.log("Images uploaded successfully.");
        console.log("Training index...");
        const ticketId = await trainIndex(apiKey, apiSecret);
        if (!ticketId) {
            console.log('No ticket id. Exiting');
            return;
        }

        console.log("Waiting for training to finish...");
        const timeStarted = Date.now();
        while (!(await isResolved(ticketId, apiKey, apiSecret))) {
            const timePassed = (Date.now() - timeStarted) / 1000;
            console.log(`Waiting for training to finish (time elapsed: ${timePassed.toFixed(1)}s)`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("Training done.");

    } catch (error) {
        console.error('Error:', error);
    }
}
async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));
    
    const app = http.createServer(server);

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });
    receiveMessageFromQueue()

}

main();
