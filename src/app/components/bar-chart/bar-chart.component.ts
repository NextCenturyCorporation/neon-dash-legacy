/*
 * Copyright 2017 Next Century Corporation
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
import {
    Component,
    OnInit,
    OnDestroy,
    ViewEncapsulation,
    ChangeDetectionStrategy,
    Injector, ViewChild,
    ChangeDetectorRef
} from '@angular/core';
import { ActiveGridService } from '../../services/active-grid.service';
import { ConnectionService } from '../../services/connection.service';
import { DatasetService } from '../../services/dataset.service';
import { FilterService } from '../../services/filter.service';
import { ExportService } from '../../services/export.service';
import { ThemesService } from '../../services/themes.service';
import { FieldMetaData } from '../../dataset';
import { neonMappings, neonVariables } from '../../neon-namespaces';
import * as neon from 'neon-framework';
import { BaseNeonComponent } from '../base-neon-component/base-neon.component';
import { ChartComponent } from '../chart/chart.component';
import { Chart } from 'chart.js';
import { VisualizationService } from '../../services/visualization.service';
import { Color, ColorSchemeService } from '../../services/color-scheme.service';

/**
 * Data used to draw the bar chart
 */
export class BarData {
    // The X-Axis labels
    labels: string[] = [];
    // The data to graph
    datasets: BarDataSet[] = [];
}

/**
 * One set of bars to draw
 */
export class BarDataSet {
    // The name of the data set
    label: string;
    // The data
    data: number[] = [];
    // The colors of the bars.
    backgroundColor: string[] = [];
    // The color of the data set
    color: Color;

    constructor(length?: number, color?: Color) {
        if (length) {
            for (let i = 0; i < length; i++) {
                this.data[i] = 0;
            }
        }
        this.color = color;
    }

    /**
     * Set all the background colors to the default color of this set
     */
    setAllActive() {
        for (let i = 0; i < this.data.length; i++) {
            this.backgroundColor[i] = this.color.toRgb();
        }
    }

    /**
     * Set all the background colors to the default color of this set
     */
    setAllInactive() {
        for (let i = 0; i < this.data.length; i++) {
            this.backgroundColor[i] = this.color.getInactiveRgba();
        }
    }

    /**
     * Set the background color of a single bar to the active color
     * @param {number} position
     */
    setActiveColor(position: number) {
        this.backgroundColor[position] = this.color.toRgb();
    }

    /**
     * set the background color of a single bar to the inactive color
     * @param {number} position
     */
    setInactiveColor(position: number) {
        this.backgroundColor[position] = this.color.getInactiveRgba();
    }
}

@Component({
    selector: 'app-bar-chart',
    templateUrl: './bar-chart.component.html',
    styleUrls: ['./bar-chart.component.scss'],
    encapsulation: ViewEncapsulation.Emulated,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BarChartComponent extends BaseNeonComponent implements OnInit,
    OnDestroy {
    @ViewChild('myChart') chartModule: ChartComponent;

    private filters: {
        id: string,
        key: string,
        value: string,
        prettyKey: string
    }[];

    private optionsFromConfig: {
        title: string,
        database: string,
        table: string,
        dataField: string,
        aggregation: string,
        aggregationField: string,
        unsharedFilterField: any,
        unsharedFilterValue: string,
        colorField: string,
        limit: number,
        chartType: string // bar or horizontalBar
    };

    public active: {
        dataField: FieldMetaData,
        colorField: FieldMetaData,
        aggregationField: FieldMetaData,
        aggregationFieldHidden: boolean,
        andFilters: boolean,
        limit: number,
        newLimit: number,
        page: number,
        lastPage: boolean,
        filterable: boolean,
        layers: any[],
        data: any[],
        aggregation: string,
        chartType: string,
        maxNum: number,
        minScale: string,
        maxScale: string,
        scaleManually: boolean,
        bars: string[],
        seenBars: string[]
    };

    //this is what gets loaded into the Chart object; it should always(?) be identical to chartModule.chart.config
    public chartInfo: {
        data: {
            labels: string[],
            datasets: BarDataSet[]
        },
        type: string,
        options: any
    };

    // Used to change the colors between active/inactive in the legend
    public selectedLabels: string[] = [];
    public colorFieldNames: string[] = [];
    private defaultActiveColor;

    constructor(activeGridService: ActiveGridService, connectionService: ConnectionService, datasetService: DatasetService,
        filterService: FilterService, exportService: ExportService, injector: Injector, themesService: ThemesService,
        ref: ChangeDetectorRef, visualizationService: VisualizationService, private colorSchemeService: ColorSchemeService) {
        super(activeGridService, connectionService, datasetService, filterService,
            exportService, injector, themesService, ref, visualizationService);

        this.optionsFromConfig = {
            title: this.injector.get('title', null),
            database: this.injector.get('database', null),
            table: this.injector.get('table', null),
            dataField: this.injector.get('dataField', null),
            aggregation: this.injector.get('aggregation', null),
            aggregationField: this.injector.get('aggregationField', null),
            colorField: this.injector.get('colorField', null),
            limit: this.injector.get('limit', 10),
            unsharedFilterField: {},
            unsharedFilterValue: '',
            chartType: this.injector.get('chartType', 'bar')
        };
        this.filters = [];
        this.active = {
            dataField: new FieldMetaData(),
            colorField: new FieldMetaData(),
            aggregationField: new FieldMetaData(),
            aggregationFieldHidden: true,
            andFilters: true,
            limit: this.optionsFromConfig.limit,
            newLimit: this.optionsFromConfig.limit,
            page: 1,
            lastPage: true,
            filterable: true,
            layers: [],
            data: [],
            aggregation: 'count',
            chartType: this.optionsFromConfig.chartType || 'horizontalBar',
            minScale: undefined,
            maxScale: undefined,
            maxNum: 0,
            scaleManually: false,
            bars: [],
            seenBars: []
        };

        this.onClick = this.onClick.bind(this);

        this.chartInfo = {
            type: this.active.chartType,
            data: {
                labels: [],
                datasets: [new BarDataSet(0, this.defaultActiveColor)]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'touchend'],
                onClick: this.onClick,
                animation: {
                    duration: 0 // general animation time
                },
                hover: {
                    mode: 'point',
                    onHover: null

                },
                scales: {
                    xAxes: [{
                        stacked: true,
                        ticks: {
                            // max: 100,
                            beginAtZero: true,
                            callback: this.formatNumber
                        }
                    }],
                    yAxes: [{
                        stacked: true,
                        ticks: {
                            // max: 100,
                            beginAtZero: true,
                            callback: this.formatNumber
                        }
                    }]
                },
                legend: {
                    display: false
                },
                tooltips: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {}
                }
            }
        };

        let tooltipTitleFunc = (tooltips, data) => {
            return this.active.dataField.prettyName + ': ' + tooltips[0].xLabel;
        };
        let tooltipDataFunc = (tooltipItem, data) => {
            let tooltip = data.datasets[tooltipItem.datasetIndex];
            let value = tooltip.data[tooltipItem.index];
            // Returning null removes the row from the tooltip
            return value === 0 ? null : tooltip.label + ': ' + this.formatNumber(value);
        };
        this.chartInfo.options.tooltips.callbacks.title = tooltipTitleFunc.bind(this);
        this.chartInfo.options.tooltips.callbacks.label = tooltipDataFunc.bind(this);
        this.queryTitle = this.optionsFromConfig.title || 'Bar Chart';

    }

    /**
     * Initializes any bar chart sub-components needed.
     *
     * @override
     */
    subNgOnInit() {
        // Do nothing.
    }

    /**
     * Handles any bar chart component post-initialization behavior needed.
     *
     * @override
     */
    postInit() {
        this.executeQueryChain();

        //This does nothing, but it is here to hide a bug: without it, if you open a barchart, and switch the type once,
        //then the chart will not resize with the widget. Resizing works again after any subsequent type-switch. So if we call
        //this at the outset of the program, the chart should always resize correctly. I would think we'd need to call this
        //method twice, but for some reason it appears it only needs one call to work.
        this.handleChangeChartType();

        this.defaultActiveColor = this.getPrimaryThemeColor();
    }

    /**
     * Deletes any bar chart sub-components needed.
     *
     * @override
     */
    subNgOnDestroy() {
        this.chartModule.chart.destroy();
    }

    /**
     * Sets the properties in the given bindings for the bar chart.
     *
     * @arg {any} bindings
     * @override
     */
    subGetBindings(bindings: any) {
        bindings.dataField = this.active.dataField.columnName;
        bindings.aggregation = this.active.aggregation;
        bindings.aggregationField = this.active.aggregationField.columnName;
        bindings.limit = this.active.limit;
    }

    /**
     * Returns the bar chart export fields.
     *
     * @return {array}
     * @override
     */
    getExportFields(): any[] {
        let valuePrettyName = this.active.aggregation +
            (this.active.aggregationFieldHidden ? '' : '-' + this.active.aggregationField.prettyName);
        valuePrettyName = valuePrettyName.charAt(0).toUpperCase() + valuePrettyName.slice(1);
        return [{
            columnName: this.active.dataField.columnName,
            prettyName: this.active.dataField.prettyName
        }, {
            columnName: 'value',
            prettyName: valuePrettyName
        }];
    }

    /**
     * Returns the option for the given property from the bar chart config.
     *
     * @arg {string} option
     * @return {any}
     * @override
     */
    getOptionFromConfig(option: string): any {
        return this.optionsFromConfig[option];
    }

    /**
     * Adds, replaces, or removes filters using the bar chart data in the given elements.
     *
     * @arg {any} _event
     * @arg {array} elements
     */
    onClick(_event: any, elements: any[]) {
        if (elements.length) {
            let value = elements[0]._model.label;
            let key = this.active.dataField.columnName;
            let prettyKey = this.active.dataField.prettyName;
            let filter = {
                id: undefined,
                key: key,
                value: value,
                prettyKey: prettyKey
            };
            if (_event.ctrlKey || _event.metaKey) { // If Ctrl (or Command on Mac) is pressed...
                if (this.filterIsUnique(filter)) {
                    this.addLocalFilter(filter);
                    let whereClause = neon.query.where(filter.key, '=', filter.value);
                    this.addNeonFilter(true, filter, whereClause);
                } else {
                    for (let f of this.filters) {
                        if (f.key === filter.key && f.value === filter.value) {
                            this.removeLocalFilterFromLocalAndNeon(f, true, true);
                            break;
                        }
                    }
                }
            } else { // If Ctrl isn't pressed...
                if (this.filters.length === 0) {
                    this.addLocalFilter(filter);
                    this.addNeonFilter(true, filter);
                } else if (this.filters.length === 1 && this.filterIsUnique(filter)) {
                    filter.id = this.filters[0].id;
                    this.filters[0] = filter;
                    this.replaceNeonFilter(true, filter);
                } else {
                    this.removeAllFilters(false, false);
                    this.addLocalFilter(filter);
                    this.addNeonFilter(true, filter);
                }
            }

            this.refreshVisualization();
        }
    }

    /**
     * Updates the fields for the bar chart.
     *
     * @override
     */
    onUpdateFields() {
        if (this.optionsFromConfig.aggregation) {
            this.active.aggregation = this.optionsFromConfig.aggregation;
        }
        this.active.aggregationField = this.findFieldObject('aggregationField', neonMappings.TAGS);
        this.active.dataField = this.findFieldObject('dataField', neonMappings.TAGS);
        this.active.colorField = this.findFieldObject('colorField', neonMappings.TAGS);
    }

    /**
     * Adds the given filter object to the bar chart's list of filter objects.
     *
     * @arg {object} filter
     */
    addLocalFilter(filter: any) {
        if (this.filterIsUnique(filter)) {
            this.filters = [].concat(this.filters).concat([filter]);
        }
    }

    /**
     * Returns true if the given filter object does not match any filter in the list of bar chart component filter objects.
     *
     * @arg {any} filter
     * @return {boolean}
     */
    filterIsUnique(filter: any): boolean {
        for (let f of this.filters) {
            if (f.value === filter.value && f.key === filter.key) {
                return false;
            }
        }
        return true;
    }

    /**
     * Creates and returns the neon filter clause object using the given database, table, and data field names.
     *
     * @arg {string} database
     * @arg {string} table
     * @arg {string} fieldName
     * @return {object}
     * @override
     */
    createNeonFilterClauseEquals(database: string, table: string, fieldName: string): object {
        let filterClauses = this.filters.map(function(filter) {
            return neon.query.where(fieldName, '=', filter.value);
        });
        if (filterClauses.length === 1) {
            return filterClauses[0];
        }
        if (this.active.andFilters) {
            return neon.query.and.apply(neon.query, filterClauses);
        }
        return neon.query.or.apply(neon.query, filterClauses);
    }

    /**
     * Returns the list of filter fields for the bar chart.
     *
     * @return {array}
     * @override
     */
    getNeonFilterFields(): string[] {
        return [this.active.dataField.columnName];
    }

    /**
     * Returns the bar chart's visualization name.
     *
     * @return {string}
     * @override
     */
    getVisualizationName(): string {
        return 'Bar Chart';
    }

    /**
     * Returns the bar chart filter text using the given filter object.
     *
     * @arg {any} filter
     * @return {string}
     * @override
     */
    getFilterText(filter: any): string {
        return filter.value;
    }

    /**
     * Updates the bar colors and legend and refreshes the bar chart.
     */
    refreshVisualization() {
        let selectedLabels: string[] = [];
        if (this.filters.length >= 1) {
            let activeFilterValues = this.filters.map((el) => el.value);
            let activeLabelIndexes = this.chartInfo.data.labels.map(function(label, index) {
                return (activeFilterValues.indexOf(label) >= 0 ? index : -1);
            }).filter(function(index) {
                return index >= 0;
            });

            for (let dataset of this.chartInfo.data.datasets) {
                dataset.setAllInactive();
                for (let index = activeLabelIndexes.length - 1; index >= 0; index--) {
                    dataset.setActiveColor(activeLabelIndexes[index]);
                }
                for (let index = activeLabelIndexes.length - 1; index >= 0; index--) {
                    if (dataset.data[activeLabelIndexes[index]] > 0) {
                        selectedLabels.push(dataset.label);
                        continue;
                    }
                }
            }
        } else {
            // Set all bars active
            for (let dataset of this.active.data) {
                dataset.setAllActive();
            }
        }

        this.selectedLabels = selectedLabels;
        this.chartModule.chart.update();
    }

    /**
     * Returns whether the fields for the bar chart are valid.
     *
     * @return {boolean}
     * @override
     */
    isValidQuery(): boolean {
        let valid = true;
        valid = (this.meta.database && this.meta.database.name && valid);
        valid = (this.meta.table && this.meta.table.name && valid);
        valid = (this.active.dataField && this.active.dataField.columnName && valid);
        valid = (this.active.aggregation && this.active.aggregation && valid); // what?
        if (this.active.aggregation !== 'count') {
            valid = (this.active.aggregationField !== undefined && this.active.aggregationField.columnName !== '' && valid);
            //This would mean though that if the data is just a number being represented by a string, it would simply fail.
            //As opposed to first trying to parse it.
            //This also makes it silently fail, without letting the user know that it failed or why. One could easily change the
            //aggregation type, not notice that the chart didn't change, and
            valid = ((this.active.aggregationField.type !== 'string') && valid);

        }
        return valid;
    }

    /**
     * Creates and returns the query for the bar chart.
     *
     * @return {neon.query.Query}
     * @override
     */
    createQuery(): neon.query.Query {
        let databaseName = this.meta.database.name;
        let tableName = this.meta.table.name;
        let query = new neon.query.Query().selectFrom(databaseName, tableName);
        let whereClauses: neon.query.WherePredicate[] = [];
        whereClauses.push(neon.query.where(this.active.dataField.columnName, '!=', null));
        let yAxisField = this.active.aggregationField.columnName;
        let groupBy: any[] = [this.active.dataField.columnName];

        if (this.active.colorField && this.active.colorField.columnName !== '') {
            whereClauses.push(neon.query.where(this.active.colorField.columnName, '!=', null));
            groupBy.push(this.active.colorField.columnName);
        }

        if (this.hasUnsharedFilter()) {
            // Add the unshared filter
            whereClauses.push(
                neon.query.where(this.meta.unsharedFilterField.columnName, '=',
                    this.meta.unsharedFilterValue));
        }

        query.where(neon.query.and.apply(query, whereClauses)).groupBy(groupBy);

        switch (this.active.aggregation) {
            case 'average':
                query.aggregate(neonVariables.AVG, yAxisField, 'value');
                break;
            case 'min':
                query.aggregate(neonVariables.MIN, yAxisField, 'value');
                break;
            case 'max':
                query.aggregate(neonVariables.MAX, yAxisField, 'value');
                break;
            case 'sum':
                query.aggregate(neonVariables.SUM, yAxisField, 'value');
                break;
            case 'count':
            default:
                query.aggregate(neonVariables.COUNT, '*', 'value');
        }

        return query.sortBy('value', neonVariables.DESCENDING);
    }

    /**
     * Returns the list of filters for the bar chart to ignore.
     *
     * @return {any}
     * @override
     */
    getFiltersToIgnore() {
        let database = this.meta.database.name;
        let table = this.meta.table.name;
        let fields = this.getNeonFilterFields();
        // get relevant neon filters and check for filters that should be ignored and add that to query
        let neonFilters = this.filterService.getFiltersForFields(database, table, fields);
        if (neonFilters.length > 0) {
            let ignoredFilterIds = [];
            for (let filter of neonFilters) {
                ignoredFilterIds.push(filter.id);
            }
            return ignoredFilterIds;
        }
        return null;
    }

    /**
     * Handles the query results for the bar chart and draws the new bar chart.
     */
    onQuerySuccess(response: any) {
        this.active.bars = [];

        // Use our seen values list to create dummy values for every category not returned this time.
        let seenData = [];
        for (let barLabel of this.active.seenBars) {
            let exists = false;
            for (let item of response.data) {
                if (item[this.active.dataField.columnName] === barLabel) {
                    exists = true;
                }
            }
            if (!exists) {
                let item = {
                    value: 0
                };
                item[this.active.dataField.columnName] = barLabel;
                seenData.push(item);
            }
        }
        let data = response.data.concat(seenData);

        // Update the bars from the data.
        for (let item of data) {
            let barLabel: string = item[this.active.dataField.columnName];

            if (!barLabel) {
                continue;
            }

            // Add any labels that we haven't seen before to our "seen values" list so we have them for next time.
            if (this.active.seenBars.indexOf(barLabel) < 0) {
                this.active.seenBars.push(barLabel);
            }

            if (this.active.bars.indexOf(barLabel) < 0) {
                this.active.bars.push(barLabel);
            }
        }

        let groupsToDatasets = new Map<string, BarDataSet>();
        let colorFieldExists = (this.active.colorField && this.active.colorField.columnName !== '');

        // Update the segments and counts from the bars and the data.
        for (let item of data) {
            let barLabel: string = item[this.active.dataField.columnName];

            if (!barLabel) {
                continue;
            }

            // Each barLabel will create a new bar.  Each barSegment will create a new piece of a whole bar.
            let barSegment = colorFieldExists ? (item[this.active.colorField.columnName] || '') : '';

            let barDataset = groupsToDatasets.get(barSegment);

            if (!barDataset) {
                barDataset = new BarDataSet(this.active.bars.length);
                barDataset.label = barSegment;
                barDataset.color = colorFieldExists ? this.colorSchemeService.getColorFor(this.active.colorField.columnName, barSegment) :
                    this.defaultActiveColor;
                barDataset.backgroundColor = this.active.bars.map(function(bar) {
                    return barDataset.color.toRgb();
                });
                groupsToDatasets.set(barSegment, barDataset);
            }

            barDataset.data[this.active.bars.indexOf(barLabel)] = item.value;
        }

        this.active.data = Array.from(groupsToDatasets.values());
        this.active.page = 1;
        this.active.lastPage = (this.active.bars.length <= this.active.limit);
        this.updateBarChart(0, this.active.limit);
    }

    /**
     * Updates the bar chartInfo with the active.bars and active.data using the given bar index and bar limit.
     *
     * @arg {number} barIndex
     * @arg {number} barLimit
     */
    updateBarChart(barIndex: number, barLimit: number) {
        let barChartData = new BarData();
        barChartData.labels = this.active.bars.slice(barIndex, barIndex + barLimit);
        barChartData.datasets = this.active.data.map(function(wholeDataset) {
            let limitedDataset = new BarDataSet(barChartData.labels.length);
            limitedDataset.label = wholeDataset.label;
            limitedDataset.color = wholeDataset.color;
            limitedDataset.backgroundColor = wholeDataset.backgroundColor.slice(barIndex, barIndex + barLimit);
            limitedDataset.data = wholeDataset.data.slice(barIndex, barIndex + barLimit);
            return limitedDataset;
        });

        // Set this to force the legend to update
        this.colorFieldNames = [this.active.colorField.columnName];

        this.chartInfo.data = barChartData;
        this.refreshVisualization();
    }

    /**
     * If the given item is a number, returns it as a rounded string; otherwise, returns the given item.
     *
     * @arg {any} item
     * @return {string}
     */
    formatNumber(item: any): string {
        if (super.isNumber(item)) {
            //round to at most 3 decimal places, so as to not display tiny floating-point errors
            return String(Math.round((parseFloat(item) + 0.00001) * 1000) / 1000);
        }
        // can't be converted to a number, so just use it as-is.
        return item;
    }

    /**
     * Updates the aggregation type and reruns the bar chart query.
     */
    handleChangeAggregation() {
        this.active.aggregationFieldHidden = (this.active.aggregation === 'count');
        this.executeQueryChain();
    }

    /**
     * Updates the bar chart type and redraws the bar chart.
     */
    handleChangeChartType() {
        if (!this.chartModule.chart) {
            return;
        }

        let barData = this.chartInfo.data;
        let barOptions = this.chartInfo.options;

        let ctx = this.chartModule.chart.ctx;

        this.chartModule.chart.destroy();

        let clonedChart = new Chart(ctx, {
            type: this.active.chartType,
            data: barData,
            options: barOptions
        });

        this.chartInfo = {
            type: this.active.chartType,
            data: barData,
            options: barOptions
        };
        this.chartModule.chart = clonedChart;

        this.handleChangeScale();

        this.refreshVisualization();

    }

    setGraphMaximum(newMax) {
        if (this.chartModule.chart.config.type === 'bar') {
            this.chartModule.chart.config.options.scales.yAxes[0].ticks.max = newMax;
        } else if ('horizontalBar') {
            this.chartModule.chart.config.options.scales.xAxes[0].ticks.max = newMax;
        } else {
            //what
        }
    }

    setGraphMinimum(newMin) {
        if (this.chartModule.chart.config.type === 'bar') {
            this.chartModule.chart.config.options.scales.yAxes[0].ticks.min = newMin;
        } else if ('horizontalBar') {
            this.chartModule.chart.config.options.scales.xAxes[0].ticks.min = newMin;
        } else {
            //what
        }
    }

    /**
     * Updates the graph scale and reruns the bar chart query.
     */
    handleChangeScale() {
        if (this.active.scaleManually) {
            if (this.active.maxScale === undefined
                || this.active.maxScale === ''
                || isNaN(Number(this.active.maxScale))) {
                this.setGraphMaximum(undefined); // not usable input, so default to automatic scaling
            } else {
                this.setGraphMaximum(Number(this.active.maxScale));
            }

            if (this.active.minScale === undefined
                || this.active.minScale === ''
                || isNaN(Number(this.active.minScale))) {
                this.setGraphMinimum(undefined); // not usable input, so default to automatic scaling
            } else {
                this.setGraphMinimum(Number(this.active.minScale));
            }
        } else {
            this.setGraphMaximum(undefined);
            this.setGraphMinimum(undefined);
        }

        this.logChangeAndStartQueryChain();
    }

    /**
     * Creates filters on init if needed.
     *
     * @override
     */
    setupFilters() {
        // Get neon filters
        // See if any neon filters are local filters and set/clear appropriately
        let database = this.meta.database.name;
        let table = this.meta.table.name;
        let fields = [this.active.dataField.columnName];
        let neonFilters = this.filterService.getFiltersForFields(database, table, fields);
        if (neonFilters && neonFilters.length > 0) {
            for (let filter of neonFilters) {
                let key = filter.filter.whereClause.lhs;
                let value = filter.filter.whereClause.rhs;
                let f = {
                    id: filter.id,
                    key: key,
                    value: value,
                    prettyKey: key
                };
                this.addLocalFilter(f);
            }
        } else {
            this.filters = [];
        }
    }

    /**
     * Updates the limit, resets the seen bars, and reruns the bar chart query.
     */
    handleChangeLimit() {
        if (super.isNumber(this.active.newLimit)) {
            this.active.limit = parseFloat('' + this.active.newLimit);
            this.active.seenBars = [];
            this.logChangeAndStartQueryChain();
        }
    }

    /**
     * Resets the seen bars and reruns the bar chart query.
     */
    handleChangeField() {
        this.active.seenBars = [];
        this.logChangeAndStartQueryChain();
    }

    /**
     * Reruns the bar chart query.
     */
    unsharedFilterChanged() {
        // Update the data
        this.executeQueryChain();
    }

    /**
     * Reruns the bar chart query.
     */
    unsharedFilterRemoved() {
        // Update the data
        this.executeQueryChain();
    }

    /**
     * Creates and returns the text for the settings button.
     *
     * @return {string}
     * @override
     */
    getButtonText(): string {
        if (!this.active.bars || !this.active.bars.length) {
            return 'No Data';
        }
        if (this.active.bars.length <= this.active.limit) {
            return 'Total ' + super.prettifyInteger(this.active.bars.length);
        }
        let begin = super.prettifyInteger((this.active.page - 1) * this.active.limit + 1);
        let end = super.prettifyInteger(Math.min(this.active.page * this.active.limit, this.active.bars.length));
        return (begin === end ? begin : (begin + ' - ' + end)) + ' of ' + super.prettifyInteger(this.active.bars.length);
    }

    /**
     * Returns the list of filter objects.
     *
     * @return {array}
     */
    getCloseableFilters() {
        return this.filters;
    }

    /**
     * Returns the bar chart filter tooltip title text using the given filter value.
     *
     * @arg {string} value
     * @return {string}
     */
    getFilterTitle(value: string) {
        return this.active.dataField.columnName + ' = ' + value;
    }

    /**
     * Returns the bar chart filter text using the given filter value.
     *
     * @arg {string} value
     * @return {string}
     */
    getFilterCloseText(value: string): string {
        return value;
    }

    /**
     * Returns the bar chart remove button tooltip title text using the given filter value.
     *
     * @arg {string} value
     * @return {string}
     */
    getRemoveFilterTooltip(value: string): string {
        return 'Delete Filter ' + this.getFilterTitle(value);
    }

    //Would love to refactor this but cannot because it's called in base neon.
    /**
     * Removes the given filter object from this bar chart component.
     *
     * @arg {any} filter
     */
    removeFilter(filter: any) {
        for (let index = this.filters.length - 1; index >= 0; index--) {
            if (this.filters[index].id === filter.id) {
                this.filters.splice(index, 1);
            }
        }
    }

    /**
     * Removes all filters from this bar chart component and neon, optionally requerying and/or refreshing.
     *
     * @arg {boolean=true} shouldRequery
     * @arg {boolean=true} shouldRefresh
     */
    removeAllFilters(shouldRequery: boolean = true, shouldRefresh: boolean = true) {
        for (let index = this.filters.length - 1; index >= 0; index--) {
            this.removeLocalFilterFromLocalAndNeon(this.filters[index], false, false);
        }
        // Do these once we're finished removing all filters, rather than after each one.
        if (shouldRequery) {
            this.executeQueryChain();
        }
        if (shouldRefresh) {
            this.refreshVisualization();
        }
    }

    /**
     * Increases the page and updates the bar chart data.
     */
    nextPage() {
        if (!this.active.lastPage) {
            this.active.page++;
            this.updatePageData();
        }
    }

    /**
     * Decreases the page and updates the bar chart data.
     */
    previousPage() {
        if (this.active.page !== 1) {
            this.active.page--;
            this.updatePageData();
        }
    }

    /**
     * Updates lastPage and the bar chart data using the page and limit.
     */
    updatePageData() {
        let offset = (this.active.page - 1) * this.active.limit;
        this.active.lastPage = (this.active.bars.length <= (offset + this.active.limit));
        this.updateBarChart(offset, this.active.limit);
    }
}
