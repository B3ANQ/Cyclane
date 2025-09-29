db = db.getSiblingDB('admin');

sleep(2000);

try {
  rs.initiate({
    _id: "rs0",
    members: [
      {
        _id: 0,
        host: "localhost:27017"
      }
    ]
  });
  
  print("✅ Replica set initialisé avec succès");
} catch (e) {
  print("⚠️ Replica set déjà initialisé ou erreur:", e);
}

db = db.getSiblingDB('velo');
db.createCollection('reports');
print("✅ Base de données 'velo' créée");