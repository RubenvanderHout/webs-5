import "dotenv/config";
import { buildserver } from "./server";
import logger from "./utils/logger";
import http from "http";

const port = Number(process.env.PORT ?? 3000);
const host = String(process.env.HOST ?? "0.0.0.0");

async function main() {
  try {
    const server = await buildserver();
    const app = http.createServer(server);

    app.listen(port, host, () => {
      logger.info(`Started server on port ${port}`);
    });

  } catch (error) {
    logger.fatal(error);
  }
}


main();