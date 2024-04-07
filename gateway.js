import express from "express"
import { CircuitBreaker } from ""

const port = '1000'
const host = '0.0.0.0'

const circuitBreaker = new CircuitBreaker({
    timeout: 3000, // Timeout in milliseconds
    errorThresholdPercentage: 50, // Error threshold percentage to trip the circuit
    resetTimeout: 5000, // Time in milliseconds to wait before attempting to close the circuit again
});

const app = express();
const proxy = httpProxy.createProxyServer();

const authsUrl = "http://localhost:5000"
const competitionsUrl = "http://localhost:4000"
const scoresUrl = "http://localhost:3000"
const targetsUrl = "http://localhost:2000"

async function doCircuitBreak(url, req, res){
    try {
        const response = await circuitBreaker.fire(() => {
            return new Promise((resolve, reject) => {
                proxy.web(req, res, { target: url }, (err) => {
                    reject(err);
                });
            });
        });
        res.send(response);
    } catch (error) {
        res.status(500).send('Service unavailable');
    }
}

const authMiddleware = async function(req, res, next){
    if (req.url.startsWith("/api/auth")) {
        next();
    }

    const header = req.headers.authorization;
    const url = authsUrl + "/api/auth/authenticateToken";

    const data = {
        "authorization" : header
    }

    try {
        const response = await axios.put(url, data);

        if (response.status === 200) {
            res.send(true);
        } else {
            res.send(false);
        }
    } catch (error) {
 
        res.status(500).send('Could not authenticate jwt');
    }

    next();
}

app.use(authMiddleware)

app.all("/api/auth/*", async (req, res) => {
    doCircuitBreak(authsUrl + req.url, req, res);
});

app.all("/api/competitions/*", async (req, res) => {
    doCircuitBreak(competitionsUrl + req.url, req, res);
});

app.all("/api/scores/*", async (req, res) => {
    doCircuitBreak(scoresUrl + req.url, req, res);
});

app.all("/api/targets/*", async (req, res) => {
    doCircuitBreak(targetsUrl + req.url, req, res);
});

app.listen(port, host, () => {
    logger.info(`Started server on port ${port}`);
});