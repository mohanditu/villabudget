import express from 'express';
import cors from 'cors';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { connectDb } from './db.js';
import { api } from './routes/api.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', api);

// In production, serve the built React app from client/dist.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Addresses other devices on the same Wi-Fi / LAN can use to reach this computer.
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const port = Number(process.env.PORT) || 4100;
// No host argument: listens on all interfaces (IPv4 + IPv6), so the LAN can reach it.
connectDb()
  .then(() => app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`  on your network: http://${ip}:${port}`);
  }))
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
