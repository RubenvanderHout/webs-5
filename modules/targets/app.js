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
            amqp.connect('amqp://localhost', function(error0, connection) {
                console.log(connection);
                if (error0) {
                    console.log("Error connecting to RabbitMQ");
                    throw error0;
                }
                connection.createChannel(function(error1, channel) {
                    console.log(channel);
                    if (error1) {
                        console.log("Error creating channel");
                        throw error1;
                    }
            
                    var queue = 'file_queue';
                    var msg = "[{'filename':" + req.body.filename + " username:" + req.body.username + "}]";
            
                    channel.assertQueue(queue, {
                        durable: false
                    });
                    channel.sendToQueue(queue, Buffer.from(msg));
                    res.json("Picture sent successfully.");

                    console.log(" [x] Sent %s", msg);
                });
                setTimeout(function() {
                    console.log("Closing connection...");
                    connection.close();
                    process.exit(0);
                }, 500);
            });
            res.json("Picture uploaded successfully.");
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
            console.error('Error:', error);
        }
    });

    server.get('/rabbitget', async (req, res) => {
        amqp.connect('amqp://localhost', function(error0, connection) {
            if (error0) {
                throw error0;
            }
            connection.createChannel(function(error1, channel) {
                if (error1) {
                    throw error1;
                }

                var queue = 'file_queue';

                channel.assertQueue(queue, {
                    durable: false
                });

                console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

                channel.consume(queue, function(msg) {
                    console.log(" [x] Received %s", msg.content.toString());
                }, {
                    noAck: true
                });
            });
        });
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