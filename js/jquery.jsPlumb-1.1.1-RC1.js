/*
 * jsPlumb 1.1.1-RC1
 * 
 * Provides a way to visually connect elements on an HTML page.
 * 
 * 1.1.1 contains bugfixes and API additions on 1.1.0
 * 
 * http://morrisonpitt.com/jsPlumb/demo.html
 * http://code.google.com/p/jsPlumb
 * 
 */ 
if (!Array.prototype.findIndex) {
	Array.prototype.findIndex = function( v, b, s ) {
	
	var _eq = function(o1, o2) {
		if (o1 === o2) return true;
		else if (typeof o1 == 'object' && typeof o2 == 'object') {
			var same = true;
				for(var propertyName in o1) {				
				      if(!_eq(o1[propertyName], o2[propertyName])) {
				         same = false;
				         break;
				      }
				   }
				   for(var propertyName in o2) {				
				   				      if(!_eq(o2[propertyName], o1[propertyName])) {
				   				         same = false;
				   				         break;
				   				      }
				   }
				   return same;

			
		}	
	};
	
	 for( var i = +b || 0, l = this.length; i < l; i++ ) {
	  //if( this[i]===v || s && this[i]==v ) { return i; }
	  if( _eq(this[i], v)) { return i; }
	 }
	 return -1;
	};
}
(function() {
	
	var ie = (/MSIE/.test(navigator.userAgent) && !window.opera);
	
	var log = null;
	
	var repaintFunction = function() { jsPlumb.repaintEverything(); };
	var automaticRepaint = true;
    function repaintEverything() {
    	if (automaticRepaint)
    		repaintFunction();
    };
    var resizeTimer = null;
    $(window).bind('resize', function() {
    	if (resizeTimer) clearTimeout(resizeTimer);
	    resizeTimer = setTimeout(repaintEverything, 100);
     });
	
	/**
	 * map of element id -> endpoint lists.  an element can have an arbitrary number of endpoints on it,
	 * and not all of them have to be connected to anything.
	 */
	var endpointsByElement = {};
	var offsets = [];
	var floatingConnections = {};
	var draggableStates = {};
	var _draggableByDefault = true;
	var sizes = [];
	var _jsPlumbContextNode = null;
	
	var DEFAULT_NEW_CANVAS_SIZE = 1200; // only used for IE; a canvas needs a size before the init call to excanvas (for some reason. no idea why.)		
	
	/**
     * helper method to add an item to a list, creating the list if it does not yet exist.
     */
    var _addToList = function(map, key, value) {
		var l = map[key];
		if (l == null) {
			l = [];
			map[key] = l; 
		}
		l.push(value);
	};
	
    /**
     * Handles the dragging of an element.  
     * @param element jQuery element
     * @param ui UI object from jQuery's event system
     */
    var _draw = function(element, ui) {
    	var id = $(element).attr("id");    	
    	var endpoints = endpointsByElement[id];
    	if (endpoints) {
    		//if (ui == null) _updateOffset(id, ui);
    		_updateOffset(id, ui);
    		var myOffset = offsets[id];
			var myWH = sizes[id];
	    	// loop through endpoints for this element
	    	for (var i = 0; i < endpoints.length; i++) {
	    		var e = endpoints[i];
	    		// first, paint the endpoint
	    		
	    		var anchorLoc = endpoints[i].anchor.compute([myOffset.left, myOffset.top], myWH);
	           // var anchorOrientation = endpoints[i].anchor.getOrientation();
	    		
	    		//todo...connector paint style?  we have lost that with the move to endpoint-centric.
	    		// perhaps we only paint the endpoint here if it has no connections; it can use its own style.
	    		//if (!e.connections || e.connections.length == 0)
	    			e.paint(anchorLoc);
	            
	    	//	else {
	    		//if (e.connections && e.connections.length > 0) {
		    		// get all connections for the endpoint...
		    		var l = e.connections;
		    		for (var j = 0; j < l.length; j++)
		    			l[j].paint(id, ui);  // ...and paint them.
	    		//}
	    	}
    	}
    };
    
    /**
	 * helper function: the second argument is a function taking two args - the first is a
	 * jquery element, and the second is the element's id.
	 * 
	 * the first argument may be one of three things:
	 * 
	 *  1. a string, in the form "window1", for example.  an element's id. if your id starts with a
	 *     hash then jsPlumb does not append its own hash too... 
	 *  2. a jquery element, already resolved using $(...).
	 *  3. a list of strings/jquery elements.
	 */
	var _elementProxy = function(element, fn) {
		var retVal = null;
		if (typeof element == 'object' && element.length) {
			retVal = [];
    		for (var i = 0; i < element.length; i++) {
    			var el = typeof element[i] == 'string' ? $("#" + element[i]) : element[i];
    	    	var id = el.attr("id");
    			retVal.push(fn(el, id));  // append return values to what we will return
    		}
    	}
    	else {
	    	var el = typeof element == 'string' ? 
	    	//todo : this indexOf call here...is this bad? why not use a startsWith function?
	    				element.indexOf("#") == 0 ? $(element) : $("#" + element) 
	    						: element;
	    	var id = el.attr("id");
	    	retVal = fn(el, id);
    	}
		
		return retVal;
	};
	
	/**
     * Returns (creating if necessary) the DIV element that jsPlumb uses as the context for all of its 
     * canvases.  having this makes it possible to makes calls like $("selector", context), which are
     * faster than if you provide no context.  also we can clear out everything easily like this, either
     * on a detachEverything() call or during unload().
     */
    var _getContextNode = function() {
    	if (_jsPlumbContextNode == null) {
    		_jsPlumbContextNode= document.createElement("div");    		
    		document.body.appendChild(_jsPlumbContextNode);
    		_jsPlumbContextNode.className = "_jsPlumb_context";
    	}
    	return $(_jsPlumbContextNode);
    };
    
    /**
	 * gets an id for the given element, creating and setting one if necessary.
	 */
	var _getId = function(element) {
		var id = $(element).attr("id");
		if (!id) {
			id = "_jsPlumb_" + new String((new Date()).getTime());
			$(element).attr("id", id);
		}
		return id;
	};
    
    /**
     * inits a draggable if it's not already initialised.
     * todo: if the element was draggable already, like from some non-jsPlumb call, wrap the drag function. 
     */
    var _initDraggableIfNecessary = function(element, elementId, isDraggable, dragOptions) {
    	// dragging
	    var draggable = isDraggable == null ? _draggableByDefault : isDraggable;
	    if (draggable && element.draggable) {    	
	    	var options = dragOptions || jsPlumb.Defaults.DragOptions; 
	    	var dragCascade = options.drag || function(e,u) {};
	    	var initDrag = function(element, elementId, dragFunc) {
	    		var opts = $.extend({drag:dragFunc}, options);
	    		var draggable = draggableStates[elementId];
	    		opts.disabled = draggable == null ? false : !draggable;
	        	element.draggable(opts);
	    	};
	    	initDrag(element, elementId, function(event, ui) {
	    		 _draw(element, ui);
	    		 $(element).addClass("jsPlumb_dragged");
		    	dragCascade(event, ui);
	    	});
	    }
    	
    };
    
    var _log = function(msg) {
    // not implemented. yet.	
    }
    
    /**
     * helper to create a canvas.
     * @param clazz optional class name for the canvas.
     */
    var _newCanvas = function(clazz) {
        var canvas = document.createElement("canvas");
        _getContextNode().append(canvas);
        canvas.style.position="absolute";
        if (clazz) { canvas.className=clazz; }
        
        if (/MSIE/.test(navigator.userAgent) && !window.opera) {
        	// for IE we have to set a big canvas size. actually you can override this, too, if 1200 pixels
        	// is not big enough for the biggest connector/endpoint canvas you have at startup.
        	jsPlumb.sizeCanvas(canvas, 0, 0, DEFAULT_NEW_CANVAS_SIZE, DEFAULT_NEW_CANVAS_SIZE);
        	canvas = G_vmlCanvasManager.initElement(canvas);          
        }
        
        return canvas;
    };  
    /**
     * performs the given function operation on all the connections found for the given element
     * id; this means we find all the endpoints for the given element, and then for each endpoint
     * find the connectors connected to it. then we pass each connection in to the given
     * function.
     */
    var _operation = function(elId, func) {
    	var endpoints = endpointsByElement[elId];
    	if (endpoints && endpoints.length) {
    	//alert("there are " + endpoints.length + " endpoints");
	    	for (var i = 0; i < endpoints.length; i++) {
	    		for (var j = 0; j < endpoints[i].connections.length; j++) {
	    		//alert("there are " + endpoints[i].connections.length + " connections");
	    			var retVal = func(endpoints[i].connections[j]);
	    			// if the function passed in returns true, we exit.
	    			// most functions return false.
	    			if (retVal) return;
	    		}
	    	}
    	}
    };
    /**
     * perform an operation on all elements.
     */
    var _operationOnAll = function(func) {
    	for (var elId in endpointsByElement) {
    		_operation(elId, func);
    	}    	
    };
    /**
     * helper to remove an element from the DOM.
     */
    var _removeElement = function(element) {
    	if (element != null) { 
    		try { _jsPlumbContextNode.removeChild(element); }
    		catch (e) { }
    	}    	
    };
    /**
     * helper to remove a list of elements from the DOM.
     */
    var _removeElements = function(elements) {
    	for (var i in elements)
    		_removeElement(elements[i]);
    };
	/**
     * helper method to remove an item from a list.
     */
    var _removeFromList = function(map, key, value) {
		var l = map[key];
		if (l != null) {
			var i = l.findIndex(value);
			if (i >= 0) {
				delete( l[i] );
				l.splice( i, 1 );
				return true;
			}
		}		
		return false;
	};
	/**
     * Sets whether or not the given element(s) should be draggable, regardless of what a particular
     * plumb command may request.
     * 
     * @param element May be a string, a jQuery elements, or a list of strings/jquery elements.
     * @param draggable Whether or not the given element(s) should be draggable.
     */
	var _setDraggable = function(element, draggable) {    
    	var _helper = function(el, id) {
    		draggableStates[id] = draggable;
        	if (el.draggable) {
        		el.draggable("option", "disabled", !draggable);
        	}
    	};       
    	
    	return _elementProxy(element, _helper);
    };
	/**
	 * private method to do the business of hiding/showing.
	 * @param el either Id of the element in question or a jquery object for the element.
	 * @param state String specifying a value for the css 'display' property ('block' or 'none').
	 */
	var _setVisible = function(el, state) {
		var elId = typeof el == 'string' ? el : $(el).attr("id");
	    	var f = function(jpc) {
    		//todo should we find all the endpoints instead of going by connection? this will 
    		jpc.canvas.style.display = state;
			/*jpc.sourceEndpointCanvas.style.display = state;
			jpc.targetEndpointCanvas.style.display = state;*/
	    	};
    	
    	_operation(elId, f);
    };        
    /**
     * toggles the draggable state of the given element(s).
     * @param el either an id, or a jquery object, or a list of ids/jquery objects.
     */
    var _toggleDraggable = function(el) {    	
    	var fn = function(el, elId) {
    		var state = draggableStates[elId] == null ? _draggableByDefault : draggableStates[elId];
	    	state = !state;
	    	draggableStates[elId] = state;
	    	el.draggable("option", "disabled", !state);
	    	return state;
    	};
    	return _elementProxy(el, fn);
    };
    /**
    * private method to do the business of toggling hiding/showing.
    * @param elId Id of the element in question
    */
	var _toggleVisible = function(elId) {
    	var f = function(jpc) {
    		var state = ('none' == jpc.canvas.style.display);
    		jpc.canvas.style.display = state ? "block" : "none";
			/*jpc.sourceEndpointCanvas.style.display = state;
			jpc.targetEndpointCanvas.style.display = state;*/
    	};
    	
    	_operation(elId, f);
    	
    	//todo this should call _elementProxy, and pass in the _operation(elId, f) call as a function. cos _toggleDraggable does that.
    };
    /**
     * updates the offset and size for a given element, and stores the values.
     * if 'ui' is not null we use that (it would have been passed in from a drag call) because it's faster; but if it is null,
     * or if 'recalc' is true in order to force a recalculation, we use the offset, outerWidth and outerHeight methods to get
     * the current values.
     */
    var _updateOffset = function(elId, ui, recalc) {
    	
    	if (log) log.debug("updating offset for element [" + elId + "]; ui is [" + ui + "]; recalc is [" + recalc + "]");
    	
		if (recalc || ui == null) {  // if forced repaint or no ui helper available, we recalculate.
    		// get the current size and offset, and store them
    		var s = $("#" + elId);
    		sizes[elId] = [s.outerWidth(), s.outerHeight()];
    		offsets[elId] = s.offset();
		} else {
			// faster to use the ui element if it was passed in.
			// fix for change in 1.8 (absolutePosition renamed to offset). plugin is compatible with
			// 1.8 and 1.7.
			
			// todo: when the drag axis is supplied, the ui object passed in has incorrect values
			// for the other axis - like say you set axis='x'. when you move the mouse up and down
			// while dragging, the y values are for where the window would be if it was not
			// just constrained to x.  not sure if this is a jquery bug or whether there's a known
			// trick or whatever.
			var pos = ui.absolutePosition || ui.offset;
    		var anOffset = ui != null ? pos : $("#" + elId).offset();
    		offsets[elId] = anOffset;
		}
	};
    /**
     * wraps one function with another, creating a placeholder for the wrapped function
     * if it was null.  this is used to wrap the various drag/drop event functions - to allow
     * jsPlumb to be notified of important lifecycle events without imposing itself on the user's
     * drap/drop functionality.
     * TODO: determine whether or not we should try/catch the plumb function, so that the cascade function is always executed.
     */
    var _wrap = function(cascadeFunction, plumbFunction) {
    	cascadeFunction = cascadeFunction || function(e, ui) { };
    	return function(e, ui) {
    		plumbFunction(e, ui);
    		cascadeFunction(e, ui);
    	};
    }
	/**
	 * Anchor class. Anchors can be situated anywhere.  
	 * params should contain three values, and may optionally have an 'offsets' argument:
	 * 
	 * x 			: the x location of the anchor as a fraction of the total width.
	 *   
	 * y 			: the y location of the anchor as a fraction of the total height.
	 * 
	 * orientation 	: an [x,y] array indicating the general direction a connection 
	 * 				  from the anchor should go in. for more info on this, see the documentation, 
	 * 				  or the docs in jquery-jsPlumb-defaults-XXX.js for the default Anchors.
	 * 
	 * offsets 		: an [x,y] array of fixed offsets that should be applied after the x,y position has been figured out.  may be null.
	 * 
	 */	
	var Anchor = function(params) {
		var self = this;
		this.x = params.x || 0; this.y = params.y || 0; 
		var orientation = params.orientation || [0,0];
		this.offsets = params.offsets || [0,0];
		this.compute = function(xy, wh, txy, twh) {
			return [ xy[0] + (self.x * wh[0]) + self.offsets[0], xy[1] + (self.y * wh[1]) + self.offsets[1] ];
		}
		this.getOrientation = function() { return orientation; };
	};
	
	/**
	 * an anchor that floats.  its orientation is computed dynamically from its position relative
	 * to the anchor it is floating relative to.
	 */
	var FloatingAnchor = function(params) {
		
		// this is the anchor that this floating anchor is referenced to for purposes of calculating the orientation.
		var ref = params.reference;
		// these are used to store the current relative position of our anchor wrt the reference anchor.  they only indicate
		// direction, so have a value of 1 or -1 (or, very rarely, 0).  these values are written by the compute method, and read
		// by the getOrientation method.
		var xDir = 0, yDir = 0; 
		// temporary member used to store an orientation when the floating anchor is hovering over another anchor.
		var orientation = null;
		
		this.compute = function(xy, wh, txy, twh) {
			// set these for the getOrientation method to use.
			xDir = 0;//xy[0] < txy[0] ? -1 : xy[0] == txy[0] ? 0 : 1;
			yDir = 0;//xy[1] < txy[1] ? -1 : xy[1] == txy[1] ? 0 : 1;
			return [xy[0], xy[1]];  // return origin of the element.  we may wish to improve this so that any object can be the drag proxy.
		};
		
		this.getOrientation = function() {
			if (orientation) return orientation;
			else {
				var o = ref.getOrientation();
				// here we take into account the orientation of the other anchor: if it declares zero for some direction, we declare zero too.
				// this might not be the most awesome.  perhaps we can come up with a better way.  it's just so that the line we draw looks
				// like it makes sense.  maybe this wont make sense.
				return [Math.abs(o[0]) * xDir * -1, Math.abs(o[1]) * yDir * -1];
			}
		};
		
		/**
		 * notification the endpoint associated with this anchor is hovering over another anchor; 
		 * we want to assume that anchor's orientation for the duration of the hover. 
		 */
		this.over = function(anchor) {
			orientation = anchor.getOrientation();			
		};
		
		/**
		 * notification the endpoint associated with this anchor is no longer hovering 
		 * over another anchor; we should resume calculating orientation as we normally do.
		 */
		this.out = function() {
			orientation = null;
		};
	};
	
	// ************** connection
	// ****************************************
	/**
	* allowed params:
	* source:	source element (string or a jQuery element) (required)
	* target:	target element (string or a jQuery element) (required)
	* 
	* anchors: optional array of anchor placements. defaults to BottomCenter for source
	*          and TopCenter for target.
	*/
	var Connection = function(params) {

	// ************** get the source and target and register the connection. *******************
	    var self = this;
	    // get source and target as jQuery objects
	    this.source = (typeof params.source == 'string') ? $("#" + params.source) : params.source;    
	    this.target = (typeof params.target == 'string') ? $("#" + params.target) : params.target;
	    this.sourceId = $(this.source).attr("id");
	    this.targetId = $(this.target).attr("id");
	    this.endpointsOnTop = params.endpointsOnTop != null ? params.endpointsOnTop : true;	    
	    
	    // init endpoints
	    this.endpoints = [];
	    this.endpointStyles = [];
	    var prepareEndpoint = function(existing, index, params) {
	    	if (existing) self.endpoints[index] = existing;
		    else {
		    	if(!params.endpoints) params.endpoints = [null,null];
			    var ep = params.endpoints[index] || params.endpoint || jsPlumb.Defaults.Endpoints[index] || jsPlumb.Defaults.Endpoint|| new jsPlumb.Endpoints.Dot();
			    if (!params.endpointStyles) params.endpointStyles = [null,null];
			    var es = params.endpointStyles[index] || params.endpointStyle || jsPlumb.Defaults.EndpointStyles[index] || jsPlumb.Defaults.EndpointStyle;
			    var a = params.anchors  ? params.anchors[index] : jsPlumb.Defaults.Anchors[index] || jsPlumb.Anchors.BottomCenter;
			    self.endpoints[index] = new Endpoint({style:es, endpoint:ep, connections:[self], anchor:a });	    	
		    }
	    };
	    
	    prepareEndpoint(params.sourceEndpoint, 0, params);
	    prepareEndpoint(params.targetEndpoint, 1, params);
	    
	    // make connector.  if an endpoint has a connector + paintstyle to use, we use that.
	    // otherwise we use sensible defaults.
	    //this.connector = params.connector || jsPlumb.Defaults.Connector || new jsPlumb.Connectors.Bezier();
	    this.connector = this.endpoints[0].connector || this.endpoints[1].connector || params.connector || jsPlumb.Defaults.Connector || new jsPlumb.Connectors.Bezier();
	    //this.paintStyle = params.paintStyle || jsPlumb.Defaults.PaintStyle;
	    this.paintStyle = this.endpoints[0].connectionStyle  || this.endpoints[1].connectionStyle || params.paintStyle || jsPlumb.Defaults.PaintStyle;
	    	    	    	   
	    _updateOffset(this.sourceId);
	    _updateOffset(this.targetId);
	    
	    // paint the endpoints
	    var myOffset = offsets[this.sourceId], myWH = sizes[this.sourceId];		
    	var anchorLoc = this.endpoints[0].anchor.compute([myOffset.left, myOffset.top], myWH);
    	this.endpoints[0].paint(anchorLoc);    	
    	myOffset = offsets[this.targetId]; myWH = sizes[this.targetId];		
    	anchorLoc = this.endpoints[1].anchor.compute([myOffset.left, myOffset.top], myWH);
    	this.endpoints[1].paint(anchorLoc);

	// *************** create canvas on which the connection will be drawn ************
	    var canvas = _newCanvas(jsPlumb.connectorClass);
	    this.canvas = canvas;
	     
	    /**
	     * paints the connection.
	     * @param elId Id of the element that is in motion
	     * @param ui jQuery's event system ui object (present if we came from a drag to get here)
	     * @param recalc whether or not to recalculate element sizes. this is true if a repaint caused this to be painted.
	     */
	    this.paint = function(elId, ui, recalc) {    	
	    	
	    	if (log) log.debug("Painting Connection; element in motion is " + elId + "; ui is [" + ui + "]; recalc is [" + recalc + "]");
	    	
	    	var fai = self.floatingAnchorIndex;
	    	// if the moving object is not the source we must transpose the two references.
	    	var swap = !(elId == this.sourceId);
	    	var tId = swap ? this.sourceId : this.targetId, sId = swap ? this.targetId : this.sourceId;
	    	var tIdx = swap ? 0 : 1, sIdx = swap ? 1 : 0;
	    	var el = swap ? this.target : this.source;
	    	
	    	if (this.canvas.getContext) {    		    		
	    		    		
	    		_updateOffset(elId, ui, recalc);
	    		if (recalc) _updateOffset(tId);  // update the target if this is a forced repaint. otherwise, only the source has been moved.
	    		
	    		var myOffset = offsets[elId]; 
	    		var otherOffset = offsets[tId];
	    		var myWH = sizes[elId];
	            var otherWH = sizes[tId];
	            
	    		var ctx = canvas.getContext('2d');
	            var sAnchorP = this.endpoints[sIdx].anchor.compute([myOffset.left, myOffset.top], myWH, [otherOffset.left, otherOffset.top], otherWH);
	            var sAnchorO = this.endpoints[sIdx].anchor.getOrientation();
	            var tAnchorP = this.endpoints[tIdx].anchor.compute([otherOffset.left, otherOffset.top], otherWH, [myOffset.left, myOffset.top], myWH);
	            var tAnchorO = this.endpoints[tIdx].anchor.getOrientation();
	            var dim = this.connector.compute(sAnchorP, tAnchorP, this.endpoints[sIdx].anchor, this.endpoints[tIdx].anchor, this.paintStyle.lineWidth);
	            jsPlumb.sizeCanvas(canvas, dim[0], dim[1], dim[2], dim[3]);
	            $.extend(ctx, this.paintStyle);
	                        
	            if (this.paintStyle.gradient && !ie) { 
		            var g = swap ? ctx.createLinearGradient(dim[4], dim[5], dim[6], dim[7]) : ctx.createLinearGradient(dim[6], dim[7], dim[4], dim[5]);
		            for (var i = 0; i < this.paintStyle.gradient.stops.length; i++)
		            	g.addColorStop(this.paintStyle.gradient.stops[i][0],this.paintStyle.gradient.stops[i][1]);
		            ctx.strokeStyle = g;
	            }
	            	            
	            this.connector.paint(dim, ctx);
	                            
	        //	this.endpoints[swap ? 1 : 0].paint(sAnchorP, this.paintStyle);
	        	//this.endpoints[swap ? 0 : 1].paint(tAnchorP, this.paintStyle);
	    	}
	    };
	    
	    this.repaint = function() {
	    	this.paint(this.sourceId, null, true);
	    };

	    _initDraggableIfNecessary(self.source, self.sourceId, params.draggable, params.dragOptions);
	    _initDraggableIfNecessary(self.target, self.targetId, params.draggable, params.dragOptions);
	    	    
	    // resizing (using the jquery.ba-resize plugin). todo: decide whether to include or not.
	    if (this.source.resize) {
	    	this.source.resize(function(e) {
	    		jsPlumb.repaint(self.sourceId);
	    	});
	    }
	};
	
	/**
	 * models an endpoint.  can have one to N connections emanating from it (although how to handle that in the UI is
	 * a very good question). also has a Canvas and paint style.
	 * 
	 * params:
	 * 
	 * anchor			:	anchor for the endpoint, of type jsPlumb.Anchor. may be null. 
	 * endpoint 		: 	endpoint object, of type jsPlumb.Endpoint. may be null.
	 * style			:	endpoint style, a js object. may be null.
	 * source			:	element the endpoint is attached to, of type jquery object.  Required.
	 * canvas			:	canvas element to use. may be, and most often is, null.
	 * connections  	:	optional list of connections to configure the endpoint with.
	 * isSource			:	boolean. indicates the endpoint can act as a source of new connections. optional.
	 * dragOptions		:	if isSource is set to true, you can supply arguments for the jquery draggable method.  optional.
	 * connectionStyle	:	if isSource is set to true, this is the paint style for connections from this endpoint. optional.
	 * connector		:	optional connector type to use.
	 * isTarget			:	boolean. indicates the endpoint can act as a target of new connections. optional.
	 * dropOptions		:	if isTarget is set to true, you can supply arguments for the jquery droppable method.  optional.
	 * reattach			:	optional boolean that determines whether or not the connections reattach after they
	 *                      have been dragged off an endpoint and left floating.  defaults to false - connections
	 *                      dropped in this way will just be deleted.
	 */
	var Endpoint = function(params) {
		params = params || {};
		// make a copy. then we can use the wrapper function.
		params = $.extend({}, params);
		var self = this;
		self.anchor = params.anchor || jsPlumb.Anchors.TopCenter;
		var _endpoint = params.endpoint || new jsPlumb.Endpoints.Dot();
		var _style = params.style || jsPlumb.Defaults.EndpointStyle;
		this.connectionStyle = params.connectionStyle;
		this.connector = params.connector;
		var _element = params.source;
		var _elementId = $(_element).attr("id");
		var _maxConnections = params.maxConnections || 1;                     // maximum number of connections this endpoint can be the source of.
		this.canvas = params.canvas || _newCanvas(jsPlumb.endpointClass);
		this.connections = params.connections || [];
		var _reattach = params.reattach || false;
		var floatingEndpoint = null;
		this.addConnection = function(connection) {
			self.connections.push(connection);
		};
		this.removeConnection = function(connection) {
			var idx = self.connections.findIndex(connection);
			if (idx >= 0)
				self.connections.splice(idx, 1);
		};
		/**
		* returns whether or not this endpoint is connected to the given endpoint.
		* @param endpoint  Endpoint to test.
		* @since 1.1.1
		*
		* todo: needs testing.  will this work if the endpoint passed in is the source?
		*/
		this.isConnectedTo = function(endpoint) {
			var found = false;
			if (endpoint) {
				for (var i = 0; i < self.connections.length; i++) {
			  		if (self.connections[i].endpoints[1] == endpoint) {
			  		 	found = true;
			  		 	break;
			  		}
				}		
			}
			return found;
		};
		
		this.isFloating = function() { return floatingEndpoint != null; };
		/**
		 * first pass at default ConnectorSelector: returns the first connection, if we have any.
		 * modified a little, 5/10/2010: now it only returns a connector if we have not got equal to or more than _maxConnector connectors
		 * attached.  otherwise it is assumed a new connector is ok.  but note with this setup we can't select any other connection than the first
		 * one.  what if this could return a list?  that implies everything should work with a list - dragging etc. could be nasty. could also
		 * be cool.
		 */
		var connectorSelector = function() {
			return self.connections.length == 0 || self.connections.length < _maxConnections ?  null : self.connections[0]; 
		};

		// get the jsplumb context...lookups are faster with a context.
		var contextNode = _getContextNode();
		
		this.isFull = function() { return _maxConnections < 1 ? false : (self.connections.length >= _maxConnections); }; 
		
		/**
		 * paints the Endpoint, recalculating offset and anchor positions if necessary.
		 */
		this.paint = function(anchorPoint, connectorPaintStyle, canvas) {
			
			if (log) log.debug("Painting Endpoint with elementId [" + _elementId + "]; anchorPoint is [" + anchorPoint + "]");
			
			if (anchorPoint == null) {
				// do we always want to force a repaint here?  i dont think so!
				var xy = offsets[_elementId];
				var wh = sizes[_elementId];
				if (xy == null || wh == null) {
					_updateOffset(_elementId);
					xy = offsets[_elementId];
					wh = sizes[_elementId];
				}
				anchorPoint = self.anchor.compute([xy.left, xy.top], wh);
			}
			_endpoint.paint(anchorPoint, self.anchor.getOrientation(), canvas || self.canvas, _style, connectorPaintStyle || _style);
		};
		
		
		// is this a connection source? we make it draggable and have the drag listener 
		// maintain a connection with a floating endpoint.
		if (params.isSource && _element.draggable) {
			
			var n = null, id = null, 
			 jpc = null, 
			existingJpc = false, existingJpcParams = null;
			
			// first the question is, how many connections are on this endpoint?  if it's only one, then excellent.  otherwise we will either need a way
			// to select one connection from the list, or drag them all. if we had a pluggable 'ConnectorSelector' interface we could probably
			// provide a way for people to implement their own UI components to do the connector selection.  the question in that particular case would be how much
			// information the interface needs from jsPlumb at execution time. if, however, we leave out the connector selection, and drag them all,
			// that wouldn't be too hard to organise. perhaps that behaviour would be on a switch for the endpoint, or perhaps the ConnectorSelector
			// interface returns a List, with the default implementation just returning everything.  i think i like that.
			//
			// let's say for now that there is just one endpoint, cos we need to get this going before we can consider a list of them anyway.
			// the major difference between that case and the case of a new endpoint is actually quite small - it's a question of where the
			// Connection comes from.  for a new one, we create a new one. obviously.  otherwise we just get the jpc from the Endpoint
			// (remember we're only assuming one connection right now).  so all of the UI stuff we do to create the floating endpoint etc
			// will still be valid, but when we stop dragging, we'll have to do something different.  if we stop with a valid drop i think it will
			// be the same process.  but if we stop with an invalid drop we have to reset the Connection to how it was when we got it.
			var start = function(e, ui) {
				//if (!isFull()) {
				n = document.createElement("div");
				contextNode.append(n);
				// create and assign an id, and initialize the offset.
				id = new String(new Date().getTime());				
				$(n, contextNode).attr("id", id);
				_updateOffset(id);
				// store the id of the dragging div and the source element. the drop function
				// will pick these up.
				$(self.canvas, contextNode).attr("dragId", id);
				$(self.canvas, contextNode).attr("elId", _elementId);
				// create a floating anchor
				var floatingAnchor = new FloatingAnchor({reference:self.anchor});
				floatingEndpoint = new Endpoint({
					style:_style, 
					endpoint:_endpoint, 
					anchor:floatingAnchor, 
					source:n 
				});
				
				jpc = connectorSelector();
				if (jpc == null) {
					// create a connection. one end is this endpoint, the other is a floating endpoint.
					jpc = new Connection({
						sourceEndpoint:self, 
						targetEndpoint:floatingEndpoint,
						source:$(_element),
						target:$(n, contextNode),
						anchors:[self.anchor, floatingAnchor],
						paintStyle : params.connectionStyle, // this can be null. Connection will use the default.
						connector: params.connector
					});
					// todo ...unregister on stop
					self.addConnection(jpc);
				} else {
					existingJpc = true;
					var anchorIdx = jpc.sourceId == _elementId ? 0 : 1;
					jpc.floatingAnchorIndex = anchorIdx;
					// probably we should remove the connection? and add it back if the user
					// does not drop it somewhere proper.
					self.removeConnection(jpc);
					if (anchorIdx == 0){
						existingJpcParams = [jpc.source, jpc.sourceId];
						jpc.source = $(n, contextNode);
						jpc.sourceId = id;						
					}else {
						existingJpcParams = [jpc.target, jpc.targetId];
						jpc.target = $(n, contextNode);
						jpc.targetId = id;
					}					
					
					jpc.suspendedEndpoint = jpc.endpoints[anchorIdx];
					jpc.endpoints[anchorIdx] = floatingEndpoint;
				}
				
				// register it.
				floatingConnections[id] = jpc;
				
				// todo unregister on stop
				floatingEndpoint.addConnection(jpc);
								
				// only register for the target endpoint; we will not be dragging the source at any time
				// before this connection is either discarded or made into a permanent connection.
				_addToList(endpointsByElement, id, floatingEndpoint);
				
				}
			//};
			
			var dragOptions = params.dragOptions || { };
			dragOptions = $.extend({ opacity:0.5, revert:true, helper:'clone' }, dragOptions);
			
			dragOptions.start = _wrap(dragOptions.start, start);
			dragOptions.drag = _wrap(dragOptions.drag, function(e, ui) { 
				_draw($(n, contextNode), ui); 
			});
			dragOptions.stop = _wrap(dragOptions.stop, 
				function(e, ui) {					
					_removeFromList(endpointsByElement, id, floatingEndpoint);
					_removeElements([floatingEndpoint.canvas, n]);
					var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;
					if (jpc.endpoints[idx] == floatingEndpoint) {						
						
						// if the connection was an existing one:
						if (existingJpc && jpc.suspendedEndpoint) {
							if (_reattach) {
								jpc.floatingAnchorIndex = null;
								if (idx == 0) {
									jpc.source = existingJpcParams[0];
									jpc.sourceId = existingJpcParams[1];																	
								} else {
									jpc.target = existingJpcParams[0];
									jpc.targetId = existingJpcParams[1];
								}
								jpc.endpoints[idx] = jpc.suspendedEndpoint;
								jpc.suspendedEndpoint.addConnection(jpc);
								jsPlumb.repaint(existingJpcParams[1]);
							}
							else {
								jpc.endpoints[0].removeConnection(jpc);
								jpc.endpoints[1].removeConnection(jpc);
								_removeElement(jpc.canvas);
							}
						} else {							
							_removeElement(jpc.canvas);
							self.removeConnection(jpc);
						}
					}
					jpc = null;
					delete floatingEndpoint;
				}			
			);		
											
			$(self.canvas, contextNode).draggable(dragOptions);
		}
		
		// connector target
		if (params.isTarget && _element.droppable) {
			var dropOptions = params.dropOptions || jsPlumb.Defaults.DropOptions;
			dropOptions = $.extend({}, dropOptions);
	    	var originalAnchor = null;
	    	dropOptions.drop = _wrap(dropOptions.drop, function(e, ui) {
	    		var id = $(ui.draggable, contextNode).attr("dragId");
	    		var elId = $(ui.draggable, contextNode).attr("elId");
	    		var jpc = floatingConnections[id];
	    		var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;
	    		if (idx == 0) {
	    			jpc.source = _element;
		    		jpc.sourceId = _elementId;		    		
	    		} else {
		    		jpc.target = _element;
		    		jpc.targetId = _elementId;		    		
	    		}
	    		// remove this jpc from the current endpoint
	    		jpc.endpoints[idx].removeConnection(jpc);
	    		if (jpc.suspendedEndpoint)
	    			jpc.suspendedEndpoint.removeConnection(jpc);
	    		jpc.endpoints[idx] = self;
	    		self.addConnection(jpc);
	    		_initDraggableIfNecessary(_element, _elementId, params.draggable, {});
	    		jsPlumb.repaint($(ui.draggable, contextNode).attr("elId"));
	    		delete floatingConnections[id];	    			    	
			 });
	    	// what to do when something is dropped.
	    	// 1. find the jpc that is being dragged.  the target endpoint of the jpc will be the
	    	// one that is being dragged.
	    	// 2. arrange for the floating endpoint to be replaced with this endpoint; make sure
	    	//    everything gets registered ok etc.
	    	// 3. arrange for the floating endpoint to be deleted.
	    	// 4. make sure that the stop method of the drag does not cause the jpc to be cleaned up.  we want to keep it now.
	    	
			// other considerations: when in the hover mode, we should switch the floating endpoint's
	    	// orientation to be the same as the drop target.  this will cause the connector to snap
	    	// into the shape it will take if the user drops at that point.
			 
			dropOptions.over = _wrap(dropOptions.over, function(event, ui) {  
				var id = $(ui.draggable, contextNode).attr("dragId");
		    	var jpc = floatingConnections[id];
		    	var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;  
		    	jpc.endpoints[idx].anchor.over(self.anchor);		    	
			 });
			 
			 dropOptions.out = _wrap(dropOptions.out, function(event, ui) {  
				var id = $(ui.draggable, contextNode).attr("dragId");
		    	var jpc = floatingConnections[id];
		    	var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;
		    	jpc.endpoints[idx].anchor.out();
			 });
			 		
			$(self.canvas, contextNode).droppable(dropOptions);			
		}
		
		// woo...add a plumb command to Endpoint.
		this.plumb = function(params) {
			// not much to think about. the target should be an Endpoint, but what else?
			// all the style stuff is on the endpoint itself already.
			//todo this should call the main plumb method, just with some different args.
			
		};
		
		return self;
	};
	
	/**
	 * jsPlumb public API
	 */
    var jsPlumb = window.jsPlumb = {

    	/*
    	 Property: Defaults
    	 
    	 These are the default settings for jsPlumb, that is what will be used if you do not supply specific pieces of information
    	 to the various API calls.  A convenient way to implement your own look and feel can be to override these defaults by including a script
    	 somewhere after the jsPlumb include, but before you make any calls to jsPlumb, for instance in this example we set the PaintStyle to be
    	 a blue line of 27 pixels:
    	 
    	 
    	 jsPlumb.Defaults.PaintStyle = { lineWidth:27, strokeStyle:'blue' }
    	  
    	 */
    	Defaults : {
    		Anchors : [ null, null ],
    		Connector : null,
    		DragOptions: { },
    		DropOptions: { },
    		Endpoint : null,
    		Endpoints : [ null, null ],
    		EndpointStyle : { fillStyle : null },
    		EndpointStyles : [ null, null ],
    		MaxConnections : null,
    		PaintStyle : { lineWidth : 10, strokeStyle : 'red' }    		    		
    	},
    	
    	/*
    	 Property: connectorClass
    	 
    	 The CSS class to set on Connection canvas elements.  This value is a String and can have multiple classes; the entire String is appended as-is.
    	 */
		connectorClass : '_jsPlumb_connector',
		
		/*
   	 	Property: endpointClass
   	 
   	 	The CSS class to set on Endpoint canvas elements.  This value is a String and can have multiple classes; the entire String is appended as-is.
		*/
		endpointClass : '_jsPlumb_endpoint',
		
		/*
		 Property: Anchors
		 
		 Default jsPlumb Anchors.  These are supplied in the file jquery.jsPlumb-defaults-x.x.x.js, which is merged in with the main jsPlumb script
		 to form jquery.jsPlumb-all-x.x.x.js.  You can provide your own Anchors by supplying them in a script that is loaded after jsPlumb, for instance:
		 
		 jsPlumb.Anchors.MyAnchor = { ....anchor code here.  see the documentation. }
		 */
	    Anchors : {},
	    
	    /*
		 Property: Connectors
		 
		 Default jsPlumb Connectors.  These are supplied in the file jquery.jsPlumb-defaults-x.x.x.js, which is merged in with the main jsPlumb script
		 to form jquery.jsPlumb-all-x.x.x.js.  You can provide your own Connectors by supplying them in a script that is loaded after jsPlumb, for instance:
		 
		 jsPlumb.Connectors.MyConnector = { ....connector code here.  see the documentation. }
		 */
	    Connectors : {},
	    
	    /*
		 Property: Endpoints
		 
		 Default jsPlumb Endpoints.  These are supplied in the file jquery.jsPlumb-defaults-x.x.x.js, which is merged in with the main jsPlumb script
		 to form jquery.jsPlumb-all-x.x.x.js.  You can provide your own Endpoints by supplying them in a script that is loaded after jsPlumb, for instance:
		 
		 jsPlumb.Endpoints.MyEndpoint = { ....endpoint code here.  see the documentation. }
		 */
	    Endpoints : {},
	      
	    /*
	      Function: addEndpoint
	     
	      Adds an Endpoint to a given element.
	      
	      Parameters:
	        target - Element to add the endpoint to.  either an element id, or a jQuery object representing some element.
	        params - Object containing Endpoint options (more info required)
	        
	      Returns:
	      
	       The newly created Endpoint.
	       
	      See Also:
	      
	       <addEndpoints>
	     */
	    addEndpoint : function(target, params) {
	    	params = $.extend({}, params);
	    	var el = typeof target == 'string' ? $("#" + target) : target;
	    	var id = $(el).attr("id");
	    	params.source = el; 
	    	_updateOffset(id);
	    	var e = new Endpoint(params);
	    	_addToList(endpointsByElement, id, e);

    		var myOffset = offsets[id];
    		var myWH = sizes[id];
			
	    	var anchorLoc = e.anchor.compute([myOffset.left, myOffset.top], myWH);
	    	e.paint(anchorLoc);
	    	return e;
	    },
	    
	    /*
	      Function: addEndpoint
	     
	      Adds a list of Endpoints to a given element.
	      
	      Parameters:
	      
	        target - element to add the endpoint to.  either an element id, or a jQuery object representing some element.
	        endpoints - List of objects containing Endpoint options. one Endpoint is created for each entry in this list.
	        
	      Returns:
	      
	        List of newly created Endpoints, one for each entry in the 'endpoints' argument.
	       
	      See Also:
	      
	       <addEndpoint>
	     */
	    addEndpoints : function(target, endpoints) {
	    	var results = [];
	    	for (var i = 0; i < endpoints.length; i++) {
	    		results.push(jsPlumb.addEndpoint(target, endpoints[i]));
	    	}
	    	return results;
	    },
	    
	    /*
	     Function: animate
	     
	     Wrapper around standard jQuery animate function; injects a call to jsPlumb in the 'step' function (creating it if necessary).  
	     This only supports the two-arg version of the animate call in jQuery - the one that takes an 'options' object as the second arg.
	     
	     Parameters:
	       
	       el - Element to animate.  Either an id, or a jQuery object representing the element.
	       properties - The 'properties' argument you want passed to the standard jQuery animate call.
	       options - The 'options' argument you want passed to the standard jQuery animate call.
	       
	     Returns:
	     
	      void
	    */	      
	    animate : function(el, properties, options) {
	    	var ele = typeof(el)=='string' ? $("#" + el) : el;
	    	var id = ele.attr("id");
	    	options = options || {};
	    	options.step = _wrap(options.step, function() { jsPlumb.repaint(id); });
	    	ele.animate(properties, options);    	
	    },
	    
	    /*
	     Function: connect
	     
	     Establishes a connection between two elements.
	     
	     Parameters:
	     
	     	params - Object containing setup for the connection.  see documentation.
	     	
	     Returns:
	     
	     	The newly created Connection.
	     	
	     */
	    connect : function(params) {
	    	if (params.sourceEndpoint && params.sourceEndpoint.isFull()) {
	    		_log("could not add connection; source endpoint is full");
	    		return;
	    	}
	    	
	    	if (params.targetEndpoint && params.targetEndpoint.isFull()) {
	    		_log("could not add connection; target endpoint is full");
	    		return;
	    	}
	    		
	    	var jpc = new Connection(params);    	
	    	
			// register endpoints for the element. todo: is the test below sufficient? or should we test if the endpoint is already in the list, 
		    // and add it only then?  perhaps _addToList could be overloaded with a a 'test for existence first' parameter?
			//_addToList(endpointsByElement, jpc.sourceId, jpc.endpoints[0]);
			//_addToList(endpointsByElement, jpc.targetId, jpc.endpoints[1]);
	
			if (!params.sourceEndpoint) _addToList(endpointsByElement, jpc.sourceId, jpc.endpoints[0]);
			if (!params.targetEndpoint) _addToList(endpointsByElement, jpc.targetId, jpc.endpoints[1]);
	
			jpc.endpoints[0].addConnection(jpc);
			jpc.endpoints[1].addConnection(jpc);
	
			// force a paint
			_draw(jpc.source);
			
			return jpc;
    	
	    },           
	    
	    /**
	    * not implemented yet. params object will have sourceEndpoint and targetEndpoint members; these will be Endpoints.
	    connectEndpoints : function(params) {
	    	var jpc = Connection(params);
	    	
	    },*/
	    
	    /* 
	     Function: detach
	      
	     Removes a connection.
	     
	     Parameters:
	     
	    	sourceId - Id of the first element in the connection. A String.
	    	targetId - iI of the second element in the connection. A String.
	    	
	    Returns:
	    
	    	true if successful, false if not.
	    */
	    detach : function(sourceId, targetId) {
	    	var f = function(jpc) {
	    		if ((jpc.sourceId == sourceId && jpc.targetId == targetId) || (jpc.targetId == sourceId && jpc.sourceId == targetId)) {
	    			_removeElement(jpc.canvas);
				jpc.endpoints[0].removeConnection(jpc);
				jpc.endpoints[1].removeConnection(jpc);
	    			return true;
	    		}    		
	    	};    	
	    	
	    	// todo: how to cleanup the actual storage?  a third arg to _operation?
	    	_operation(sourceId, f);    	
	    },
	    
	    /*
	     Function: detachAll 
	     
	     	Removes all an element's connections.
	     	
	     Parameters:
	     
	     	el - either the id of the element, or a jQuery object for the element.
	     	
	     Returns:
	     
	     	void
	     */
	    detachAll : function(el) {    	
	    	var ele = typeof(el)=='string' ? $("#" + el) : el;
	    	var id = ele.attr("id");
	    	var f = function(jpc) {
		    	// todo replace with _cleanupConnection call here.
		    	_removeElement(jpc.canvas);
				jpc.endpoints[0].removeConnection(jpc);
				jpc.endpoints[1].removeConnection(jpc);
	    	};
	    	_operation(id, f);
	    	//delete endpointsByElement[id];    	 ??
	    },
	    
	    /*
	     Function: detachEverything
	     
	     Remove all Connections from all elements, but leaves Endpoints in place.
	     
	     Returns:
	     
	     	void
	     
	     See Also:
	     
	     	<removeAllEndpoints>
	     */
	    detachEverything : function() {
	    	var f = function(jpc) {
	    		_removeElement(jpc.canvas);
			jpc.endpoints[0].removeConnection(jpc);
			jpc.endpoints[1].removeConnection(jpc);
	    	};
	    	
	    	_operationOnAll(f);
	    	
	    	/*delete endpointsByElement;             //??
	    	endpointsByElement = {};*/               //??
	    },    
	    
	    /*
	     Function: hide 
	     
	     Sets an element's connections to be hidden.
	     
	     Parameters:
	     
	     	el - either the id of the element, or a jQuery object for the element.
	     	
	     Returns:
	     
	     	void
	     */
	    hide : function(el) {
	    	_setVisible(el, "none");
	    },
	    
	    /*
	     Function: makeAnchor
	     
	     Creates an anchor with the given params.
	     
	     Parameters:
	     
	     	x - the x location of the anchor as a fraction of the total width.  
	     	y - the y location of the anchor as a fraction of the total height.
	     	xOrientation - value indicating the general direction a connection from the anchor should go in, in the x direction.
	     	yOrientation - value indicating the general direction a connection from the anchor should go in, in the y direction.
	     	xOffset - a fixed offset that should be applied in the x direction that should be applied after the x position has been figured out.  optional. defaults to 0. 
	     	yOffset - a fixed offset that should be applied in the y direction that should be applied after the y position has been figured out.  optional. defaults to 0.
	     	
	     Returns:
	     
	     	The newly created Anchor.
	     */
	    makeAnchor : function(x, y, xOrientation, yOrientation, xOffset, yOffset) {
	    	// backwards compatibility here.  we used to require an object passed in but that makes the call very verbose.  easier to use
	    	// by just passing in four/six values.  but for backwards compatibility if we are given only one value we assume it's a call in the old form.
	    	var params = {};
	    	if (arguments.length == 1) $.extend(params, x);
	    	else {
	    		params = {x:x, y:y};
	    		if (arguments.length >= 4) {
	    			params.orientation = [arguments[2], arguments[3]];
	    		}
	    		if (arguments.length == 6) params.offsets = [arguments[4], arguments[5]];
	    	}
	    	return new Anchor(params);
	    },
	        
	    
	    /*
	     Function: repaint
	     
	     Repaints an element and its connections. This method gets new sizes for the elements before painting anything.
	     
	     Parameters:
	      
	     	el - either the id of the element or a jQuery object representing the element.
	     	
	     Returns:
	     
	     	void
	     	
	     See Also:
	     
	     	<repaintEverything>
	     */
	    repaint : function(el) {
	    	
	    	var _processElement = function(el) {
	    		var ele = typeof(el)=='string' ? $("#" + el) : el;
		    	_draw(ele);
	    	};
	    	
	    	// TODO: support a jQuery result object too!
	    	
	    	// support both lists...
	    	if (typeof el =='object') {
	    		for (var i = 0; i < el.length; i++)
	    			_processElement(el[i]);
	    	} // ...and single strings.
	    	else _processElement(el);
	    },       
	    
	    /*
	     Function: repaintEverything
	     
	     Repaints all connections.
	     
	     Returns:
	     
	     	void
	     	
	     See Also:
	     
	     	<repaint>
	     */
	    repaintEverything : function() {
	    	for (var elId in endpointsByElement) {
	    		_draw($("#" + elId));
	    	}
	    },
	    
	    /*	     
	     Function: removeAllEndpoints
	     
	     Removes all Endpoints associated with a given element.  Also removes all Connections associated with each Endpoint it removes.
	    
	     Parameters:
	     
	    	el - either an element id, or a jQuery object for an element.
	    	
	     Returns:
	     
	     	void
	     	
	     See Also:
	     
	     	<removeEndpoint>
	    */
	    removeAllEndpoints : function(el) {
	    	elId = typeof el == 'string' ? el : $(el).attr("id");
	    	// first remove all Connections.
	    	jsPlumb.detachAll(elId);
	    	var ebe = endpointsByElement[elId];
	    	for (var i in ebe) {
			_removeElement(ebe[i].canvas);	    	
	    	}	    
	    	endpointsByElement[elId] = [];
	    },
	    
	    /*
	     Function: removeEndpoint
	     
	     Removes the given Endpoint from the given element.
	    
	     Parameters:
	     
	    	el - either an element id, or a jQuery object for an element.
	    	endpoint - Endpoint to remove.  this is an Endpoint object, such as would have been returned from a call to addEndpoint.
	    	
	    Returns:
	    
	    	void
	    	
	    See Also:
	    
	    	<removeAllEndpoints>
	    */
	    removeEndpoint : function(el, endpoint) {
	        var elId = typeof el == 'string' ? el : $(el).attr("id");
	    	var ebe = endpointsByElement[elId];
	    	if (ebe) {
	    		if(_removeFromList(endpointsByElement, elId, endpoint))
	    			_removeElement(endpoint.canvas);
	    	}
	    },
	    
	    /*
	     Function: setAutomaticRepaint
	     
	     Sets/unsets automatic repaint on window resize.
	     
	     Parameters:
	     
	     	value - whether or not to automatically repaint when the window is resized.
	     	
	     Returns:
	     
	     	void
	     */
	    setAutomaticRepaint : function(value) {
	    	automaticRepaint = value;
	    },
	    
	    /*
	     Function: setDefaultNewCanvasSize
	     
	     Sets the default size jsPlumb will use for a new canvas (we create a square canvas so one value is all that is required).  
	     This is a hack for IE, because ExplorerCanvas seems to need for a canvas to be larger than what you are going to draw on 
	     it at initialisation time.  The default value of this is 1200 pixels, which is quite large, but if for some reason you're 
	     drawing connectors that are bigger, you should adjust this value appropriately.
	     
	     Parameters:
	     
	     	size - The default size to use. jsPlumb will use a square canvas so you need only supply one value.
	     	
	     Returns:
	     
	     	void
	     */
	    setDefaultNewCanvasSize : function(size) {
	    	DEFAULT_NEW_CANVAS_SIZE = size;    	
	    },
	    
	    /*
	     Function: setDraggable
	     
	     Sets whether or not a given element is draggable, regardless of what any plumb command may request.
	     
	     Parameters:
	      
	      	el - either the id for the element, or a jQuery object representing the element.
	      	
	     Returns:
	     
	      	void
	     */
	    setDraggable: _setDraggable, 
	    
	    /*
	     Function: setDraggableByDefault
	     
	     Sets whether or not elements are draggable by default.  Default for this is true.
	     
	     Parameters:
	     	draggable - value to set
	     	
	     Returns:
	     
	     	void
	     */
	    setDraggableByDefault: function(draggable) {
	    	_draggableByDefault = draggable;
	    },
	    
	    setDebugLog: function(debugLog) {
	    	log = debugLog;
	    },
	    
	    /*
	     Function: setRepaintFunction
	     
	     Sets the function to fire when the window size has changed and a repaint was fired.
	     
	     Parameters:	     
	     	f - Function to execute.
	     	
	     Returns:	     
	     	void
	     */
	    setRepaintFunction : function(f) {
	    	repaintFunction = f;
	    },
	        
	    /*
	     Function: show	     
	     
	     Sets an element's connections to be visible.
	     
	     Parameters:	     
	     	el - either the id of the element, or a jQuery object for the element.
	     	
	     Returns:
	     	void	     
	     */
	    show : function(el) {
	    	_setVisible(el, "block");
	    },
	    
	    /*
	     Function: sizeCanvas
	     
	     Helper to size a canvas. You would typically use this when writing your own Connector or Endpoint implementation.
	     
	     Parameters:
	     	x - [int] x position for the Canvas origin
	     	y - [int] y position for the Canvas origin
	     	w - [int] width of the canvas
	     	h - [int] height of the canvas
	     	
	     Returns:
	     	void	     
	     */
	    sizeCanvas : function(canvas, x, y, w, h) {
	    	if (canvas) {
		        canvas.style.height = h + "px"; canvas.height = h;
		        canvas.style.width = w + "px"; canvas.width = w; 
		        canvas.style.left = x + "px"; canvas.style.top = y + "px";
	    	}
	    },
	    
	    /**
	     * gets some test hooks.  nothing writable.
	     */
	    getTestHarness : function() {
	    	return {
	    		endpointCount : function(elId) {
	    			var e = endpointsByElement[elId];
	    			return e ? e.length : 0;
	    		}	    		
	    	};	    	
	    },
	    
	    /**
	     * Toggles visibility of an element's connections. kept for backwards compatibility
	     */
	    toggle : _toggleVisible,
	    
	    /*
	     Function: toggleVisible
	     
	     Toggles visibility of an element's connections. 
	     
	     Parameters:
	     	el - either the element's id, or a jQuery object representing the element.
	     	
	     Returns:
	     	void, but should be updated to return the current state
	     */
	    //TODO: update this method to return the current state.
	    toggleVisible : _toggleVisible,
	    
	    /*
	     Function: toggleDraggable
	     
	     Toggles draggability (sic) of an element's connections. 
	     
	     Parameters:
	     	el - either the element's id, or a jQuery object representing the element.
	     	
	     Returns:
	     	The current draggable state.
	     */
	    toggleDraggable : _toggleDraggable, 
	    
	    /*
	     Function: unload
	     
	     Unloads jsPlumb, deleting all storage.  You should call this from an onunload attribute on the <body> element
	     
	     Returns:
	     	void
	     */
	    unload : function() {
	    	delete endpointsByElement;
			delete offsets;
			delete sizes;
			delete floatingConnections;
			delete draggableStates;		
			document.body.removeChild(_jsPlumbContextNode);
	    }
	};

})();

// jQuery plugin code
(function($){
	/**
	 * plumbs the results of the selector to some target, using the given options if supplied,
	 * or the defaults otherwise.
	 */
    $.fn.plumb = function(options) {
        var options = $.extend({}, options);

        return this.each(function()
        {
            var params = $.extend({source:$(this)}, options);
            jsPlumb.connect(params);
        });
  };
  
  /**
   * detaches the results of the selector from the given target or list of targets - 'target'
   * may be a String or a List.
   */
  $.fn.detach = function(target) {
	  return this.each(function() 
	  {
		 var id = $(this).attr("id");
		 if (typeof target == 'string') target = [target];
		 for (var i = 0; i < target.length; i++)
			 jsPlumb.detach(id, target[i]);
	  });	  
  };
  
  /**
   * detaches the results from the selector from all connections. 
   */
  $.fn.detachAll = function() {
	  return this.each(function() 
	  {
		 var id = $(this).attr("id");		 
		 jsPlumb.detachAll(id);
	  });	  
  };
  
  /**
   * adds an endpoint to the elements resulting from the selector.  options may be null,
   * in which case jsPlumb will use the default options. see documentation. 
   */
  $.fn.addEndpoint = function(options) {
	  var addedEndpoints = [];
	  this.each(function() 
	  {
		  //var params = $.extend({source:$(this)}, options);			  
		  addedEndpoints.push(jsPlumb.addEndpoint($(this).attr("id"), options));
	  });
	  return addedEndpoints[0];
  };
  
  /**
   * adds a list of endpoints to the elements resulting from the selector.  options may be null,
   * in which case jsPlumb will use the default options. see documentation. 
   */
  $.fn.addEndpoints = function(endpoints) {
	  var addedEndpoints = [];
	  return this.each(function() 
	  {		 
		 var e = jsPlumb.addEndpoints($(this).attr("id"), endpoints);
		 for (var i = 0; i < e.length; i++) addedEndpoints.push(e[i]);
	  });	  
	  return addedEndpoints;
  };
  
  /**
   * remove the endpoint, if it exists, deleting its UI elements etc. 
   */
  $.fn.removeEndpoint = function(endpoint) {
	  this.each(function() 
	  {			  
		  jsPlumb.removeEndpoint($(this).attr("id"), endpoint);
	  });
  };
  
})(jQuery);
