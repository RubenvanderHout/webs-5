import express from "express"
import { CircuitBreaker } from "opossum"

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

app.all("/api/auth/*", async (req, res) => {
    try {
        const response = await circuitBreaker.fire(() => {
            return new Promise((resolve, reject) => {
                proxy.web(req, res, { target: authsUrl }, (err) => {
                    reject(err);
                });
            });
        });
        res.send(response);
    } catch (error) {
        res.status(500).send('Service unavailable');
    }
});

app.all("/api/competitions/*", async (req, res) => {
    try {
        const response = await circuitBreaker.fire(() => {
            return new Promise((resolve, reject) => {
                proxy.web(req, res, { target: competitionsUrl }, (err) => {
                    reject(err);
                });
            });
        });
        res.send(response);
    } catch (error) {
        res.status(500).send('Service unavailable');
    }
});

app.all("/api/scores/*", async (req, res) => {
    try {
        const response = await circuitBreaker.fire(() => {
            return new Promise((resolve, reject) => {
                proxy.web(req, res, { target: scoresUrl }, (err) => {
                    reject(err);
                });
            });
        });
        res.send(response);
    } catch (error) {
        res.status(500).send('Service unavailable');
    }
});

app.all("/api/targets/*", async (req, res) => {
    try {
        const response = await circuitBreaker.fire(() => {
            return new Promise((resolve, reject) => {
                proxy.web(req, res, { target: targetsUrl }, (err) => {
                    reject(err);
                });
            });
        });
        res.send(response);
    } catch (error) {
        res.status(500).send('Service unavailable');
    }
});

app.listen(port, host, () => {
    logger.info(`Started server on port ${port}`);
});