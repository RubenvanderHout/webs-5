import "dotenv/config";
import express from "express"
import proxy from 'express-http-proxy';

const port = process.env.PORT
const host = process.env.HOST

const app = express();

const authsUrl = process.env.URL_AUTH
const scoresUrl = process.env.URL_SCORES
const targetsUrl = process.env.URL_TARGETS

async function authMiddleware(req, res, next) {
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
       res.status(500).send('Could not authenticate JWT');
       return 
    }
}

app.use(authMiddleware)

app.all("/api/auth/*", (req, res, next) => {
    
    console.log('Forwarding request to:', authsUrl + req.url);
    next();
}, proxy(authsUrl));

app.all("/api/scores/*", (req, res, next) => {
    console.log('Forwarding request to:', scoresUrl + req.url);
    next();
}, proxy(scoresUrl));

app.all("/api/targets/*", (req, res, next) => {
    console.log('Forwarding request to:', targetsUrl + req.url);
    next();
}, proxy(targetsUrl));


app.listen(port, host, () => {
    console.info(`Started server on port ${port}`);
});