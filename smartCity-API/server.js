require('dotenv').config();

const app = require('./src/app');
const os = require('os');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
console.log('');
const interfaces = os.networkInterfaces();
Object.values(interfaces).forEach(ifaceList => {
    ifaceList.forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`Réseau: http://${iface.address}:${PORT}`);
        }
    });
});
});