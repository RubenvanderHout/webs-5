import "dotenv/config";
import express from "express"
import proxy from 'express-http-proxy';
import axios from 'axios';
import circuitBreaker from "opossum";

const port = process.env.PORT
const host = process.env.HOST

const app = express();

const authsUrl = process.env.URL_AUTH
const scoresUrl = process.env.URL_SCORES
const targetsUrl = process.env.URL_TARGETS

const createBreaker = (url) => {
    const breakerOptions = {
        timeout: 3000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
    };

    const breaker = new circuitBreaker(async (req) => {
        const response = await fetch(url + req.url);
        if (!response.ok) {
            throw new Error('Service is offline');
        }
        return response.json();
    }, breakerOptions);

    // Logging for the events
    breaker.on('open', () => console.log(`Circuit breaker for ${url} is open.`));
    breaker.on('halfOpen', () => console.log(`Circuit breaker for ${url} is half-open.`));
    breaker.on('close', () => console.log(`Circuit breaker for ${url} is closed.`));

    return breaker;
}

const circuitBreakerMiddleware = (breaker) => async (req, res, next) => {
    try {
        await breaker.fire(req, res, next);
    } catch (error) {
        if (breaker.opened) {
            console.log('Circuit breaker is open. Retrying later.');
            res.status(503).send('Service temporarily unavailable. Please try again later.');
        } else {
            next(error);
        }
    }
}


async function authMiddleware(req, res, next) {
    // Dont need to authenticate for the auth route
    if (req.url.startsWith("/api/auth")) {
        next();
        return
    }

    const header = req.headers.authorization;
    const url = authsUrl + "/api/auth/authenticateToken";

    const data = {
        "authorization" : header
    }

    try {
        const response = await axios.put(url, data);

        if (response.status === 200) {
            const newAuthorizationHeader = `Bearer ${response.data.token}`;
            req.headers.authorization = newAuthorizationHeader;
            next();
        } else {
            res.status(403).send('Authentication failed');
            return
        }
    } catch (error) {
       res.status(500).send('Could not authenticate JWT'+ error);
       return
    }
}

app.use(authMiddleware)

// Create circuit breakers for each service
const authBreaker = createBreaker(authsUrl);
const scoresBreaker = createBreaker(scoresUrl);
const targetsBreaker = createBreaker(targetsUrl);

const proxyOptions = {
    changeOrigin: true,
    logLevel: 'debug'
};

// Routes with circuit breaker and proxy
app.all('/api/auth/*', circuitBreakerMiddleware(authBreaker), proxy({ target: authsUrl, ...proxyOptions }));
app.all('/api/scores/*', circuitBreakerMiddleware(scoresBreaker), proxy({ target: scoresUrl, ...proxyOptions }));
app.all('/api/targets/*', circuitBreakerMiddleware(targetsBreaker), proxy({ target: targetsUrl, ...proxyOptions }));


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal Server Error');
});

app.listen(port, host, () => {
    console.info(`Started server on port ${port}`);
});