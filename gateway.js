import express from "express"
import { CircuitBreaker } from "opossum"

const port = process.env.PORT
const host = process.env.HOST

const circuitBreaker = new CircuitBreaker({
    timeout: process.env.CIRCUIT_TIMEOUT, // Timeout in milliseconds
    errorThresholdPercentage: process.env.CIRCUIT_ERROR_THRESHOLD, // Error threshold percentage to trip the circuit
    resetTimeout: process.env.CIRCUIT_RESET_TIMEOUT, // Time in milliseconds to wait before attempting to close the circuit again
});

const app = express();
const proxy = httpProxy.createProxyServer();

const authsUrl = process.env.URL_AUTH
const scoresUrl = process.env.URL_SCORES
const targetsUrl = process.env.URL_TARGETS

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
            req.bearer = response.data;
        } else {
            return res.status(403).send('Authentication failed');
        }
    } catch (error) {
        return res.status(500).send('Could not authenticate JWT');
    }

    next();
}

app.use(authMiddleware)

app.all("/api/auth/*", async (req, res) => {
    doCircuitBreak(authsUrl + req.url, req, res);
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