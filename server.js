//  OpenShift sample Node application
var express = require('express'),
    app     = express(),
    morgan  = require('morgan'),
    userHashes = require('./userHashes');
    
Object.assign = require('object-assign');

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'));

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
      mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
      mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
      mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
      mongoPassword = process.env[mongoServiceName + '_PASSWORD'],
      mongoUser = process.env[mongoServiceName + '_USER'];

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

  }
}
var db = null,
    dbDetails = {};

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);

    const tshirtCol = db.collection('contributeurTshirt');
    const missingContributeurs = {};
    userHashes.forEach( userHash => missingContributeurs[userHash] = true );

    tshirtCol.find({}).forEach(function (contributeurTshirt) {
      delete missingContributeurs[contributeurTshirt.hash];
    }, function (error) {
      if (error) {
        callback(error);
      } else {
        const toInsert = Object.keys(missingContributeurs).map( hash => { return { hash: hash }; });
        if (toInsert.length) {
          tshirtCol.insertMany(toInsert).then(
              value => { console.log("insertion des contributeurs", value); },
              error => { console.log("erreur à l'insertion des contributeurs", error); }
          );
        } else {
          console.log("c'est bon, tout le monde est là");
        }
      }
    });
  });
};

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
      initDb( err => console.error("erreur à l'init db", err) );
  }
  if (db) {
    var col = db.collection('counts');
    // Create a document with request IP and current time of request
    col.insertOne({ip: req.ip, date: Date.now()});
    col.count(function (err, count){
      if (err) {
        console.log('Error running count. Message:\n'+err);
      }
      res.render('index.html', { serverMessage : "Coucou toi, qu'est-ce que tu fais là ?" });
    });
  } else {
    console.log("ça marche pas");
    res.render('index.html', { serverMessage: "Saperlipopette, c'est tout cassé 😭" });
  }
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb( err => console.error("erreur à l'init db", err) );
  }
  if (db) {
    db.collection('counts').count(function (err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

app.get('/tshirtResults', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb( err => console.error("erreur à l'init db", err) );
  }
  if (db) {
    db.collection('contributeurTshirt').find({}).toArray(function (err, result) {
      if (err) {
        res.send('{ error: ' + JSON.stringify(err) + ' }');
      } else {
        res.send(JSON.stringify(result));
      }
    });
  } else {
    res.send('{ error: "db down" }');
  }
});

app.get('/tshirt/:secret', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb( err => console.error("erreur à l'init db", err) );
  }
  const secret = req.params.secret;
  if (db && secret) {
    const tshirtCol = db.collection('contributeurTshirt');
    tshirtCol.findOne({hash: secret}, function (err, result) {
      if (err) {
        console.error("erreur au fetch d'un contributeur", secret, err);
        res.render('index.html', {serverMessage: "Saperlipopette, c'est tout cassé 😭"});
      } else if (! result) {
        console.info("contributeur inconnu", secret, err);
        res.render('index.html', {serverMessage: "Mais qui êtes vous ?"});
      } else {
        console.info("contributeur trouvé", result);
        res.render('index.html', {serverMessage: false});
      }
    });
  } else {
    console.log("ça marche pas", secret);
    res.render('index.html', {serverMessage: "Saperlipopette, c'est tout cassé 😭"});
  }
});

const tshirtSizes = {
  S: true,
  M: true,
  L: true,
  XL: true,
  XXL: true
};

app.get('/tshirt/:secret/:size', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
      initDb( err => console.error("erreur à l'init db", err) );
  }
  const secret = req.params.secret;
  const size = req.params.size;
  if (db && secret && size && tshirtSizes[size]) {
    const tshirtCol = db.collection('contributeurTshirt');
    tshirtCol.updateOne({ hash: secret }, { $set: { tshirtSize: size } }, function(err, result) {
      if (err) {
        console.error("erreur à la mise à jour d'un contributeur", secret, size, err);
        res.render('index.html', { serverMessage : "ça n'a pas marché, désolé... Vous voulez bien réessayer un peu plus tard ?"});
      } else {
         console.info("contributeur mis à jour", secret, size, result);
         if (result.result.nModified === 1) {
           res.render('index.html', { serverMessage : false});
         } else {
           console.info("contributeur inconnu", secret, err);
           res.render('index.html', {serverMessage: "Mais qui êtes vous ?"});
         }
      }
    });
  } else {
    console.log("ça marche pas", secret, size);
    res.render('index.html', { serverMessage : "Saperlipopette, c'est tout cassé 😭"});
  }
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
