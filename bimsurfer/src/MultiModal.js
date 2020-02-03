define([
    'module',
    "bimsurfer/src/BimSurfer",
    "bimsurfer/src/StaticTreeRenderer",
    "bimsurfer/src/MetaDataRenderer",
    "bimsurfer/src/Request",
    "bimsurfer/src/Utils"
],
function (cfg, BimSurfer, StaticTreeRenderer, MetaDataRenderer, Request, Utils) {
    
    function MultiModalViewer(args) {
        
        var origin;
        try {
            origin = (new URL(cfg.uri)).origin;
        } catch (e) {
            origin = window.location.origin;
        }
        
        var self = this;
            
        var bimSurfer = self.bimSurfer3D = new BimSurfer({
            domNode: args.domNode,
            engine: 'threejs'
        });
        
        var bimSurfer2D;
        var modelPath = `${origin}/m/${args.modelId}`;

        function mapFrom(view, objectIds) {
            if (view.engine === 'svg') {
                mapped = objectIds.map((id) => {
                    return id.substr(16, 36);
                }); 
            } else if (view.engine === 'xeogl') {
                mapped = objectIds.map(function(id) {
                    return id.split("#")[1].substr(8, 36);
                });
            } else {
                mapped = objectIds;
            }
            return mapped;
        }

        function mapTo(view, objectIds) {
            if (view instanceof StaticTreeRenderer || view instanceof MetaDataRenderer || view.engine === 'xeogl') {
                const conditionallyCompress = (s) => {
                    if (s.length > 22) {
                        return Utils.CompressGuid(s);
                    } else {
                        return s;
                    }
                }
                return objectIds.map(conditionallyCompress);
            } else {
                return objectIds;
            }
        }

        function processSelectionEvent(source, args0, args1) {
            var objectIds;
            var propagate = true;
            if (source instanceof BimSurfer) {
                objectIds = mapFrom(source, args0.objects);
                if (source.engine === 'xeogl') {
                    // Only when the user actually clicked the canvas we progate the event.
                    propagate = !!args0.clickPosition || objectIds.length == 0;   
                }
            } else if (source instanceof StaticTreeRenderer) {
                objectIds = mapFrom(source, args1);
            }
            
            if (propagate) {
                [bimSurfer, bimSurfer2D, self.treeView, self.metaDataView].forEach((view) => {
                    if (view && view !== source) {
                        if (view.setSelection) {
                            view.setSelection({ids: mapTo(view, objectIds), clear: true, selected: true});
                        } else {
                            view.setSelected(mapTo(view, objectIds), view.SELECT_EXCLUSIVE);
                        }
                    }
                });
                
                if (self.onSelectionChanged) {
                    self.onSelectionChanged(objectIds);
                }
            }
        }

        function makePartial(fn, arg) {
            // higher order (essentially partial function call)
            return function(arg0, arg1) {
                fn(arg, arg0, arg1);
            }
        }        

        this.loadTreeView = function(domNode) {
            var tree = new StaticTreeRenderer({
                domNode: domNode
            });
            tree.addModel({id: 1, src: modelPath + ".xml"});
            tree.build();
            self.treeView = tree;
            tree.on('click', makePartial(processSelectionEvent, tree));
        }
        
        this.loadMetadata = function(domNode) {            
            var data = new MetaDataRenderer({
                domNode: domNode
            });
            data.addModel({id: 1, src: modelPath + ".xml"});
            self.metaDataView = data;        
        };
        
        this.load2d = function() {
            bimSurfer2D = self.bimSurfer2D = new BimSurfer({
                domNode: args.svgDomNode,
                engine: 'svg'
            });
        
            bimSurfer2D.load({
                src: modelPath
            });
            
            bimSurfer2D.on("selection-changed", makePartial(processSelectionEvent, bimSurfer2D));
        };
        
        this.load3d = function(part) {
        
            bimSurfer.load({
                src: modelPath + (part ? `/${part}`: '')
            }).then(function (model) {
                
                if (bimSurfer.engine === 'xeogl' && !part) {
                // Really make sure everything is loaded.
                Utils.Delay(100).then(function() {
                
                    var scene = bimSurfer.viewer.scene;
                    
                    var aabb = scene.worldBoundary.aabb;
                    var max = aabb.subarray(3);
                    var min = aabb.subarray(0, 3);
                    var diag = xeogl.math.subVec3(max, min, xeogl.math.vec3());
                    var modelExtent = xeogl.math.lenVec3(diag);
                
                    scene.camera.project.near = modelExtent / 1000.;
                    scene.camera.project.far = modelExtent * 100.;
                    
                    bimSurfer.viewFit({centerModel:true});
                    
                    bimSurfer.viewer.scene.canvas.canvas.style.display = 'block';
                });
                }
                
            });
            
            bimSurfer.on("selection-changed", makePartial(processSelectionEvent, bimSurfer));        
        };
        
        this.highlight = function(args) {
            var viewers = [bimSurfer];
            if (bimSurfer2D) {
                viewers.push(bimSurfer2D);
            }
            viewers.forEach((v) => {
                if (args.ids && args.ids.length) {
                    if (v.viewer && v.viewer.getObjectIds) {
                        v.setColor({ids: v.viewer.getObjectIds(), color: {a: 0.1}});
                    }
                    v.setColor.apply(v, arguments);
                } else {
                    v.reset({ colors: true });
                }
            });
        }
    }
    
    return MultiModalViewer;
});
