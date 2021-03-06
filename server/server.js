var express = require("express"), app = express(), fs = require('fs'), redis = require('redis'), http = require('http'), url = require('url')
var server = http.createServer(app), io = require('socket.io').listen(server);

io.set('log level', 1);
var globalIOSocket;
// Talks to websocket on client side
io.sockets.on('connection', function (socket) {
		// socket.emit('serviceconfig', { hello: 'world' });
		globalIOSocket = socket;
	});

// Approximate number of elements in a single query output
var MAX_ELEMS = 200;

function shrinkArray(dp) {
  if (dp.length > MAX_ELEMS) {
    var skip_factor = parseInt(dp.length / MAX_ELEMS);

    dp = dp.filter(function(elem, index, self) {
      return index % skip_factor == 0;
    });
  }

  return dp;
}


// MongoDB connection variables
var MongoClient = require('mongodb').MongoClient, format = require('util').format;
MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
// Redis subscriber
client_sc = redis.createClient(null, 'localhost')
client_sc.on("message", function (channel, message) {
    //console.log("Service_Config listener : channel " + channel + ": " + message + ". Writing to MongoDB");
	    if(err) throw err;
	    var collection = db.collection('serviceconfigs');
	    msgJson = JSON.parse(message)	
		collection.insert(msgJson, function(){}); 
		if(globalIOSocket)
			globalIOSocket.emit('serviceconfig', msgJson);
	});
client_sc.subscribe("serviceconfig");

// Redis subscriber
client_sm = redis.createClient(null, 'localhost')
client_sm.on("message", function (channel, message) {
    //console.log("Service_Metrics listener : channel " + channel + ": " + message + ". Writing to MongoDB");
	    if(err) throw err;
	    var collection = db.collection('servicemetrics');
	    msgJson = JSON.parse(message)	

      collection.insert(msgJson, function(){});
		//collection.insert({'service':msgJson.service, 'calls' : msgJson.calls, 'total_resp_ms' : msgJson.clients, "errors" : msgJson.errors, 'avg_resp_ms': msgJson.avg_resp_ms, 'timestamp': msgJson.timestamp}, function(){}); // Inserting the ramble and the time when the ramble was rambled! :D
		if(globalIOSocket)
			globalIOSocket.emit('servicemetrics', msgJson);

});
client_sm.subscribe("servicestats");

client_cm = redis.createClient(null,'localhost')
client_cm.on("message", function (channel, message) {
   // console.log("Client_Metrics listener : channel " + channel + ": " + message + ". Writing to MongoDB");
	    if(err) throw err;
	    var collection = db.collection('clientmetrics');
	    msgJson = JSON.parse(message)	
      	collection.insert(msgJson, function(){});
		  // collection.insert({'service':msgJson.service, 'calls' : msgJson.calls, 'total_resp_ms' : msgJson.clients, "errors" : msgJson.errors, 'avg_resp_ms': msgJson.avg_resp_ms}, function(){}); // Inserting the ramble and the time when the ramble was rambled! :D

		if(globalIOSocket)
			globalIOSocket.emit('clientmetrics', msgJson);

});
client_cm.subscribe("clientstats");

});


server.listen(8000);

app.configure(function(){
  app.use(express.static(__dirname + '/'));
  app.use(express.errorHandler({
    dumpExceptions: true, 
    showStack: true
  }));
});

app.get("/", function handler (req, res) {
	//console.log(req.url);

	// if(req.url=='/addService'){
	// 	var node = graphdb.createNode({hello: 'world'});     // instantaneous, but...
	// 	node.save(function (err, node) {    // ...this is what actually persists.
	// 	    if (err) {
	// 	        console.error('Error saving new node to database:', err);
	// 	    } else {
	// 	        console.log('Node saved to database with id:', node.id);
	//     }
	// 	});
	// }
	// else {
	fs.readFile(__dirname + '/index.html', function (err, data) {
		if (err) {
			res.writeHead(500);
			return res.end('Error loading index.html');
		}

		res.writeHead(200);
		res.end(data);
	});
});

app.get("/metrics/service/:service", function handler(req,res){
	var dp = [];
	MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
		var collection = db.collection('servicemetrics');
		var date = new Date() - 24 * 60 * 60 * 1000;
		collection.find({
	 		timestamp: {
	   			$gte: date
	  		},
	  		service: req.params.service
		}, function(err, cursor) {
      cursor.toArray(function(err, docs){
        for(i=0;i<docs.length;i++){
          dp.push(docs[i]['avg_resp_ms']);
        }

        dp = shrinkArray(dp);
        console.log(dp);
        res.end(JSON.stringify(dp));
      });
    });
  });
	res.writeHead(200,{'Content-Type':'text/plain'});
});

app.get("/configs", function handler(req,res){
	dp =[];
	MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
		var collection = db.collection('serviceconfigs');
		collection.find().toArray(function(err, docs) {
					var services = {}
					for(i=0;i<docs.length;i++){
						services[docs[i].service_name] = docs[i];
					}
					console.log(services);
					res.writeHead(200,{"Content-Type" : "text/plain"});
					res.end(JSON.stringify(services));
				});
          });
	});


app.get('/metrics/service/:service/dc/:dc', function(req, res) {
    console.log(req.params.service, req.params.dc);
    res.writeHead(200,{'Content-Type':'application/json'});
    //res.send('Hello world!');

    MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
      var collection = db.collection('servicemetrics');
      var timestamp24HoursAgo = new Date() - 24 * 60 * 60 * 1000;
      collection.group(['timestamp'],
        {'timestamp': {$gte: timestamp24HoursAgo},
	  		 'service': req.params.service,
         'instance': {$regex: req.params.dc + '/.*'}},
        {'value': 0, 'count': 0},
        function(obj, prev) {
            prev.count += obj.calls;
            prev.value += obj.total_resp_ms;
        },
        true,
        function(err, grouped_value) {
          if (err) {
            console.error(err);
          }
          console.log(grouped_value);
          var values = [];
          for (var i = 0; i < grouped_value.length; i ++) {
            var value = grouped_value[i];
            values.push(value.value/value.count || 0.0);
          }
          values = shrinkArray(values);
          res.end(JSON.stringify(values));
        }
      );

    });
});


app.get('/metrics/service/:service/client/:client', function(req, res) {
    console.log(req.params.service, req.params.client);
    res.writeHead(200,{'Content-Type':'application/json'});
    //res.send('Hello world!');

    MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
      var collection = db.collection('clientmetrics');
      var timestamp24HoursAgo = new Date() - 24 * 60 * 60 * 1000;
      collection.group(['timestamp'],
        {'timestamp': {$gte: timestamp24HoursAgo},
         'client': {$regex: req.params.service + '/' + req.params.client}},
        {'value': 0, 'count': 0},
        function(obj, prev) {
            prev.count += obj.calls;
            prev.value += obj.total_resp_ms;
        },
        true,
        function(err, grouped_value) {
          if (err) {
            console.error(err);
          }
          console.log(grouped_value);
          var values = [];
          if(grouped_value==null){
          	res.end('[]');
          	return;
          }
          for (var i = 0; i < grouped_value.length; i ++) {
            var value = grouped_value[i];
            values.push(value.value/value.count || 0.0);
          }
          values = shrinkArray(values);
          res.end(JSON.stringify(values));
        }
      );

    });
});

app.get('/metrics/service/:service/clients', function(req, res) {
    console.log(req.params.service);
    res.writeHead(200,{'Content-Type':'application/json'});
    //res.send('Hello world!');

    MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
      var collection = db.collection('clientmetrics');
      var timestamp24HoursAgo = new Date() - 24 * 60 * 60 * 1000;
      collection.find({
        'timestamp': {
          $gte: timestamp24HoursAgo
        },
        'client': {
          $regex: req.params.service + '/.*'
        },
      },
      {'fields': ['client', 'service']},
      function(err, cursor) {
        cursor.toArray(function(err, clients) {
          if(clients==null){
          	return [];
          }
          var uniq_clients = (clients.map(function(x) {
            return x['client'].split('/')[1] + ' :: ' + x['service'];
          })
          .filter(function(elem, index, self) {
            return self.indexOf(elem) == index;
          }))
          .map(function(x) {
            return {'client': x.split(' :: ')[0], 'service': x.split(' :: ')[1]};
          });

          res.end(JSON.stringify(uniq_clients));
        });
      });
    });
});

app.get('/metrics/service/:service/dcs', function(req, res) {
    console.log(req.params.service);
    res.writeHead(200,{'Content-Type':'application/json'});
    //res.send('Hello world!');

    MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
      var collection = db.collection('servicemetrics');
      var timestamp24HoursAgo = new Date() - 24 * 60 * 60 * 1000;
      collection.find({
        'timestamp': {
          $gte: timestamp24HoursAgo
        },
        'service': req.params.service,
      },
      {'fields': ['instance']},
      function(err, cursor) {
        cursor.toArray(function(err, dcs) {
          var uniq_dcs = (dcs.map(function(x) {
            return x['instance'].split('/')[0];
          })
          .filter(function(elem, index, self) {
            return self.indexOf(elem) == index;
          }));

          res.end(JSON.stringify(uniq_dcs));
        });
      });
    });
});

app.get('/metrics/service/:service/machine/:machine', function(req, res) {
    console.log(req.params.service, req.params.machine);
    res.writeHead(200,{'Content-Type':'application/json'});
    //res.send('Hello world!');

    MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
      var collection = db.collection('servicemetrics');
      var timestamp24HoursAgo = new Date() - 24 * 60 * 60 * 1000;
      collection.group(['timestamp'],
        {'timestamp': {$gte: timestamp24HoursAgo},
	  		 'service': req.params.service,
         'instance': {$regex: '.*/'+req.params.machine}},
        {'value': 0, 'count': 0},
        function(obj, prev) {
            prev.count += obj.calls;
            prev.value += obj.total_resp_ms;
        },
        true,
        function(err, grouped_value) {
          if (err) {
            console.error(err);
          }
          console.log(grouped_value);
          var values = [];
          for (var i = 0; i < grouped_value.length; i ++) {
            var value = grouped_value[i];
            values.push(value.value/value.count || 0.0);
          }
          values = shrinkArray(values);
          res.end(JSON.stringify(values));
        }
      );

    });
});


app.get('/metrics/service/:service/dcaggr/:dc', function(req, res) {
    console.log(req.params.service, req.params.dc);
    res.writeHead(200,{'Content-Type':'application/json'});
    //res.send('Hello world!');

    MongoClient.connect('mongodb://127.0.0.1:27017/service_graph', function(err, db) {
      var collection = db.collection('servicemetrics');
      var timestamp24HoursAgo = new Date() - 24 * 60 * 60 * 1000;
      collection.group(['instance','timestamp'],
        {'timestamp': {$gte: timestamp24HoursAgo},
	  		 'service': req.params.service,
         'instance': {$regex: req.params.dc + '/.*'}},
        {'value': 0, 'count': 0},
        function(obj, prev) {
            prev.count += obj.calls;
            prev.value += obj.total_resp_ms;
        },
        true,
        function(err, grouped_value) {
          if (err) {
            console.error(err);
          }
          console.log(grouped_value);
          var values = {};
          for (var i = 0; i < grouped_value.length; i ++) {
            var value = grouped_value[i];
            if(values[value['instance']]== null){
            	values[value['instance']] = []
            }
            values[value['instance']].push(value.value/value.count || 0.0);
          }
          for(i in values){
          	values[i] = shrinkArray(values[i]);
          }
          res.end(JSON.stringify(values));
        }
      );

    });
});

function trackCurrentState() {
  var inertia = 0.9;
  var runningAvg = {};
  var counter = 0;

  MongoClient.connect('mongodb://localhost:27017/service_graph', function(err, db) {
    var collection = db.collection('clientmetrics');
    var timestamp25HoursAgo = new Date() - 25 * 60 * 60 * 1000;
    var stream = collection.find({
        'timestamp': {$gte: timestamp25HoursAgo}
    }, {
      tailable: true,
      await_data: true,
      numberOfRetries: -1
    }).stream();

    stream.on('data', function(item) {
      counter ++;
      var svc = item['service'];
      if (!runningAvg[svc]) {
        runningAvg[svc] = {
          'resp_ms': item['avg_resp_ms'],
          'error_rate': (!item['calls']) ? 0.0 : item['errors'] / item['calls']
        };
      } else {
        runningAvg[svc] = {
          'resp_ms': (item['avg_resp_ms']) * (1 - inertia) + runningAvg[svc]['resp_ms'] * inertia,
          'error_rate': ((!item['calls']) ? 0.0 : item['errors'] / item['calls']) * (1 - inertia) + runningAvg[svc]['error_rate'] * inertia
        }
      }

      if(globalIOSocket)
        globalIOSocket.emit('servicestate', runningAvg);

      if (counter % 10 == 0) {
        console.log('****************', counter, '*****************');
        console.log(new Date(item['timestamp']));
        for (var svc in runningAvg) {
          console.log(svc, runningAvg[svc]);
        }
      }
    });
  });
}

trackCurrentState();

