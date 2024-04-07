import "dotenv/config";
import http from "http";
import express from "express";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import amqp from 'amqplib';
import { MongoClient } from 'mongodb';


const port = process.env.PORT;
const host =  process.env.HOST;
const apiKey =  process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const mongoUri = process.env.MONGODB_URI;

async function uploadImage(imagePath, apiKey, apiSecret, user) {
    const categorizerEndpoint = 'https://api.imagga.com/v2/categories/general_v3/';
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));
    const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const headers = {
        Authorization: authHeader,
        ...formData.getHeaders()
    };
    const params =  {
        save_id: user+ "@" + imagePath,
        save_index: "picturemmo"
    }
    try {
    const response = await axios.post(categorizerEndpoint, formData, { headers, params });
    return response.data.result.upload_id;
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

async function compareImages(referenceImagePath, distanceThreshold, apiKey, apiSecret) {
    const comparisonEndpoint = 'https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo';
    const formData = new FormData();

    // Add the reference image
    formData.append('image', fs.createReadStream(referenceImagePath));


    try {
        const response = await axios.post(comparisonEndpoint, formData, {
            params: { distance: distanceThreshold },
            auth: {
                username: apiKey,
                password: apiSecret
            },
            headers: formData.getHeaders()
        });

        return response.data.result;
    } catch (error) {
        console.error('Error comparing images:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function receiveMessageFromQueue() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const queueName = 'file_queue';
        await channel.assertQueue(queueName, { durable: false });

        console.log(`Waiting for messages in queue '${queueName}'...`);

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

    } catch (error) {
        console.error('Error receiving messages from queue:', error);
    }
}

async function uploadImageToMongoDB(content) {
    const mongoClient = await connectToMongoDB();
    const collection = mongoClient.db('targets').collection('competition_files');
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

async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));
    // List of paths of images to compare
    // Route to handle image comparison
    server.post('/upload', async (req, res) => {
        try {
            // Extract the images array from the request body
            const { images } = req.body;
    
            // Check if images array is provided
            if (!images || !Array.isArray(images)) {
                return res.status(400).json({ error: 'Missing or invalid request body: images array is required.' });
            }
    
    
            // Your image paths to compare
            const imagePathsToCompare = images.map(image => image);
    
            // Perform deletion of previous data
            await axios.delete('https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo', {
                auth: {
                    username: apiKey,
                    password: apiSecret
                }
            });
    
            console.log("Starting image comparison...");
            console.log("Uploading images...");
    
            await Promise.all(imagePathsToCompare.map(async imagePath => {
                return uploadImage(imagePath.picture, apiKey, apiSecret, imagePath.name);
            }));
    
            console.log("Images uploaded successfully.");
            console.log("Training index...");
            const ticketId = await trainIndex(apiKey, apiSecret);
            if (!ticketId) {
                console.log('No ticket id. Exiting');
                res.status(500).json({ error: 'No ticket id' });
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
    
            res.json("Training done.");
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
            console.error('Error:', error.response.data);
        }
    });
    server.post('/comp', async (req, res) => {
        try {
            // Extract the image path from the request body
            const { image } = req.body;
    
            // Check if image path is provided
            if (!image) {
                return res.status(400).json({ error: 'Missing or invalid request body: image path is required.' });
            }
    
            console.log("Comparing images...");
            const comparisonResults = await compareImages(image, 1.4, apiKey, apiSecret);
            console.log("Images compared successfully.");
            console.log(comparisonResults);
            res.json(comparisonResults);
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
            console.error('Error:', error.response.data);
        }
    });
    const app = http.createServer(server);

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });
    receiveMessageFromQueue()

}

main();
