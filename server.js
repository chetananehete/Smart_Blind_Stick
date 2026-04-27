const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use('/public', express.static('public'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const routesPath = path.join(__dirname, 'routes.json');
const sensorLogPath = path.join(__dirname, 'sensor-log.json');
const latestDataPath = path.join(__dirname, 'latest-data.json');
let routeData = [];

if (fs.existsSync(routesPath)) {
  try {
    routeData = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  } catch (error) {
    console.warn('Unable to read routes.json, using an empty route list.');
  }
} else {
  console.warn('routes.json not found, using an empty route list.');
}

function sanitizeReading(source = {}) {
  return {
    time: source.time ?? new Date().toLocaleTimeString(),
    distance: source.distance ?? 999,
    water: source.water ?? 0,
    lat: source.lat ?? null,
    lng: source.lng ?? null,
    route: source.route ?? 0,
    waypoint: source.waypoint ?? 0
  };
}

let sensorLog = [];
let latestReading = null;

if (fs.existsSync(sensorLogPath)) {
  try {
    sensorLog = JSON.parse(fs.readFileSync(sensorLogPath, 'utf8'));
    if (!Array.isArray(sensorLog)) sensorLog = [];
    sensorLog = sensorLog.map(sanitizeReading);
    latestReading = sensorLog.length ? sensorLog[sensorLog.length - 1] : null;
  } catch (error) {
    console.warn('Unable to read sensor-log.json, starting with empty log.');
    sensorLog = [];
  }
}

if (latestReading) {
  fs.writeFileSync(latestDataPath, JSON.stringify(latestReading, null, 2));
  fs.writeFileSync(sensorLogPath, JSON.stringify(sensorLog, null, 2));
}

const MAX_LOG = 200;

app.post('/data', (req, res) => {
  const entry = sanitizeReading({
    ...req.body,
    time: new Date().toLocaleTimeString()
  });

  sensorLog.push(entry);
  if (sensorLog.length > MAX_LOG) sensorLog.shift();
  latestReading = entry;

  fs.writeFile(sensorLogPath, JSON.stringify(sensorLog, null, 2), (error) => {
    if (error) console.error('Failed to save sensor-log.json:', error.message);
  });

  fs.writeFile(latestDataPath, JSON.stringify(latestReading, null, 2), (error) => {
    if (error) console.error('Failed to save latest-data.json:', error.message);
  });

  console.log(`[${entry.time}] dist=${entry.distance}cm water=${entry.water}`);
  res.sendStatus(200);
});

app.get('/log', (req, res) => res.json(sensorLog));
app.get('/log.json', (req, res) => res.sendFile(sensorLogPath));
app.get('/latest', (req, res) => res.json(latestReading || {}));
app.get('/latest.json', (req, res) => res.sendFile(latestDataPath));
app.get('/routes', (req, res) => res.json(routeData));

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});