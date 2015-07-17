'use strict';
/*
 * Copyright 2013 Next Century Corporation
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

var tables = tables || {};
tables.LINKABLE = "linkable";

/**
 * Creates a new table
 * @class Table
 * @namespace tables
 * @param {String} tableSelector The selector for the component in which the table will be drawn
 * @param {Object} opts A collection of key/value pairs used for configuration parameters:
 * <ul>
 *     <li>data (required) - An array of data to display in the table</li>
 *     <li>columns (optional) - A list of the fields to display in the table. If not specified, the table
 *     will iterate through all of the rows and get the unique column names. This can be a slow operation for
 *     large datasets.</li>
 *     <li>id (optional) - The name of the column with the unique id for the item. If this is not
 *     specified, an id field will be autogenerated and appended to the data (the original data
 *     will be modified)</li>
 *     <li>gridOptions (optional) - Slickgrid options may be set here.
 *     </li>
 * </ul>
 *
 * @constructor
 *
 * @example
 *     var data = [
 *                 {"field1": "aVal", "field2": 2},
 *                 {"field1": "bVal", "field2": 5, "anotherField" : "anotherVal"},
 *                ];
 *     var columns = [
 *                    {name: "field1"},
 *                    {name: "field2"},
 *                    {name: "field3", field: "anotherField", width: 20}
 *                   ];
 *     var opts = { "data" : data, "columns" : columns };
 *     var table = new tables.Table('#table', opts).draw();
 */
tables.Table = function(tableSelector, opts) {
    this.tableSelector_ = tableSelector;
    this.idField_ = opts.id;
    this.options_ = opts.gridOptions || {};
    this.linkyConfig_ = opts.linkyConfig || {
        mentions: false,
        hashtags: false,
        urls: true,
        linkTo: ""
    };

    var data = opts.data;
    var columns = opts.columns ? opts.columns : tables.createColumns([], data);

    if(!this.idField_) {
        tables.Table.appendGeneratedId_(data);
        this.idField_ = tables.Table.AUTOGENERATED_ID_FIELD_NAME_;
    }

    this.dataView_ = this.createDataView_(data);
    this.columns_ = tables.Table.createSlickgridColumns_(columns);
    this.sortInfo_ = {};
    this.deletedColumns_ = {};
};

tables.Table.AUTOGENERATED_ID_FIELD_NAME_ = '__autogenerated_id';

/**
 * Creates an array of column definition objects containing the column names and widths by iterating through the data
 * and saving unique column names and the longest text within those columns.
 * @param {Array} data The data to show in the table
 * @param {Array} ignoreFields The subset of fields to ignore in the table (optional)
 * @param {Array} headerElements An array of Strings containing HTML for elements that should be added to the headers
 * to determine their width (optional)
 * @return {Array} The objects containing column names and widths
 * @method createColumns
 * @private
 */
tables.createColumns = function(knownColumnNames, data, ignoreColumnNames, headerElements) {
    var columns = [];
    // Store each column name with its index and longest text contained within the column (including its name).
    var columnNameToInfo = {};

    var addColumnName = function(columnName) {
        if(ignoreColumnNames && ignoreColumnNames.indexOf(columnName) >= 0) {
            return;
        }
        columns.push({
            name: columnName
        });
        columnNameToInfo[columnName] = {
            index: columns.length - 1,
            text: columnName
        };
    };

    knownColumnNames.forEach(function(knownColumnName) {
        addColumnName(knownColumnName);
    });

    data.forEach(function(row) {
        Object.keys(row).forEach(function(dataColumnName) {
            if(row[dataColumnName]) {
                if(columnNameToInfo[dataColumnName]) {
                    // This is not technically correct since we're using a variable-width font but it's faster than calculating the width of the text by inserting it into a DOM element using jQuery.
                    if(columnNameToInfo[dataColumnName].text.length < row[dataColumnName].length) {
                        columnNameToInfo[dataColumnName].text = row[dataColumnName];
                    }
                } else {
                    addColumnName(dataColumnName);
                }
            }
        });
    });

    // Use a hidden jQuery element with the same style as a SlickGrid header to calculate the column width.
    var element = $("<div/>")
        .attr("class", "ui-widget ui-state-default slick-header-column")
        .css({
            "white-space": "nowrap",
            visibility: "hidden"
        })
        .appendTo("body");

    // Include elements contained within SlickGrid headers to ensure our width calculations will fit the header text.
    var sortElement = $("<span/>")
        .attr("class", "slick-sort-indicator slick-sort-indicator-desc");
    var resizeElement = $("<div/>")
        .attr("class", "slick-resizable-handle");

    // Create the SlickGrid column definitions.
    Object.keys(columnNameToInfo).forEach(function(columnName) {
        element.html(columnNameToInfo[columnName].text);
        if(columnName === columnNameToInfo[columnName].text) {
            element.append(sortElement).append(resizeElement);
            if(headerElements) {
                for(var m = 0; m < headerElements.length; ++m) {
                    element.append($(headerElements[m]));
                }
            }
        }
        // Use a maximum width of 800 pixels for the columns (unless the user chooses to make the column wider).
        // Add a few extra pixels to ensure the header has space to show its text and all other elements.
        columns[columnNameToInfo[columnName].index].width = Math.min(element.outerWidth() + 5, 800);
    });

    element.remove();

    return columns;
};

/**
 * Adds a CSS class to the given column definitions so the cells in those columns will be linkified.
 * @param {Array} The array of column definition objects.
 * @return {Array} The amended array.
 */
tables.addLinkabilityToColumns = function(columns) {
    for(var i = 0; i < columns.length; ++i) {
        if(columns[i].cssClass) {
            columns[i].cssClass += " " + tables.LINKABLE;
        } else {
            columns[i].cssClass = tables.LINKABLE;
        }
    }
    return columns;
};

/**
 * Creates the sort comparator to sort the data in the table
 * @param {String} field The field being sorted
 * @param {Boolean} sortAsc Whether to sort ascending
 * @return {Function} A function to perform the sort comparison
 * @method sortComparator_
 * @private
 */
tables.Table.sortComparator_ = function(field, sortAsc) {
    return function(a, b) {
        var result = 0;
        if((a[field] && (b[field] === undefined)) || a[field] > b[field]) {
            result = 1;
        } else if((b[field] && (a[field] === undefined)) || a[field] < b[field]) {
            result = -1;
        }
        return sortAsc ? result : -result;
    };
};

tables.Table.appendGeneratedId_ = function(data) {
    var id = 0;
    data.forEach(function(el) {
        el[tables.Table.AUTOGENERATED_ID_FIELD_NAME_] = id++;
    });
};

/**
 * Creates a slickgrid data view from the raw data
 * @param {Array} data Array of data to be displayed
 * @method createDataView_
 * @private
 */
tables.Table.prototype.createDataView_ = function(data) {
    var dataView = new Slick.Data.DataView();
    dataView.setItems(data, this.idField_);

    return dataView;
};

/**
 * Converts a list of column names to the format required by the slickgrids library
 * used to create the tables
 * @param {Array} columnNames A list of column names
 * @method createSlickgridColumns_
 * @private
 */
tables.Table.createSlickgridColumns_ = function(columnNames) {
    var slickgridColumns = [];
    columnNames.forEach(function(column) {
        var slickgridColumn = tables.Table.createSlickgridColumn_(column);
        slickgridColumns.push(slickgridColumn);
    });
    return slickgridColumns;
};

tables.Table.createSlickgridColumn_ = function(column) {
    var slickgridColumn = {};
    slickgridColumn.id = column.name;
    slickgridColumn.name = column.name;
    slickgridColumn.field = column.field ? column.field : column.name;
    slickgridColumn.focusable = true;
    slickgridColumn.sortable = true;
    slickgridColumn.formatter = tables.Table.defaultCellFormatter_;
    if(column.width) {
        slickgridColumn.width = column.width;
    }
    if(column.cssClass) {
        slickgridColumn.cssClass = column.cssClass;
    }
    if(column.ignoreClicks) {
        // This column and its cells will not become "active" on click.
        slickgridColumn.focusable = false;
    }
    return slickgridColumn;
};

tables.Table.defaultCellFormatter_ = function(row, cell, value, columnDef, dataContext) {
    // most of this taken from slick.grid.js defaultFormatter but modified to support nested objects
    if(null === value || undefined === value) {
        return "";
    }

    // check if nested object. if it is, append each of the key/value pairs
    var keys = tables.Table.getObjectKeys_(value);

    if(0 === keys.length) {
        return value;
    }

    return tables.Table.createKeyValuePairsString_(value, keys, row, cell, columnDef, dataContext);
};

tables.Table.getObjectKeys_ = function(object) {
    var keys = [];
    if('object' === typeof object) {
        keys = Object.keys(object);
    }
    return keys;
};

tables.Table.createKeyValuePairsString_ = function(object, keys, row, cell, columnDef, dataContext) {
    var keyValueStrings = [];
    keys.forEach(function(key) {
        keyValueStrings.push(key + ': ' + tables.Table.defaultCellFormatter_(row, cell, object[key], columnDef, dataContext));
    });
    return keyValueStrings.join(', ');
};

tables.Table.prototype.addLinks_ = function() {
    var me = this;
    // Add initial links and update links on viewport changes.
    me.runLinky_(me.tableSelector_);
    me.table_.onViewportChanged.subscribe(function() {
        me.runLinky_(me.tableSelector_);
    });
};

tables.Table.prototype.runLinky_ = function(cellSelector) {
    $(cellSelector).find(".slick-cell." + tables.LINKABLE).linky(this.linkyConfig_);
    // Remove the linkable class to ensure linky isn't run on this cell again.
    $(cellSelector).find(".slick-cell." + tables.LINKABLE).removeClass(tables.LINKABLE);
};

/**
 * Draws the table in the selector specified in the constructor
 * @method draw
 * @return {tables.Table} This table
 */
tables.Table.prototype.draw = function() {
    this.table_ = new Slick.Grid(this.tableSelector_, this.dataView_, this.columns_, this.options_);
    this.addSortSupport_();
    this.table_.registerPlugin(new Slick.AutoTooltips({
        enableForHeaderCells: true
    }));
    this.addLinks_();

    // Setup some event loggers.
    this.table_.onColumnsResized.subscribe(function() {
        XDATA.userALE.log({
            activity: "alter",
            action: "drag",
            elementId: "datagrid",
            elementType: "datagrid",
            elementGroup: "table_group",
            source: "user",
            tags: ["resize-column"]
        });
    });

    // Setup some event loggers.
    this.table_.onColumnsReordered.subscribe(function() {
        XDATA.userALE.log({
            activity: "alter",
            action: "drag",
            elementId: "datagrid",
            elementType: "datagrid",
            elementGroup: "table_group",
            source: "user",
            tags: ["reorder-column"]
        });
    });

    // Setup some event loggers.
    this.table_.onScroll.subscribe(function() {
        XDATA.userALE.log({
            activity: "alter",
            action: "scroll",
            elementId: "datagrid",
            elementType: "datagrid",
            elementGroup: "table_group",
            source: "user",
            tags: ["scroll-datagrid"]
        });
    });

    // Setup some event loggers.
    this.table_.onSort.subscribe(function(e, args) {
        XDATA.userALE.log({
            activity: "alter",
            action: "click",
            elementId: "datagrid",
            elementType: "datagrid",
            elementGroup: "table_group",
            source: "user",
            tags: ["sort-column", args.sortCol.field]
        });
    });

    return this;
};

tables.Table.prototype.refreshLayout = function() {
    // the table may not be drawn yet when this is called (this method can be used as a hook to resize a table, but
    // if the browser is resized before the table is drawn, the table will be undefined here)
    if(this.table_) {
        this.table_.resizeCanvas();
    }
};

tables.Table.prototype.registerSelectionListener = function(callback) {
    if(!callback || 'function' !== typeof callback) {
        return;
    }
    var rowModel = new Slick.RowSelectionModel();
    this.table_.setSelectionModel(rowModel);

    var me = this;
    rowModel.onSelectedRangesChanged.subscribe(function() {
        if(me.idField_ === tables.Table.AUTOGENERATED_ID_FIELD_NAME_) {
            return;
        }

        var selectedRowData = [];
        _.each(me.table_.getSelectedRows(), function(rowIndex) {
            selectedRowData.push(me.table_.getDataItem(rowIndex));
        });
        callback(me.idField_, selectedRowData);
    });
    return this;
};

tables.Table.prototype.sortColumn = function(name, field, sortAsc) {
    var data = this.dataView_.getItems();
    // Use a stable sorting algorithm as opposed to the built-in
    // dataView sort which may not be stable.
    data = data.mergeSort(tables.Table.sortComparator_(field, sortAsc));
    this.dataView_.setItems(data);
    this.table_.invalidateAllRows();
    this.table_.render();
    this.sortInfo_ = {
        name: name,
        field: field,
        sortAsc: sortAsc
    };
};

tables.Table.prototype.addSortSupport_ = function() {
    var me = this;
    this.table_.onSort.subscribe(function(event, args) {
        me.sortColumn(args.sortCol.name, args.sortCol.field, args.sortAsc);
    });
};

/**
 * Adds an onSort listener to the SlickGrid table using the given callback
 * @param {Function} The callback function
 */
tables.Table.prototype.registerSortListener = function(callback) {
    this.table_.onSort.subscribe(function(event, args) {
        callback(event, args);
    });
};

tables.Table.prototype.sortColumnAndChangeGlyph = function(sortInfo) {
    // Sort the data in the column.
    this.sortColumn(sortInfo.name, sortInfo.field, sortInfo.sortAsc);
    // Change the sort glyph in the column header.
    this.table_.setSortColumn(sortInfo.name, sortInfo.sortAsc);
};

/**
 * Adds an onClick listener to the SlickGrid table using the given callback with
 * arguments for the array of column definitions and the selected row object.
 * @param {Function} The callback function
 */
tables.Table.prototype.addOnClickListener = function(callback) {
    var me = this;
    this.table_.onClick.subscribe(function(event, args) {
        if(me.columns_[args.cell].focusable) {
            callback(me.table_.getColumns(), me.dataView_.getItem(args.row));
        }
    });
};

/**
 * Adds an onColumnsReordered listener to the SlickGrid table using the given callback.
 * @param {Function} callback
 */
tables.Table.prototype.addOnColumnsReorderedListener = function(callback) {
    var me = this;
    this.table_.onColumnsReordered.subscribe(function(event, args) {
        me.columns_ = me.table_.getColumns();
        callback();
    });
};

/**
 * Deselects the active elements in the table.
 */
tables.Table.prototype.deselect = function() {
    this.table_.resetActiveCell();
};

/**
 * Sets the active cell in this table to the column and row containing the given
 * field and value, if it exists.
 * @param {String} The field matching a column name
 * @param {String} The value matching a cell's text
 */
tables.Table.prototype.setActiveCellIfMatchExists = function(field, value) {
    for(var i = 0; i < this.columns_.length; ++i) {
        if(this.columns_[i].field === field) {
            for(var j = 0; j < this.table_.getDataLength(); ++j) {
                var cell = this.table_.getCellNode(j, i);
                if(cell && cell.innerHTML === value) {
                    this.table_.setActiveCell(j, i);
                }
            }
        }
    }
};

/**
 * Deletes the column with the given name from this table.
 * @param {String} The name of the column
 * @return {Boolean} If the column was deleted and the table was redrawn
 */
tables.Table.prototype.deleteColumn = function(name) {
    for(var i = 0; i < this.columns_.length; ++i) {
        if(this.columns_[i].name === name) {
            break;
        }
    }

    if(i < this.columns_.length) {
        this.deletedColumns_[name] = (this.columns_.splice(i, 1))[0];
        this.table_.setColumns(this.columns_);
        return true;
    }

    return false;
};

/**
 * Adds the column with the given name to this table if it does not already contain a column with that name.  If the
 * user has previously deleted a column with that name, we use the column definition from the deleted column.
 * @param {String} The name of the column
 * @return {Boolean} If the column was added and the table was redrawn
 */
tables.Table.prototype.addColumn = function(name) {
    // Don't add the column if it already exists in the table.
    for(var i = 0; i < this.columns_.length; ++i) {
        if(this.columns_[i].name === name) {
            return false;
        }
    }

    // If the user has previously deleted this column, use its existing column definition.
    if(this.deletedColumns_[name]) {
        this.columns_.push(this.deletedColumns_[name]);
    } else {
        var slickgridColumn = tables.Table.createSlickgridColumn_({
            name: name
        });
        this.columns_.push(slickgridColumn);
    }

    this.table_.setColumns(this.columns_);
    this.runLinky_();
    return true;
};

/**
 * Retrieves the columns shown in the table in their current order
 * @return {Array} All the columns shown in the table
 */
tables.Table.prototype.getColumns = function() {
    return this.columns_;
};