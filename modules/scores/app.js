import "dotenv/config";
import express from "express"

const port = process.env.PORT
const host = process.env.HOST

async function main() {
    await setupDB();
    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));

    // Get all competitions with scores
    app.get("/api/competitions/scores", async (req, res) => {
        
    })

    // Get competition





    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });
}


async function setupDB(){
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.HOST,
            user: process.env.DB.USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
            port: process.env.DB_PORT
        });

        // Create users table if it doesn't exist
        await connection.execute(`
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(250) PRIMARY KEY NOT NULL,
                email VARCHAR(250) NOT NULL,
            );
            
            -- Competitions table
            CREATE TABLE IF NOT EXISTS competitions (
                competition_id INT PRIMARY KEY AUTO_INCREMENT,
                competition_name VARCHAR(250) NOT NULL
            );
            
            -- Scores table
            CREATE TABLE IF NOT EXISTS scores (
                score_id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(250),
                competition_id INT,
                score_value INT,
                FOREIGN KEY (username) REFERENCES users(username),
                FOREIGN KEY (competition_id) REFERENCES competitions(competition_id)
            );
        `);

        return connection;
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}


main();