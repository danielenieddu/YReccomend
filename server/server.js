import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const publicPath = path.join(__dirname, '../public');

app.use(express.static(publicPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/api/theme', (req, res) => {
    const themePath = path.join(publicPath, 'theme.json');
    res.sendFile(themePath, (err) => { 
        if (err) {
            console.log("Theme.json non trovato, uso default.");
            res.status(404).end(); 
        }
    });
});

//avvio
const PORT = 5173;
app.listen(PORT, () => {
    console.log(`Indirizzo: http://localhost:${PORT}`);
});