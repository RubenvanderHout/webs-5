
export async function buildserver() {
    const server = express();
    
    server.use(express.json());
    server.use(express.urlencoded({ extended: false }));
    
    await loadRoutes(server, "modules");
  
    return server;
}
