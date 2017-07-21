'use strict';

/*
 * Copyright 2016 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * This visualization shows geographic data in a map.
 * @namespace neonDemo.controllers
 * @class mapController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('mapController', ['$scope', '$filter', 'DatasetService', 'ConnectionService', function($scope, $filter, datasetService, connectionService) {
    $scope.gridLayerPointRadius = 5;
    $scope.maxNumGridPoints = 4;
    $scope.currentGraticuleInterval;

    $scope.reloadDatabase = true;
    
    $scope.POINT_LAYER = coreMap.Map.POINTS_LAYER;
    $scope.CLUSTER_LAYER = coreMap.Map.CLUSTER_LAYER;
    $scope.HEATMAP_LAYER = coreMap.Map.HEATMAP_LAYER;
    $scope.NODE_AND_ARROW_LAYER = coreMap.Map.NODE_LAYER;
    $scope.ROUTE_LAYER = coreMap.Map.ROUTE_LAYER;
    $scope.GRID_LAYER = coreMap.Map.GRID_LAYER;
    $scope.BUCKET_LAYER = coreMap.Map.BUCKET_LAYER;
    $scope.MAP_LAYER_TYPES = [$scope.POINT_LAYER, $scope.CLUSTER_LAYER, $scope.HEATMAP_LAYER, 
                              $scope.NODE_AND_ARROW_LAYER, $scope.GRID_LAYER, $scope.BUCKET_LAYER];
    $scope.DEFAULT_LIMIT = 1000;
    $scope.DEFAULT_NEW_LAYER_TYPE = $scope.MAP_LAYER_TYPES[5];//xkcd change this back to 0

    $scope.cacheMap = false;
    $scope.active.legend = {
        show: false,
        layers: []
    };
    $scope.active.baseLayerColor = "light";

    // Set this option so the superclass queries for data by all layers with the same database & table instead of by individual layers.
    $scope.active.queryByTable = true;

    // Set this option so the superclass resizes the display to overlap (underneath) the legend/filter container.
    $scope.active.displayOverlapsHeaders = true;

    $scope.functions.createMenuText = function() {
        var text = "";
        $scope.active.layers.forEach(function(layer) {
            if(!layer.new && layer.show && layer.olLayer.data) {
                var dataSize = ( layer.olLayer.pointTotal ? layer.olLayer.pointTotal: layer.olLayer.data.length)
                var limit = layer.olLayer.pointLimit <= dataSize;
                var count = $filter("number")(limit ? layer.olLayer.pointLimit : dataSize);
                text += (text ? ", " : "") + layer.name + (limit ? " (" + count + " limit)" : "");
                layer.message = "Showing " + count + " points" + (limit ? " (limited)" : "") + " from " + $filter("number")(dataSize) + " data records.";
            }
        });
        return text;
    };

    $scope.functions.getVisualizationName = function() {
        return "Map";
    };

    $scope.functions.showMenuText = function() {
        return $scope.active.layers.some(function(layer) {
            return !layer.new && layer.show;
        });
    };

    /**
     * Queries for the map popup data using the given database, table, and ID and updates the map using the given function.
     * @param {String} database
     * @param {String} table
     * @param {String} idField
     * @param {Array | Number | String} id
     * @param {Function} updateDataFunction
     * @method queryForMapPopupData
     * @private
     */
    var queryForMapPopupData = function(database, table, idField, id, updateDataFunction) {
        $scope.functions.queryAndUpdate({
            database: database,
            table: table,
            addToQuery: function(query) {
                if(_.isArray(id)) {
                    var whereClauses = id.map(function(value) {
                        return neon.query.where(idField, "=", value);
                    });
                    query.where(neon.query.or.apply(neon.query, whereClauses));
                } else {
                    query.where(idField, "=", id);
                }
                return query;
            },
            updateData: updateDataFunction
        });
    };

    $scope.functions.onResize = function(elementHeight, elementWidth, titleHeight, headersHeight) {
        if($scope.map) {
            $scope.map.resizeToElement(elementHeight - headersHeight, elementWidth);
        }

        var height = elementHeight - titleHeight - $scope.functions.getElement(".legend>.divider").outerHeight(true) - $scope.functions.getElement(".legend>.text").outerHeight(true) - 10;
        var width = elementWidth - $scope.functions.getElement(".filter-reset").outerWidth(true) - $scope.functions.getElement(".olControlZoom").outerWidth(true) - 20;
        var legendDetails = $scope.functions.getElement(".legend>.legend-details");
        legendDetails.css("max-height", height + "px");
        legendDetails.css("max-width", width + "px");
    };

    $scope.functions.onInit = function() {
        $scope.map = new coreMap.Map($scope.visualizationId, {
            responsive: false,
            routeService: $scope.functions.getRouteServiceConfig(),
            makeQueryForRouteDataFunction: makeQueryForRouteData,
            queryForMapPopupDataFunction: queryForMapPopupData,
            mapBaseLayer: {
                color: $scope.active.baseLayerColor || 'light',
                protocol: $scope.active.baseLayerProtocol || 'http'
            },
            createMapLayerFunction: function(layerType, layerName) { // Creates a new layer, sets its name and type, and adds it to the map.
                var layer = $scope.functions.createLayer();
                layer.type = layerType;
                layer.name = layerName;
                createMapLayer(layer);
            }
        });
        $scope.map.linksPopupService = $scope.functions.getLinksPopupService();
        $scope.setDefaultView();

        $scope.map.register("movestart", this, onMapEvent);
        $scope.map.register("moveend", this, onMapEvent);
        $scope.map.register("zoom", this, onMapEvent);
        $scope.map.register("zoomend", this, onMapEvent);

        $scope.functions.subscribe("data_table_select", handlePointSelected);
        $scope.functions.subscribe("date_selected", handleDateSelected);
        $scope.linkyConfig = $scope.functions.getLinkyConfig();

        $scope.functions.getElement('.legend').on({
            "shown.bs.dropdown": function() {
                this.closable = false;
            },
            click: function() {
                this.closable = true;
            },
            "hide.bs.dropdown": function() {
                return this.closable;
            }
        });

        // Handle toggling map caching.
        $scope.$watch('cacheMap', function(newVal, oldVal) {
            if(newVal !== oldVal) {
                if(newVal) {
                    $scope.map.clearCache();
                    $scope.map.toggleCaching();
                } else {
                    $scope.map.toggleCaching();
                }
            }
        });

        // Add a zoomRect handler to the map.
        $scope.map.onZoomRect = function(zoomRect) {
            XDATA.userALE.log({
                activity: "select",
                action: "drag",
                elementId: "map",
                elementType: "canvas",
                elementSub: "geo-filter",
                elementGroup: "map_group",
                source: "user",
                tags: ["map", "filter"]
            });

            var lowerLeftPoint = new OpenLayers.LonLat(zoomRect.left, zoomRect.bottom);
            var upperRightPoint = new OpenLayers.LonLat(zoomRect.right, zoomRect.top);

            $scope.extent = {
                minimumLongitude: Math.min(lowerLeftPoint.lon, upperRightPoint.lon),
                maximumLongitude: Math.max(lowerLeftPoint.lon, upperRightPoint.lon),
                minimumLatitude: Math.min(lowerLeftPoint.lat, upperRightPoint.lat),
                maximumLatitude: Math.max(lowerLeftPoint.lat, upperRightPoint.lat)
            };

            updateLinksAndBoundsBox();
            $scope.functions.updateNeonFilter();
        };
    };

    var updateLinksAndBoundsBox = function() {
        var linkData = {};
        linkData[neonMappings.BOUNDS] = {};
        linkData[neonMappings.BOUNDS][neonMappings.MIN_LAT] = $scope.extent.minimumLatitude;
        linkData[neonMappings.BOUNDS][neonMappings.MIN_LON] = $scope.extent.minimumLongitude;
        linkData[neonMappings.BOUNDS][neonMappings.MAX_LAT] = $scope.extent.maximumLatitude;
        linkData[neonMappings.BOUNDS][neonMappings.MAX_LON] = $scope.extent.maximumLongitude;
        $scope.showLinksPopupButton = $scope.functions.createLinksForData(neonMappings.BOUNDS, $scope.getLinksPopupBoundsKey(), linkData);

        removeZoomRect();
        var bounds = {
            left: $scope.extent.minimumLongitude,
            bottom: $scope.extent.minimumLatitude,
            right: $scope.extent.maximumLongitude,
            top: $scope.extent.maximumLatitude
        };
        $scope.zoomRectId = $scope.map.drawBox(bounds);
        $scope.map.zoomToBounds(bounds);
    };

    $scope.getLinksPopupBoundsKey = function() {
        return $scope.extent ? $scope.functions.getLinksPopupService().generateBoundsKey($scope.extent.minimumLatitude, $scope.extent.minimumLongitude, $scope.extent.maximumLatitude, $scope.extent.maximumLongitude) : "";
    };

    $scope.functions.isFilterSet = function() {
        return $scope.extent;
    };

    $scope.functions.createFilterTrayText = function(databaseName, tableName, fieldNames) {
        return databaseName + " - " + tableName + " - " + fieldNames.join(", ");
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    /**
     * Creates an object containing data needed to run a query for route data using the given start and end points.
     * @method makeQueryForRouteData
     * @param {Array} routeStartAndEnd An object containing  start and end values, each containing {Number} lat and {Number} lon
     * @private
     */
    var makeQueryForRouteData = function(routeStartAndEnd) {
        // FIXME this call should really be part of the neon.js library so we wouldnt need to use jquery.ajax here
        if(!$scope.active.layers.length) {
            return;
        }
        var connection = connectionService.getActiveConnection();
        var minLat = Math.min(routeStartAndEnd.start.lat, routeStartAndEnd.end.lat);
        var minLon = Math.min(routeStartAndEnd.start.lon, routeStartAndEnd.end.lon);
        var maxLat = Math.max(routeStartAndEnd.start.lat, routeStartAndEnd.end.lat);
        var maxLon = Math.max(routeStartAndEnd.start.lon, routeStartAndEnd.end.lon);

        var data = {
            minLat: minLat,
            minLon: minLon,
            maxLat: maxLat,
            maxLon: maxLon,
            host: connection.host_,
            databaseType: connection.databaseType_,
            query: {
                filter: {
                    databaseName: $scope.active.layers[0].database.name,
                    tableName: $scope.active.layers[0].table.name
                }
            }
        };
        if(data.databaseType === 'mongo') {
            data.latField = $scope.active.layers[0].latitudeField.columnName;
            data.lonField = $scope.active.layers[0].longitudeField.columnName;
        }
        else {
            data.locationField = $scope.active.layers[0].locationField.columnName;
        }
        return data;
    };

    // Returns the map's grid layer. If strict is true, only looks for grid layers if the map is (or is about to be) 
    // zoomed out far enough for the grid to be visible.
    var getGridLayer = function(strict) {
        if(strict === true 
            && $scope.currentGraticuleInterval <= $scope.map.minVisibleForGrid 
            && $scope.map.getGraticuleInterval() <= $scope.map.minVisibleForGrid) {
            return undefined;
        }
        var gridLayer = _.find($scope.active.layers, function(layer) {
                                return layer.type === $scope.GRID_LAYER || layer.type === $scope.BUCKET_LAYER; 
                            });
        if(strict === true && gridLayer !== undefined && !gridLayer.show) {
            return undefined;
        }
        return gridLayer;
    };

    var debounced = _.debounce(function() {
        $scope.functions.updateLayer(getGridLayer());
    }, 1000);

    /**
     * A simple handler for emitting USER-ALE messages from common user events on a map.
     * @method onMapEvent
     * @private
     */
    var onMapEvent = function(message) {
        var type = message.type;

        var gridLayer = getGridLayer(true);
        if(gridLayer !== undefined && $scope.map.getGraticuleInterval() !== $scope.currentGraticuleInterval) {
            $scope.currentGraticuleInterval = $scope.map.getGraticuleInterval();
            debounced();
        }

        if(type === "zoomend" && $scope.map.featurePopup) {
            $scope.map.map.removePopup($scope.map.featurePopup);
            $scope.map.featurePopup.destroy();
            $scope.map.featurePopup = null;
        }

        // For convencience in analysing the user logs through user-ale,
        // move (move start, move, move end) and zoom (zoom end) events are renamed
        // here to match preferred testing nomenclature.
        type = type.replace("move", "pan");
        type = type.replace("zoomend", "zoom");

        XDATA.userALE.log({
            activity: "alter",
            action: type,
            elementId: "map",
            elementType: "canvas",
            elementSub: "map-viewport",
            elementGroup: "map_group",
            source: "user",
            tags: ["map", "viewport"]
        });
    };

    /**
     * Event handler for date selected events issued over Neon's messaging channels.
     * @param {Object} message A Neon date selected message.
     * @method handleDateSelected
     * @private
     */
    var handleDateSelected = function(message) {
        var bounds = {
            start: _.isNumber(message.start) ? new Date(message.start) : undefined,
            end: _.isNumber(message.end) ? new Date(message.end) : undefined
        };
        $scope.active.layers.forEach(function(layer) {
            if(!layer.new && (layer.type === $scope.NODE_AND_ARROW_LAYER || layer.type === $scope.POINT_LAYER)) {
                layer.olLayer.setDateFilter(bounds);
            }
        });
    };

    /**
     * Removes the bounds rectangle from the map.
     * @method removeZoomRect
     * @private
     */
    var removeZoomRect = function() {
        if($scope.zoomRectId) {
            $scope.map.removeBox($scope.zoomRectId);
            $scope.zoomRectId = undefined;
        }
    };

    $scope.functions.onUpdateFields = function(layer) {
        updateFields(layer, {});
    };

    /**
     * Updates and validates the map fields in the given layer using the given configuration data.
     * @param {Object} layer
     * @param {Object} config
     * @method updateFields
     * @private
     */
    var updateFields = function(layer, config) {
        layer.latitudeField = $scope.functions.findFieldObject(config.latitudeField, neonMappings.LATITUDE, layer);
        layer.longitudeField = $scope.functions.findFieldObject(config.longitudeField, neonMappings.LONGITUDE, layer);
        layer.dateField = $scope.functions.findFieldObject(config.dateField, neonMappings.DATE, layer);
        layer.sizeField = $scope.functions.findFieldObject(config.sizeField, neonMappings.SIZE, layer);
        layer.colorField = $scope.functions.findFieldObject(config.colorField, neonMappings.COLOR, layer);
        layer.idField = $scope.functions.findFieldObject(config.idField, neonMappings.ID, layer);
        layer.sourceLatitudeField = $scope.functions.findFieldObject(config.sourceLatitudeField, neonMappings.SOURCE_LATITUDE_FIELD, layer);
        layer.sourceLongitudeField = $scope.functions.findFieldObject(config.sourceLongitudeField, neonMappings.SOURCE_LONGITUDE_FIELD, layer);
        layer.targetLatitudeField = $scope.functions.findFieldObject(config.targetLatitudeField, neonMappings.TARGET_LATITUDE_FIELD, layer);
        layer.targetLongitudeField = $scope.functions.findFieldObject(config.targetLongitudeField, neonMappings.TARGET_LONGITUDE_FIELD, layer);
        layer.lineColorField = $scope.functions.findFieldObject(config.lineColorField, neonMappings.LINE_COLOR_BY, layer);
        layer.nodeColorField = $scope.functions.findFieldObject(config.nodeColorField, neonMappings.NODE_COLOR_BY, layer);
        layer.lineSizeField = $scope.functions.findFieldObject(config.lineSizeField, neonMappings.LINE_SIZE, layer);
        layer.nodeSizeField = $scope.functions.findFieldObject(config.nodeSizeField, neonMappings.NODE_SIZE, layer);
        $scope.validateLayerFields(layer);
    };

    /**
     * Validates the map fields of the given layer, setting its error property if the required map fields are not set.
     * @param {Object} layer
     * @method validateLayerFields
     */
    $scope.validateLayerFields = function(layer) {
        var fields = [];
        if(layer.type === $scope.NODE_AND_ARROW_LAYER) {
            if(!$scope.functions.isFieldValid(layer.sourceLatitudeField)) {
                fields.push("Source Latitude");
            }
            if(!$scope.functions.isFieldValid(layer.sourceLongitudeField)) {
                fields.push("Source Longitude");
            }
            if(!$scope.functions.isFieldValid(layer.targetLatitudeField)) {
                fields.push("Target Latitude");
            }
            if(!$scope.functions.isFieldValid(layer.targetLongitudeField)) {
                fields.push("Target Longitude");
            }
        } else {
            if(!$scope.functions.isFieldValid(layer.latitudeField)) {
                fields.push("Latitude");
            }
            if(!$scope.functions.isFieldValid(layer.longitudeField)) {
                fields.push("Longitude");
            }
        }
        layer.error = fields.length ? "Please choose fields:  " + fields.join(", ") : undefined;
    };

    $scope.functions.addToNewLayer = function(layer, config) {
        layer.type = config.type || $scope.DEFAULT_NEW_LAYER_TYPE;
        layer.limit = config.limit || $scope.DEFAULT_LIMIT;
        layer.numPoints = layer.limit;
        layer.colorCode = config.colorCode;
        layer.lineColorCode = config.lineColorCode;
        layer.nodeColorCode = config.nodeColorCode;
        layer.gradientColorCode1 = config.gradientColorCode1;
        layer.gradientColorCode2 = config.gradientColorCode2;
        layer.gradientColorCode3 = config.gradientColorCode3;
        layer.gradientColorCode4 = config.gradientColorCode4;
        layer.gradientColorCode5 = config.gradientColorCode5;
        layer.applyTransientDateFilter = config.applyTransientDateFilter || false;
        layer.popupFields = config.popupFields || [];
        updateFields(layer, config);
        return layer;
    };

    $scope.functions.updateFilterValues = function(neonFilter, fieldNames) {
        var extentInFilter = findExtentInNeonFilter(neonFilter, fieldNames);
        if(_.keys(extentInFilter).length) {
            $scope.extent = extentInFilter;
            updateLinksAndBoundsBox();
        }
    };

    $scope.functions.needToUpdateFilter = function(neonFilters) {
        // TODO Map filters can be created in configurations other than [minLon, maxLon, minLat, maxLat] so we should probably handle those correctly too.
        if(!neonFilters.length || $scope.functions.getNumberOfFilterClauses(neonFilters[0]) !== 4) {
            return false;
        }

        // The bounds for each given neon filter must be the same.
        var minLon = neonFilters[0].filter.whereClause.whereClauses[0].rhs;
        var maxLon = neonFilters[0].filter.whereClause.whereClauses[1].rhs;
        var minLat = neonFilters[0].filter.whereClause.whereClauses[2].rhs;
        var maxLat = neonFilters[0].filter.whereClause.whereClauses[3].rhs;

        // If the bounds in the neon filter are the same as the extent then we don't need to update the extent.
        var same = $scope.extent ? $scope.extent.minimumLongitude === minLon && $scope.extent.maximumLongitude === maxLon &&
            $scope.extent.minimumLatitude === minLat && $scope.extent.maximumLatitude === maxLat : false;
        var answer = !same;

        neonFilters.forEach(function(neonFilter) {
            answer = answer && $scope.functions.getNumberOfFilterClauses(neonFilter) === 4 && minLon === neonFilter.filter.whereClause.whereClauses[0].rhs &&
                maxLon === neonFilter.filter.whereClause.whereClauses[1].rhs && minLat === neonFilter.filter.whereClause.whereClauses[2].rhs &&
                maxLat === neonFilter.filter.whereClause.whereClauses[3].rhs;
        });

        return answer;
    };

    /**
     * Calculates the zoom rectangle based on the given Neon filter.
     * @param {Object} neonFilter
     * @param {Array} fieldNames
     * @method findExtentInNeonFilter
     * @private
     */
    var findExtentInNeonFilter = function(neonFilter, fieldNames) {
        var extent = {};
        var latitudeFieldName = fieldNames[0];
        var clauses = fieldNames.length > 2 ? neonFilter.filter.whereClause.whereClauses[0].whereClauses : neonFilter.filter.whereClause.whereClauses;
        clauses.forEach(function(clause) {
            if(clause.type === "or") {
                extent.minimumLongitude = clause.whereClauses[0].whereClauses[0].rhs;
                extent.maximumLongitude = clause.whereClauses[0].whereClauses[1].rhs;
            } else if(clause.lhs === latitudeFieldName) {
                if(clause.operator === ">=") {
                    extent.minimumLatitude = clause.rhs;
                } else {
                    extent.maximumLatitude = clause.rhs;
                }
            } else {
                if(clause.operator === ">=") {
                    extent.minimumLongitude = clause.rhs;
                } else {
                    extent.maximumLongitude = clause.rhs;
                }
            }
        });

        if(!extent.minimumLongitude && !extent.maximumLongitude) {
            extent.minimumLongitude = -180;
            extent.maximumLongitude = 180;
        }

        return extent;
    };

    $scope.functions.getFilterFields = function(layer) {
        if(layer.type === $scope.NODE_AND_ARROW_LAYER) {
            return [layer.sourceLatitudeField, layer.sourceLongitudeField, layer.targetLatitudeField, layer.targetLongitudeField];
        }
        return [layer.latitudeField, layer.longitudeField];
    };

    /**
     * Returns the source to use in the links popup for the map layer using the database and table with the given names.
     * @param {String} database
     * @param {String} table
     * @method generatePointLinksSource
     * @private
     * @return {String}
     */
    var generatePointLinksSource = function(database, table) {
        return $scope.visualizationId + "-" + database + "-" + table;
    };

    /**
     * Shows/hides the legend
     * @method toggleLegend
     */
    $scope.toggleLegend = function() {
        $scope.active.legend.show = !$scope.active.legend.show;
    };

    /**
     * Shows/hides the legend for a single layer
     * @param {Number} index The index in the legend that contains the layer to show/hide
     * @method toggleLegend
     */
    $scope.toggleLegendLayer = function(index) {
        $scope.active.legend.layers[index].show = !$scope.active.legend.layers[index].show;
    };

    $scope.functions.updateData = function(data, layers) {
        var pointData = [];
        var gridData = [];
        if(data) {
            //The map transforms in neon will either give {data: [stuff]} or [{data: [stuff]}, {data: [stuff]}]
            // If the data we're given fits the points+grid query format of: [{data: [stuff]}, {data: [stuff]}]
            if (data.length > 1
                && data[0].data instanceof Array
                && data[1].data instanceof Array
                && Object.keys(data[0]).length === 1) {

                pointData = (data.length) ? (data[0].data !== undefined ? data[0].data : data[0]) : [];
                gridData = (data.length > 1) ? data[1].data : [];
            }
            else {
                pointData = data;
            }
        }

        var dataForBounds = gridData.length > 0 ? gridData : (pointData.length > 0 ? pointData : []); // Calculate our bounds from the grid layer's query if it exists, and otherwise from the normal query.
        var dataBounds = computeDataBounds(dataForBounds);
        var newBounds = new OpenLayers.Bounds(dataBounds.left, dataBounds.bottom, dataBounds.right, dataBounds.top)
            .transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);
        var mapExtent = $scope.map.map.getExtent();

        if(Math.abs(newBounds.left - newBounds.right) < Math.abs(mapExtent.left - mapExtent.right)) {
            $scope.dataBounds = dataBounds;
            // zoomToDataBounds();  //I don't know what purpose this served, but its removal doesn't seem to 
                                    //have broken anything, and it for some reason would always be called at the third
                                    //zoom level, kicking the user back out to max zoom.
        }

        (layers || $scope.active.layers).forEach(function(layer) {

            if(layer.olLayer) {
                layer.error = undefined;
                var colorMappings = undefined;
                if(layer.type === $scope.GRID_LAYER && $scope.map.getGraticuleInterval() > $scope.map.minVisibleForGrid && gridData.length > 0) {
                    colorMappings = transformToGridPoints(layer, gridData);
                }
                else if(layer.type === $scope.BUCKET_LAYER && $scope.map.getGraticuleInterval() > $scope.map.minVisibleForGrid && gridData.length > 0) {
                    colorMappings = transformToBucketPoints(layer, gridData);
                }
                else {
                    colorMappings = layer.olLayer.setData(pointData, layer.limit);
                }

                // Update the legend
                var index = _.findIndex($scope.active.legend.layers, {
                    olLayerId: layer.olLayer.id
                });
                if(layer.type === $scope.NODE_AND_ARROW_LAYER && _.keys(colorMappings).length) {
                    if(index >= 0) {
                        $scope.active.legend.layers[index].nodeColorMappings = colorMappings.nodeColors;
                        $scope.active.legend.layers[index].lineColorMappings = colorMappings.lineColors;
                        delete $scope.active.legend.layers[index].colorMappings;
                    } else {
                        $scope.active.legend.layers.push({
                            name: layer.name,
                            olLayerId: layer.olLayer.id,
                            show: true,
                            nodeColorMappings: colorMappings.nodeColors,
                            lineColorMappings: colorMappings.lineColors
                        });
                    }
                } else if(_.keys(colorMappings).length) {
                    if(index >= 0) {
                        $scope.active.legend.layers[index].colorMappings = colorMappings;
                        delete $scope.active.legend.layers[index].nodeColorMappings;
                        delete $scope.active.legend.layers[index].lineColorMappings;
                    } else {
                        $scope.active.legend.layers.push({
                            name: layer.name,
                            olLayerId: layer.olLayer.id,
                            show: true,
                            colorMappings: colorMappings
                        });
                    }
                }

                if(layer.type !== $scope.NODE_AND_ARROW_LAYER) {
                    layer.olLayer.linksSource = generatePointLinksSource(layer.database.name, layer.table.name);
                    createExternalLinks(data || [], layer.olLayer.linksSource, layer.latitudeField.columnName, layer.longitudeField.columnName);
                }
            }
        });
        if(getGridLayer(true) === undefined) {
            $scope.map.graticuleControl.deactivate();
        }
    };

    /**
     * Zooms the map to the current data bounds
     */
    var zoomToDataBounds = function() {
        $scope.map.zoomToBounds($scope.dataBounds);
    };

    /**
     * Computes the minimum bounding rectangle to bound the data
     * @param {Array} data
     * @method computeDataBounds
     * @return {Object} Returns object with keys 'left', 'bottom', 'right', and 'top' representing the minimum lat/lon bounds
     */
    var computeDataBounds = function(data) {
        if(data && data.length === 0) {
            return {
                left: -180,
                bottom: -90,
                right: 180,
                top: 90
            };
        } else if(data) {
            var bounds = {
                minLon: 180,
                minLat: 90,
                maxLon: -180,
                maxLat: -90
            };

            var recalculateBounds = function(data, longitudeField, latitudeField) {
                data.forEach(function(item) {
                    neon.helpers.getNestedValues(item, [longitudeField, latitudeField]).forEach(function(pointValue) {
                        bounds = calculateMinMaxBounds(bounds, pointValue[latitudeField], pointValue[longitudeField]);
                    });
                });
            };

            $scope.active.layers.forEach(function(layer) {
                if(!layer.new) {
                    if(layer.type === $scope.NODE_AND_ARROW_LAYER) {
                        var sourceLatitudeField = $scope.functions.isFieldValid(layer.sourceLatitudeField) ? layer.sourceLatitudeField.columnName : coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE_LATITUDE_MAPPING;
                        var sourceLongitudeField = $scope.functions.isFieldValid(layer.sourceLongitudeField) ? layer.sourceLongitudeField.columnName : coreMap.Map.Layer.NodeLayer.DEFAULT_SOURCE_LONGITUDE_MAPPING;
                        var targetLatitudeField = $scope.functions.isFieldValid(layer.targetLatitudeField) ? layer.targetLatitudeField.columnName : coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET_LATITUDE_MAPPING;
                        var targetLongitudeField = $scope.functions.isFieldValid(layer.targetLongitudeField) ? layer.targetLongitudeField.columnName : coreMap.Map.Layer.NodeLayer.DEFAULT_TARGET_LONGITUDE_MAPPING;
                        recalculateBounds(data, targetLongitudeField, targetLatitudeField);
                        recalculateBounds(data, sourceLongitudeField, sourceLatitudeField);
                    } else {
                        var latitudeField = $scope.functions.isFieldValid(layer.latitudeField) ? layer.latitudeField.columnName : coreMap.Map.Layer.HeatmapLayer.DEFAULT_LATITUDE_MAPPING;
                        var longitudeField = $scope.functions.isFieldValid(layer.longitudeField) ? layer.longitudeField.columnName : coreMap.Map.Layer.HeatmapLayer.DEFAULT_LONGITUDE_MAPPING;
                        recalculateBounds(data, longitudeField, latitudeField);
                    }
                }
            });

            return {
                left: bounds.minLon === 180 ? -180 : bounds.minLon,
                bottom: bounds.minLat === 90 ? -90 : bounds.minLat,
                right: bounds.maxLon === -180 ? 180 : bounds.maxLon,
                top: bounds.maxLat === -90 ? 90 : bounds.maxLat
            };
        }
    };

    /**
     * Calculates the new minimum lat/lon values based on the current bounds and the new lat and lon values.
     * @param {Object} bounds Object of latitude and longitude values representing bounds
     * @param {Number} bounds.maxLat The maximum latitude value
     * @param {Number} bounds.maxLon The maximum longitude value
     * @param {Number} bounds.minLat The minimum latitude value
     * @param {Number} bounds.minLon The minimum longitude value
     * @param {Number} lat Latitude to compare bounds against
     * @param {Number} lon Longitude to compare bounds against
     * @method calculateMinMaxBounds
     * @return {Object} Returns bounds with updated lat/lons
     */
    var calculateMinMaxBounds = function(bounds, lat, lon) {
        if($.isNumeric(lat) && $.isNumeric(lon)) {
            if(lon < bounds.minLon) {
                bounds.minLon = lon;
            }
            if(lon > bounds.maxLon) {
                bounds.maxLon = lon;
            }
            if(lat < bounds.minLat) {
                bounds.minLat = lat;
            }
            if(lat > bounds.maxLat) {
                bounds.maxLat = lat;
            }
        }

        return bounds;
    };

    $scope.reloadFromDB = function() {
        $scope.reloadDatabase = true;
        $scope.functions.updateLayer(getGridLayer());
        $scope.setDefaultView();
        $scope.functions.updateLayer(getGridLayer());
    }

    /**
     * Creates the external links for the given data and source with the given latitude and longitude fields.
     * @param {Array} data
     * @param {String} source
     * @param {String} latitudeField
     * @param {String} longitudeField
     * @method createExternalLinks
     * @private
     */
    var createExternalLinks = function(data, source, latitudeField, longitudeField) {
        data.forEach(function(item) {
            neon.helpers.getNestedValues(item, [longitudeField, latitudeField]).forEach(function(pointValue) {
                var linkData = {};
                linkData[neonMappings.POINT] = {};
                linkData[neonMappings.POINT][neonMappings.LATITUDE] = pointValue[longitudeField];
                linkData[neonMappings.POINT][neonMappings.LONGITUDE] = pointValue[latitudeField];
                $scope.functions.createLinksForData(neonMappings.POINT, linkData, $scope.functions.getLinksPopupService().generatePointKey(pointValue[longitudeField], pointValue[latitudeField]), source);
            });
        });
    };

    $scope.functions.addToQuery = function(query, unsharedFilterWhereClause, layers) {//*
        var queryFields = {};
        var limit;

        var addFields = function(layerFields) {
            layerFields.forEach(function(field) {
                if($scope.functions.isFieldValid(field)) {
                    queryFields[field.columnName] = true;
                }
            });
        };

        layers.forEach(function(layer) {

            // Use the highest limit for the data query from all layers for the given database/table.
            // Only the first X elements will be used for each layer based on the limit of the layer.
            limit = limit ? Math.max(limit, layer.limit) : layer.limit;

            var layerFields = [
                layer.latitudeField,
                layer.longitudeField,
                layer.sourceLatitudeField,
                layer.sourceLongitudeField,
                layer.targetLatitudeField,
                layer.targetLongitudeField,
                layer.lineColorField,
                layer.lineSizeField,
                layer.nodeColorField,
                layer.nodeSizeField,
                layer.colorField,
                layer.dateField,
                layer.sizeField,
                layer.idField
            ];

            if(layer.popupFields) {
                layer.popupFields.forEach(function(fieldName) {
                    layerFields.push(fieldName);
                });
            }

            query.useInMemory = false;

            // if((layer.type === $scope.GRID_LAYER || layer.type === $scope.BUCKET_LAYER)
            if((layer.type === $scope.GRID_LAYER)
                 && $scope.map.getGraticuleInterval() > $scope.map.minVisibleForGrid) {
                var interval = $scope.map.getGraticuleInterval();
                var bottom = getNearestMultiple(interval, $scope.dataBounds.bottom, 'lower');
                var top = getNearestMultiple(interval, $scope.dataBounds.top, 'higher');
                var left = getNearestMultiple(interval, $scope.dataBounds.left, 'lower');
                var right = getNearestMultiple(interval, $scope.dataBounds.right, 'higher');
                var params = {
                    latField: layer.latitudeField.columnName,
                    lonField: layer.longitudeField.columnName,
                    aggregationField: (layer.colorField) ? layer.colorField.prettyName : "",
                    minLat: bottom,
                    maxLat: top,
                    minLon: left,
                    maxLon: right,
                    numTilesVertical: (top - bottom) / interval,
                    numTilesHorizontal: (right - left) / interval
                };
                query.transform(new neon.query.Transform('com.ncc.neon.query.transform.GeoGridTransformer').params(params));
                if(layer.colorField) {
                    layerFields.push({
                        columnName: layer.colorField.columnName,
                        prettyName: layer.colorField.prettyName
                    });
                }
            }

            if(layer.type === $scope.BUCKET_LAYER) {
                if ($scope.map.getGraticuleInterval() > $scope.map.minVisibleForGrid) {

                    var interval = $scope.map.getGraticuleInterval();
                    var bottom = getNearestMultiple(interval, $scope.dataBounds.bottom, 'lower');
                    var top = getNearestMultiple(interval, $scope.dataBounds.top, 'higher');
                    var left = getNearestMultiple(interval, $scope.dataBounds.left, 'lower');
                    var right = getNearestMultiple(interval, $scope.dataBounds.right, 'higher');
                    var intList = $scope.map.graticuleIntervalList;

                    //what is "dataBounds"? does it actually look for the nearest points to each given lat and lon?
                    var params = {
                        latField: layer.latitudeField.columnName,
                        lonField: layer.longitudeField.columnName,
                        aggregationField: (layer.colorField) ? layer.colorField.prettyName : "",
                        intervals: intList,
                        i: interval
                    };

                    //Does this call the transform's method? I don't think so
                    query.transform(new neon.query.Transform('com.ncc.neon.query.transform.BucketingTransformer').params(params));
                    query.useInMemory = ! $scope.reloadDatabase;
                    
                    //after querying the DB once and building the buckets from the results, immediately set the program 
                    // to read directly from the .
                    //You could add a second button that locks the buckets to not use memory, if you wanted;
                    // just make a toggle button call a function that calls markDirty and sets a lock
                    $scope.reloadDatabase = false;

                    limit = 10000000;
                }
                else { // if it's a bucket_layer but youve zoomed in enough that it turns into a points layer, don't use 
                       //  the bucket layer's limit (bucket layer tries to query all points)
                    limit = layer.limit || $scope.DEFAULT_LIMIT;
                }
            }

            addFields(layerFields);

        });

        query.limit(limit || $scope.DEFAULT_LIMIT).withFields(Object.keys(queryFields));
        return query;
    };
    
    $scope.functions.executeQuery = function(connection, query) {
        if(query instanceof neon.query.Query) {
            return connection.executeQuery(query);
        }
        else {
            return connection.executeQueryGroup(query);
        }
    };

    /**
     * Gets the nearest multiple of a number that is either higher or lower than the given value.
     * @param {Number} multiple - The value 
     * @method getNearestMultiple
     */
    var getNearestMultiple = function(multiple, value, highOrLow) { // Multiple is assumed > 0, highOrLow is a string eqaling "higher" or "lower"
        var toReturn = value - (value % multiple);
        if(highOrLow === 'higher' && toReturn < value) {
            toReturn += multiple;
        }
        else if(highOrLow === 'lower' && toReturn > value) {
            toReturn -= multiple;
        }
        return toReturn;
    }

    $scope.functions.createNeonQueryWhereClause = function(layers) {
        var validation = $scope.functions.getDatasetOptions().checkForCoordinateValidation;
        var whereClauses;
        if(validation === "valid_numbers") {
            whereClauses = [];
            layers.forEach(function(layer) {
                if(layer.type === coreMap.Map.NODE_AND_ARROW_LAYER) {
                    whereClauses.push(neon.query.and(
                        neon.query.where(layer.sourceLatitudeField.columnName, ">=", -180),
                        neon.query.where(layer.sourceLatitudeField.columnName, "<=", 180),
                        neon.query.where(layer.sourceLongitudeField.columnName, ">=", -90),
                        neon.query.where(layer.sourceLongitudeField.columnName, "<=", 90)
                    ));
                    whereClauses.push(neon.query.and(
                        neon.query.where(layer.targetLatitudeField.columnName, ">=", -180),
                        neon.query.where(layer.targetLatitudeField.columnName, "<=", 180),
                        neon.query.where(layer.targetLongitudeField.columnName, ">=", -90),
                        neon.query.where(layer.targetLongitudeField.columnName, "<=", 90)
                    ));
                } else {
                    whereClauses.push(neon.query.and(
                        neon.query.where(layer.latitudeField.columnName, ">=", -180),
                        neon.query.where(layer.latitudeField.columnName, "<=", 180),
                        neon.query.where(layer.longitudeField.columnName, ">=", -90),
                        neon.query.where(layer.longitudeField.columnName, "<=", 90)
                    ));
                }
            });

            return neon.query.or.apply(neon.query, whereClauses);
        }

        if(validation === "null_values") {
            whereClauses = [];
            layers.forEach(function(layer) {
                if(layer.type === coreMap.Map.NODE_AND_ARROW_LAYER) {
                    whereClauses.push(neon.query.and(
                        neon.query.where(layer.sourceLatitudeField.columnName, "!=", null),
                        neon.query.where(layer.sourceLongitudeField.columnName, "!=", null)
                    ));
                    whereClauses.push(neon.query.and(
                        neon.query.where(layer.targetLatitudeField.columnName, "!=", null),
                        neon.query.where(layer.targetLongitudeField.columnName, "!=", null)
                    ));
                } else {
                    whereClauses.push(neon.query.and(
                        neon.query.where(layer.latitudeField.columnName, "!=", null),
                        neon.query.where(layer.longitudeField.columnName, "!=", null)
                    ));
                }
            });

            if(whereClauses.length) {
                return neon.query.or.apply(neon.query, whereClauses);
            }
        }

        return undefined;
    };

    /**
     * Creates and returns a filter on the given latitude/longitude fields using the extent set by this visualization.
     * @param {Object} databaseAndTableName Contains the database and table name
     * @param {Array} fieldNames An array containing the names of the latitude and longitude fields (as its first and
     * second elements) on which to filter. It may contain two sets of latitude and longitude fields in which case the
     * third and fourth elements contain the next latitude and longitude fields, respectively.
     * @method createFilterClauseForExtent
     * @private
     * @return {Object} A neon.query.Filter object
     */
    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldNames) {
        if(fieldNames.length === 2) {
            return createNeonFilterClauseForFields(fieldNames[0], fieldNames[1]);
        } else if(fieldNames.length === 4) {
            var clauses = [createNeonFilterClauseForFields(fieldNames[0], fieldNames[1]), createNeonFilterClauseForFields(fieldNames[2], fieldNames[3])];
            return neon.query.and.apply(neon.query, clauses);
        }
    };

    /**
     * Creates and returns a filter on the given latitude/longitude fields
     * @param {String} latitudeFieldName The name of the latitude field
     * @param {String} longitudeFieldName The name of the longitude field
     * @method createNeonFilterClauseForFields
     * @return {Object} A neon.query.Filter object
     */
    var createNeonFilterClauseForFields = function(latitudeFieldName, longitudeFieldName) {
        var leftClause = neon.query.where(longitudeFieldName, ">=", $scope.extent.minimumLongitude);
        var rightClause = neon.query.where(longitudeFieldName, "<=", $scope.extent.maximumLongitude);
        var bottomClause = neon.query.where(latitudeFieldName, ">=", $scope.extent.minimumLatitude);
        var topClause = neon.query.where(latitudeFieldName, "<=", $scope.extent.maximumLatitude);
        var leftDateLine = {};
        var rightDateLine = {};
        var datelineClause = {};

        // Deal with different dateline crossing scenarios.
        if($scope.extent.minimumLongitude < -180 && $scope.extent.maximumLongitude > 180) {
            return neon.query.and(topClause, bottomClause);
        }

        if($scope.extent.minimumLongitude < -180) {
            leftClause = neon.query.where(longitudeFieldName, ">=", $scope.extent.minimumLongitude + 360);
            leftDateLine = neon.query.where(longitudeFieldName, "<=", 180);
            rightDateLine = neon.query.where(longitudeFieldName, ">=", -180);
            datelineClause = neon.query.or(neon.query.and(leftClause, leftDateLine), neon.query.and(rightClause, rightDateLine));
            return neon.query.and(topClause, bottomClause, datelineClause);
        }

        if($scope.extent.maximumLongitude > 180) {
            rightClause = neon.query.where(longitudeFieldName, "<=", $scope.extent.maximumLongitude - 360);
            rightDateLine = neon.query.where(longitudeFieldName, ">=", -180);
            leftDateLine = neon.query.where(longitudeFieldName, "<=", 180);
            datelineClause = neon.query.or(neon.query.and(leftClause, leftDateLine), neon.query.and(rightClause, rightDateLine));
            return neon.query.and(topClause, bottomClause, datelineClause);
        }

        return neon.query.and(leftClause, rightClause, bottomClause, topClause);
    };

    /**
     * Removes the filter for this visualization.
     * @method removeFilter
     */
    $scope.removeFilter = function() {
        $scope.functions.removeNeonFilter();
    };

    $scope.functions.removeFilterValues = function() {
        removeZoomRect();
        $scope.extent = undefined;
        $scope.error = "";
        $scope.functions.removeLinks();
    };

    $scope.functions.onToggleShowLayer = function(layer) {
        $scope.map.setLayerVisibility(layer.olLayer.id, layer.show);
        if(layer.type == $scope.GRID_LAYER && layer.show) {
            $scope.map.graticuleControl.activate();
        }
        else if(layer.type == $scope.GRID_LAYER) {
            $scope.map.graticuleControl.deactivate();
        }
    };

    // function handleMouseMovement(d, i) {  // Add interactivity

    //         // Use D3 to select element, change color and size
    //         // d3.select(this).attr({
    //         //   fill: "orange",
    //         //   r: radius * 2
    //         // });

    //         // Specify where to put label of text
    //         svg.append("text").attr({
    //            id: "t" + d.x + "-" + d.y + "-" + i,  // Create an id for text so we can select it later for removing on mouseout
    //             x: function() { return xScale(d.x) - 30; },
    //             y: function() { return yScale(d.y) - 15; }
    //         })
    //         .text(function() {
    //           return [d.x, d.y];  // Value of the text
    //         });
    //       }

    /**
     * Creates or removes points on map layer (named "Selected Point") for the given data
     * @param {Object} message
     * @param {Object} message.data
     * @param {String} message.database
     * @param {String} message.table
     * @method handlePointSelected
     * @private
     */
    var handlePointSelected = function(message) {
        // Remove previously selected point, if exists
        if($scope.selectedPointLayer && $scope.selectedPointLayer.name) {
            $scope.map.removeLayer($scope.selectedPointLayer);
            $scope.selectedPointLayer = {};
        }

        if(message.data) {
            var allCoordinates = $scope.functions.getMapping("allCoordinates", message.database, message.table) || [];
            var layer = new coreMap.Map.Layer.SelectedPointsLayer("Selected Points");
            var data = _.isArray(message.data) ? message.data : [message.data];

            var createPointsAndFeatures = function(latitudeField, longitudeField) {
                var features = [];
                if(latitudeField && longitudeField) {
                    data.forEach(function(item) {
                        neon.helpers.getNestedValues(item, [longitudeField, latitudeField]).forEach(function(pointValue) {
                            var openLayersPoint = new OpenLayers.Geometry.Point(pointValue[longitudeField], pointValue[latitudeField]);
                            openLayersPoint.transform(coreMap.Map.SOURCE_PROJECTION, coreMap.Map.DESTINATION_PROJECTION);
                            var feature = new OpenLayers.Feature.Vector(openLayersPoint);
                            feature.attributes = item;
                            features.push(feature);
                        });
                    });
                }
                return features;
            };

            /*
             * Create points on the map using either:
             *      - lat/lon pairs specified in the allCoordinates mapping in the config
             *      - the lat/lon mapping specified in the points layer for the specified
             *        database and table
             */
            if(allCoordinates.length) {
                var features = [];
                for(var i = 0; i < allCoordinates.length; i++) {
                    features = features.concat(createPointsAndFeatures(allCoordinates[i].latitude, allCoordinates[i].longitude));
                }
                layer.addFeatures(features);
            } else {
                var pointsLayer = _.find($scope.bindings.config, {
                    type: $scope.POINT_LAYER,
                    database: message.database,
                    table: message.table
                });
                // If no mapping is provided, check the table before just blindly assigning lat/lon.

                var latitudeField = (pointsLayer && pointsLayer.latitudeMapping) ? pointsLayer.latitudeMapping :
                    (datasetService.getMapping(message.database, message.table, 'latitude') || "latitude");
                var longitudeField = (pointsLayer && pointsLayer.longitudeMapping) ? pointsLayer.longitudeMapping :
                    (datasetService.getMapping(message.database, message.table, 'longitude') || "longitude");
                layer.addFeatures(createPointsAndFeatures(latitudeField, longitudeField));
            }
            $scope.map.addLayer(layer);
            $scope.selectedPointLayer = layer;
        }
    };

    /**
     * Sets the maps viewing bounds to either those defined in the configuration file, the data bounds, or
     * all the way zoomed out
     * @method setDefaultView
     */
    $scope.setDefaultView = function() {
        if($scope.bindings.bounds) {
            $scope.map.zoomToBounds($scope.bindings.bounds);
        } else if($scope.dataBounds) {
            zoomToDataBounds();
        } else {
            $scope.map.zoomToBounds({
                left: -180,
                bottom: -90,
                right: 180,
                top: 90
            });
        }
    };

    $scope.functions.updateLayerDisplay = function(layer) {
        var legendIndex = -1;
        if(layer.olLayer) {
            legendIndex = _.findIndex($scope.active.legend.layers, {
                olLayerId: layer.olLayer.id
            });

            $scope.map.removeLayer(layer.olLayer);
            layer.olLayer = undefined;
        }

        layer.olLayer = createMapLayer(layer);

        // If the layer already existed, recreating the layer will change its ID. Associate the
        // existing legend with the new ID.
        if(legendIndex >= 0) {
            $scope.active.legend.layers[legendIndex].olLayerId = layer.olLayer.id;
        }

        $scope.map.setLayerVisibility(layer.olLayer.id, layer.show);
    };

    /**
     * Creates and adds a layer to the map
     * @param {Object} layer
     * @method createMapLayer
     * @return {Object} olLayer
     * @private
     */
    var createMapLayer = function(layer) {
        var options = {
            database: layer.database.name,
            table: layer.table.name,
            colors: $scope.functions.isFieldValid(layer.colorField) ? $scope.functions.getColorMaps(layer, layer.colorField.columnName) || {} : {},
            latitudeMapping: $scope.functions.isFieldValid(layer.latitudeField) ? layer.latitudeField.columnName : "",
            longitudeMapping: $scope.functions.isFieldValid(layer.longitudeField) ? layer.longitudeField.columnName : "",
            categoryMapping: $scope.functions.isFieldValid(layer.colorField) ? layer.colorField.columnName : "",
            dateMapping: $scope.functions.isFieldValid(layer.dateField) ? layer.dateField.columnName : "",
            sizeMapping: $scope.functions.isFieldValid(layer.sizeField) ? layer.sizeField.columnName : "",
            idMapping: $scope.functions.isFieldValid(layer.idField) ? layer.idField.columnName : "",
            defaultColor: layer.colorCode || "",
            sourceLatitudeMapping: $scope.functions.isFieldValid(layer.sourceLatitudeField) ? layer.sourceLatitudeField.columnName : "",
            sourceLongitudeMapping: $scope.functions.isFieldValid(layer.sourceLongitudeField) ? layer.sourceLongitudeField.columnName : "",
            targetLatitudeMapping: $scope.functions.isFieldValid(layer.targetLatitudeField) ? layer.targetLatitudeField.columnName : "",
            targetLongitudeMapping: $scope.functions.isFieldValid(layer.targetLongitudeField) ? layer.targetLongitudeField.columnName : "",
            lineMapping: $scope.functions.isFieldValid(layer.lineColorField) ? layer.lineColorField.columnName : "",
            nodeMapping: $scope.functions.isFieldValid(layer.nodeColorField) ? layer.nodeColorField.columnName : "",
            lineWeightMapping: $scope.functions.isFieldValid(layer.lineSizeField) ? layer.lineSizeField.columnName : "",
            nodeWeightMapping: $scope.functions.isFieldValid(layer.nodeSizeField) ? layer.nodeSizeField.columnName : "",
            lineDefaultColor: layer.lineColorCode || "",
            applyTransientDateFilter: layer.applyTransientDateFilter || false,
            nodeDefaultColor: layer.nodeColorCode || "",
            gradients: generateGradientList(layer),
            clusterPopupFields: layer.popupFields,
            linkyConfig: $scope.linkyConfig
        };

        var olLayer;
        if(layer.type === $scope.POINT_LAYER) {
            olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, options);
        } else if(layer.type === $scope.CLUSTER_LAYER) {
            options.cluster = true;
            olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, options);
        } else if(layer.type === $scope.GRID_LAYER) {
            options.styleMap = new OpenLayers.StyleMap({
                'default': {
                    pointRadius: $scope.gridLayerPointRadius
                }
            });
            olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, options);
            if(layer.show) {
                $scope.map.graticuleControl.activate();
            }
        }  else if(layer.type === $scope.BUCKET_LAYER) {
            options.styleMap = new OpenLayers.StyleMap({
                'default': {
                    pointRadius: $scope.gridLayerPointRadius
                }
            });
            olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, options);
            // layer.limit = 10000000;
            if(layer.show) {
                $scope.map.graticuleControl.activate();
            }
        } else if(layer.type === $scope.ROUTE_LAYER) {
            options.route = true;
            olLayer = new coreMap.Map.Layer.PointsLayer(layer.name, options);
        } else if(layer.type === $scope.HEATMAP_LAYER) {
            olLayer = new coreMap.Map.Layer.HeatmapLayer(layer.name, $scope.map.map, $scope.map.map.baseLayer, options);
        } else if(layer.type === $scope.NODE_AND_ARROW_LAYER) {
            olLayer = new coreMap.Map.Layer.NodeLayer(layer.name, options);
        }

        if(olLayer) {
            $scope.map.addLayer(olLayer);
        }

        return olLayer;
    };

    var generateGradientList = function(layer) {
        return (layer.gradientColorCode1 ? [layer.gradientColorCode1] : [])
            .concat((layer.gradientColorCode2 ? [layer.gradientColorCode2] : []))
            .concat((layer.gradientColorCode3 ? [layer.gradientColorCode3] : []))
            .concat((layer.gradientColorCode4 ? [layer.gradientColorCode4] : []))
            .concat((layer.gradientColorCode5 ? [layer.gradientColorCode5] : []));
    };

    var transformToGridPoints = function(layer, data) {
        //TODO here is where the grid makes the boxes and points
        var newPointsList = [];
        if(data) {
            if(layer.show) {
                $scope.map.graticuleControl.activate();
            }
            mergeMultipleValues(data, layer);
            data.forEach(function(bucket) {
                if(bucket.data.length > 0) {
                    var totalPoints = 0
                    var boxHeight = bucket.top - bucket.bottom;
                    var mostToLeast = bucket.data.sort(function(a, b) { return b.count - a.count; });
                    var numPoints = Math.min(mostToLeast.length, $scope.maxNumGridPoints);
                    for(var x = 0; x < numPoints; x++) {
                        var row = Math.floor(x / 10) + 1;
                        var column = (x % 10) + 1;
                        var newPoint = {
                            type_of_feature_point: 'grid_point',
                            count: mostToLeast[x].count,
                            pointRadius: $scope.gridLayerPointRadius * Math.log( 1 + mostToLeast[x].count),
                        };
                        if(layer.colorField) {
                            newPoint.typeName = layer.colorField.prettyName || layer.colorField.columnName; // We need these to properly
                            newPoint.typeValue = mostToLeast[x][layer.colorField.columnName];               // create popups on point click.
                            newPoint[layer.colorField.columnName] = newPoint.typeValue; // We need this so that coloring of points will work.
                        }
                        newPoint[layer.latitudeField.columnName] = bucket.top - boxHeight * (0.1 * row);
                        newPoint[layer.longitudeField.columnName] = bucket.left + boxHeight * (0.1 * column);
                        
                        newPointsList.push(newPoint);
                    }
                }
            });
        }
        return layer.olLayer.setData(newPointsList || [], layer.limit);
    };

    var transformToBucketPoints = function(layer, data) {
        var newPointsList = [];
        if(data) {
            if(layer.show) {
                $scope.map.graticuleControl.activate();
            }

            //This appears to iterate through the items inside each bucket. 
            //Since each bucket has only one item here, we don't need it.
            // mergeMultipleValues(data, layer);

            var max = 0;
            var sum = 0;
            data.forEach(function(bucket) {
                var temp = bucket.data[0].count;
                sum += temp;
                if (temp > max) {
                    max = temp;
                }
            });

            var sqrRtMax = Math.sqrt(max);
            data.forEach(function(bucket) {
                if(bucket.data.length > 0) {
                    var totalPoints = 0

                    var newPoint = {
                        type_of_feature_point: 'grid_point',
                        count: bucket.data[0].count,
                        //So that points are never smaller than $scope.gridLayerPointRadius pixels across, and are always
                        // sized in proportion to the largest point on the map.
                        latField: layer.latitudeField.columnName,
                        lonField: layer.longitudeField.columnName,
                        pointRadius: $scope.gridLayerPointRadius * (1 + Math.log( 1 + bucket.data[0].count/sqrRtMax))
                    };
                    if(layer.colorField) {
                        newPoint.typeName = layer.colorField.prettyName || layer.colorField.columnName; // We need these to properly
                        newPoint.typeValue = bucket[layer.colorField.columnName];               // create popups on point click.
                        newPoint[layer.colorField.columnName] = newPoint.typeValue; // We need this so that coloring of points will work.
                    }
                    newPoint[layer.latitudeField.columnName] = bucket.data[0].centroid[1];
                    newPoint[layer.longitudeField.columnName] = bucket.data[0].centroid[0];
                    
                    newPointsList.push(newPoint);
                }
            });
        }
        // since it's the bucket grid, get all the data, not just the layer.limit
        var results = layer.olLayer.setData(newPointsList || [], 10000000);
        //Because BUCKET_LAYER doesn't have its own definition of setData, and uses some default I can't find; TODO
        layer.olLayer.pointTotal = sum;

        return results;
        // return layer.olLayer.setData(newPointsList || [], layer.limit);
    };

    var mergeMultipleValues = function(data, layer) { // DOES THIS WORK? I DON'T KNOW. TODO
        data.forEach(function(bucket) {
            if(bucket.data.length < 1 || !(bucket.data[0][layer.colorField.columnName] instanceof Array)) {
                return;
            }
            var newData = [];
            for(var x = bucket.data.length - 1; x >= 0; x--) {
                if(bucket.data[x][layer.colorField.columnName].length < 2) {
                    newData.push(bucket.data[x]);
                    bucket.data.splice(x, 1);
                }
            }
            bucket.data.forEach(function(record) {
                if(record[layer.colorField.columnName].length >= 2) {
                    record[layer.colorField.columnName].forEach(function(arrayValue) {
                        var matching = _.find(newData, function(val) {
                            return val[layer.colorField.columnName][0] === arrayValue;
                        });
                        if(matching !== undefined) {
                            matching.count += record.count;
                        }
                        else {
                            var newObject = {
                                count: record.count
                            };
                            newObject[layer.colorField.columnName] = [arrayValue];
                            newData.push(newObject);
                        }
                    });
                }
            });
            bucket.data = newData;
        });
    };

    $scope.functions.onDeleteLayer = function(layer) {
        if(layer.olLayer) {
            // Remove layer from the legend
            var index = _.findIndex($scope.active.legend.layers, {
                olLayerId: layer.olLayer.id
            });
            if(index >= 0) {
                $scope.active.legend.layers.splice(index, 1);
            }

            // Remove layer from the map.
            $scope.map.removeLayer(layer.olLayer);
        }
    };

    $scope.functions.onReorderLayers = function() {
        $scope.map.reorderLayers(_.filter($scope.active.layers, function(layer) {
            if(layer=== undefined || layer === null) {
                for(var index = 0; index < $scope.active.layers.length; index ++) {
                    if($scope.active.layers[index] === layer) {
                        $scope.active.layers.splice(index, 1);
                    }
                    return;
                }
            }
            return !layer.new;
        }).map(function(item) {
            return item.olLayer;
        }));
    };

    /**
     * Updates the color of the base layer in the map using the base layer color from the global options.
     * @method updateBaseLayerColor
     */
    $scope.updateBaseLayerColor = function() {
        if($scope.map) {
            $scope.map.setBaseLayerColor($scope.active.baseLayerColor);
        }
    };

    $scope.updateRouteLayerDisabled = function() {
        // TODO Logging
    };

    $scope.getFilterData = function() {
        return $scope.extent ? ["Map Filter"] : [];
    };

    $scope.createFilterDesc = function() {
        return $scope.extent ? "Latitude from " + $scope.extent.minimumLatitude + " to " + $scope.extent.maximumLatitude + " and longitude from " + $scope.extent.minimumLongitude + " to " + $scope.extent.maximumLongitude : "";
    };

    $scope.functions.hideHeaders = function() {
        return false;
    };

    $scope.functions.onThemeChanged = function(theme) {
        if(theme.type !== $scope.active.baseLayerColor) {
            $scope.active.baseLayerColor = theme.type;
            $scope.updateBaseLayerColor();
        }
    };

    $scope.functions.createExportDataObject = function(exportId, queries) {
        var finalObject = {
            name: "Map",
            data: []
        };

        queries.forEach(function(queryData) {
            if(queryData.query.transforms && (queryData.query.transforms[0].transformName === 'com.ncc.neon.query.transform.GeoGridTransformer')
                                                || queryData.query.transforms[0].transformName === 'com.ncc.neon.query.transform.BucketingTransformer') {
                return; // Ignore grid and bucketing queries.
            }
            var tempObject = {
                query: queryData.query,
                name: "map_" + queryData.layer.database.name + "_" + queryData.layer.table.name + "-" + exportId,
                fields: [],
                ignoreFilters: queryData.query.ignoreFilters_,
                selectionOnly: queryData.query.selectionOnly_,
                ignoredFilterIds: queryData.query.ignoredFilterIds_,
                type: "query"
            };
            for(var count = 0, fields = $scope.functions.getUnsortedFields(queryData.layer); count < fields.length; count++) {
                tempObject.fields.push({
                    query: fields[count].columnName,
                    pretty: fields[count].prettyName || fields[count].columnName
                });
            }
            finalObject.data.push(tempObject);
        });

        return finalObject;
    };

    $scope.functions.addToLayerBindings = function(bindings, layer) {
        bindings.type = layer.type;
        bindings.limit = layer.limit;
        bindings.latitudeField = $scope.functions.isFieldValid(layer.latitudeField) ? layer.latitudeField.columnName : "";
        bindings.longitudeField = $scope.functions.isFieldValid(layer.longitudeField) ? layer.longitudeField.columnName : "";
        bindings.sourceLatitudeField = $scope.functions.isFieldValid(layer.sourceLatitudeField) ? layer.sourceLatitudeField.columnName : "";
        bindings.sourceLongitudeField = $scope.functions.isFieldValid(layer.sourceLongitudeField) ? layer.sourceLongitudeField.columnName : "";
        bindings.targetLatitudeField = $scope.functions.isFieldValid(layer.targetLatitudeField) ? layer.targetLatitudeField.columnName : "";
        bindings.targetLongitudeField = $scope.functions.isFieldValid(layer.targetLongitudeField) ? layer.targetLongitudeField.columnName : "";
        bindings.colorField = $scope.functions.isFieldValid(layer.colorField) ? layer.colorField.columnName : "";
        bindings.dateField = $scope.functions.isFieldValid(layer.dateField) ? layer.dateField.columnName : "";
        bindings.sizeField = $scope.functions.isFieldValid(layer.sizeField) ? layer.sizeField.columnName : "";
        bindings.idField = $scope.functions.isFieldValid(layer.idField) ? layer.idField.columnName : "";
        bindings.colorCode = layer.colorCode || "";
        bindings.lineColorField = $scope.functions.isFieldValid(layer.lineColorField) ? layer.lineColorField.columnName : "";
        bindings.nodeColorField = $scope.functions.isFieldValid(layer.nodeColorField) ? layer.nodeColorField.columnName : "";
        bindings.lineSizeField = $scope.functions.isFieldValid(layer.lineSizeField) ? layer.lineSizeField.columnName : "";
        bindings.nodeSizeField = $scope.functions.isFieldValid(layer.nodeSizeField) ? layer.nodeSizeField.columnName : "";
        bindings.lineColorCode = layer.lineColorCode || "";
        bindings.nodeColorCode = layer.nodeColorCode || "";
        bindings.gradientColorCode1 = layer.gradientColorCode1 || "";
        bindings.gradientColorCode2 = layer.gradientColorCode2 || "";
        bindings.gradientColorCode3 = layer.gradientColorCode3 || "";
        bindings.gradientColorCode4 = layer.gradientColorCode4 || "";
        bindings.gradientColorCode5 = layer.gradientColorCode5 || "";
        bindings.applyTransientDateFilter = layer.applyTransientDateFilter || false;
        bindings.popupFields = layer.popupFields || [];
        return bindings;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.bounds = $scope.bindings.bounds;
        return bindings;
    };


}]);
