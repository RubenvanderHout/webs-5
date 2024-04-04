import "dotenv/config";
import http from "http";

const port = '6000'
const host = '0.0.0.0'

async function main() {
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));
    const app = http.createServer(server);

    app.listen(port, host, () => {
        logger.info(`Started server on port ${port}`);
    });


}


main();





    

  