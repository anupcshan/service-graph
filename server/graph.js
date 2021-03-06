var socket = io.connect('http://localhost');
      socket.on('serviceconfig', function (data) {
      console.log(data);
      nodesList[data.service_name] = {name:data.service_name, respthresh:data.response_time_thresh_ms, errthresh:data.error_thresh};
      data.clients.forEach(function(x){
        var service_name = x.service_name;
        console.log(service_name);
        nodesList[service_name] = {name:x.service_name};
        // if(edgesList[data.service_name]===undefined)
        //   edgesList[data.service_name] = {}
        // edgesList[data.service_name][service_name] = {directed: true};
        globalRend.addEdge(data.service_name, service_name, { directed: true, weight:3 });
        console.log(edgesList[data.service_name]);
      });
      globalRend.graft({
        nodes : nodesList, 
        edges : edgesList 
      });

      globalRend.renderer.redraw();
    });

      socket.on('servicestate', function (data) {
      console.log(data);
      console.log(nodesList);
      for(i in data){
        nodesList[i]['error_rate'] = data[i].error_rate;
        nodesList[i]['resp_ms'] = data[i].resp_ms;
        if(nodesList[i]['errthresh'] && (data[i].error_rate - nodesList[i]['errthresh'] > 0)){
            nodesList[i]['color'] = 'red';
          } else 
          if(nodesList[i]['respthresh'] && (nodesList[i]['respthresh']-data[i].resp_ms < 0)){
            nodesList[i]['color'] = 'blue';
          } else {
            nodesList[i]['color'] = 'green';
          }
          
      }
      globalRend.graft({
        nodes : nodesList, 
        edges : edgesList 
      });

      console.log("Redrawing");
      globalRend.renderer.redraw();
    });


nodesList = {}
edgesList = {}
// Populate original list from serviceconfig
// MongoDB connection variables
$.ajax({ 
  dataType: 'json',
  url: "/configs", 
  success: function(docs) {
    console.log(docs)
      for(i in docs){
        nodesList[i] = {name:i, respthresh:docs[i].response_time_thresh_ms, errthresh:docs[i].error_thresh};    
          for(j=0;j<docs[i].clients.length;j++){
            if(edgesList[i]===undefined)
              edgesList[i]={}
            edgesList[i][docs[i].clients[j].service_name] = {};
            nodesList[docs[i].clients[j].service_name] = {name:docs[i].clients[j].service_name};

          }
      }
      console.log(nodesList);
      console.log(edgesList);
  },
  async:false});
    
var globalRend;

(function($){

  var Renderer = function(canvas){
    var canvas = $(canvas).get(0)
    var ctx = canvas.getContext("2d");
    var particleSystem

    var that = {
      init:function(system){
        //
        // the particle system will call the init function once, right before the
        // first frame is to be drawn. it's a good place to set up the canvas and
        // to pass the canvas size to the particle system
        //
        // save a reference to the particle system for use in the .redraw() loop
        particleSystem = system

        // inform the system of the screen dimensions so it can map coords for us.
        // if the canvas is ever resized, screenSize should be called again with
        // the new dimensions
        particleSystem.screenSize(canvas.width, canvas.height) 
        particleSystem.screenPadding(80) // leave an extra 80px of whitespace per side
        
        // set up some event handlers to allow for node-dragging
        that.initMouseHandling()
      },
      
      redraw:function(){
        // 
        // redraw will be called repeatedly during the run whenever the node positions
        // change. the new positions for the nodes can be accessed by looking at the
        // .p attribute of a given node. however the p.x & p.y values are in the coordinates
        // of the particle system rather than the screen. you can either map them to
        // the screen yourself, or use the convenience iterators .eachNode (and .eachEdge)
        // which allow you to step through the actual node objects but also pass an
        // x,y point in the screen's coordinate system
        // 
        ctx.fillStyle = "white"
        ctx.fillRect(0,0, canvas.width, canvas.height)
        
        particleSystem.eachEdge(function(edge, pt1, pt2){
          // edge: {source:Node, target:Node, length:#, data:{}}
          // pt1:  {x:#, y:#}  source position in screen coords
          // pt2:  {x:#, y:#}  target position in screen coords

          // draw a line from pt1 to pt2
          ctx.strokeStyle = "rgba(0,0,0, .333)"
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(pt1.x, pt1.y)
          ctx.lineTo(pt2.x, pt2.y)
          ctx.stroke()
        })

        particleSystem.eachNode(function(node, pt){
          // node: {mass:#, p:{x,y}, name:"", data:{}}
          // pt:   {x:#, y:#}  node position in screen coords

          // draw a rectangle centered at pt

          var w = 50
          ctx.fillStyle = node.data.color || 'green'
          
          ctx.fillRect(pt.x-w/2, pt.y-w/2, w,w)
          ctx.font="15px Georgia";
          ctx.fillText(node.data.name,pt.x+w/2,pt.y);
          ctx.fillText((node.data.error_rate*100).toFixed(2)+"%",pt.x+w/2,pt.y+w/2+10);
          ctx.fillText(node.data.resp_ms+" ms",pt.x+w/2,pt.y+w/2-10);
        })                            
      },
      
      initMouseHandling:function(){
        // no-nonsense drag and drop (thanks springy.js)
        var dragged = null;

        // set up a handler object that will initially listen for mousedowns then
        // for moves and mouseups while dragging
        var handler = {
          clicked:function(e){
            console.log(e);
            
            var pos = $(canvas).offset();
            _mouseP = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)
            dragged = particleSystem.nearest(_mouseP);
            window.location="/service.html?SERVICE="+dragged.node.name;

            if (dragged && dragged.node !== null){
              // while we're dragging, don't let physics move the node
              dragged.node.fixed = true
            }

            $(canvas).bind('mousemove', handler.dragged)
            $(window).bind('mouseup', handler.dropped)

            return false
          },
          dragged:function(e){
            var pos = $(canvas).offset();
            var s = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)

            if (dragged && dragged.node !== null){
              var p = particleSystem.fromScreen(s)
              dragged.node.p = p
            }

            return false
          },

          dropped:function(e){
            if (dragged===null || dragged.node===undefined) return
            if (dragged.node !== null) dragged.node.fixed = false
            dragged.node.tempMass = 1000
            dragged = null
            $(canvas).unbind('mousemove', handler.dragged)
            $(window).unbind('mouseup', handler.dropped)
            _mouseP = null
            return false
          }
        }
        
        // start listening
        $(canvas).mousedown(handler.clicked);

      },
      
    }
    return that
  }    

  $(document).ready(function(){
    var sys = arbor.ParticleSystem(1500, 900, 0.5) // create the system with sensible repulsion/stiffness/friction
    globalRend = sys;
    sys.parameters({gravity:true}) // use center-gravity to make the graph settle nicely (ymmv)
    sys.renderer = Renderer("#viewport") // our newly created renderer will have its .init() method called shortly by sys...

    // or, equivalently:
    //
    sys.graft({
      nodes : nodesList, 
      edges : edgesList})
    
  })

})(this.jQuery)
