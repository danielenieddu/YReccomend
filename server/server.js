import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/src', express.static(path.join(__dirname, '..', 'src')));

// Contratto B (opzionale): se theme.json esiste lo serviamo, altrimenti 404
app.get('/api/theme', (req, res) => {
  const themePath = path.join(__dirname, '..', 'public', 'theme.json');
  res.sendFile(themePath, (err) => { if (err) res.status(404).end(); });
});

// (Contratto A viene letto da file mock direttamente dalla UI: /public/data/mock_recs.json)

app.listen(5173, () => console.log('UI pronta: http://localhost:5173/public/index.html'));
