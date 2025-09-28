// Script d'initialisation du replica set
db = db.getSiblingDB('admin');

// Attendre que MongoDB soit prêt
sleep(2000);

// Initialiser le replica set
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

// Créer la base de données velo si elle n'existe pas
db = db.getSiblingDB('velo');
db.createCollection('reports');
print("✅ Base de données 'velo' créée");