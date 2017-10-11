import {
    Component,
    OnInit,
    OnDestroy,
    ViewEncapsulation,
    ChangeDetectionStrategy,
    Injector, ViewChild,
    ChangeDetectorRef
} from '@angular/core';
import {ConnectionService} from '../../services/connection.service';
import {DatasetService} from '../../services/dataset.service';
import {FilterService} from '../../services/filter.service';
import {ExportService} from '../../services/export.service';
import {ThemesService} from '../../services/themes.service';
import {FieldMetaData} from '../../dataset';
import {neonMappings} from '../../neon-namespaces';
import * as neon from 'neon-framework';
import {BaseNeonComponent} from '../base-neon-component/base-neon.component';
import {ChartComponent} from 'angular2-chartjs';
import {VisualizationService} from '../../services/visualization.service';
import {Color} from '../../services/color-scheme.service';
import {Bucketizer} from '../bucketizers/Bucketizer';
import {DateBucketizer} from '../bucketizers/DateBucketizer';
import {MonthBucketizer} from '../bucketizers/MonthBucketizer';
import {YearBucketizer} from '../bucketizers/YearBucketizer';

// Use the orange hover color
const HOVER_COLOR = new Color(218, 165, 32);

/**
 * Data structure used by Chartjs
 */
class TimelineItem {
    t: Date;
    y: number;
}

/**
 * One set of bars to draw
 */
class TimelineDataSet {
    // The name of the data set
    label: string;
    // The data
    data: TimelineItem[] = [];
    // The colors of the bars.
    backgroundColor: string[] = [];
    hoverBackgroundColor: string = HOVER_COLOR.toRgb();
    hoverBorderColor: string = HOVER_COLOR.toRgb();
    // The color of the data set
    color: Color;

    constructor(color?: Color) {
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
}

@Component({
    selector: 'app-timeline-chart',
    templateUrl: './timeline-chart.component.html',
    styleUrls: ['./timeline-chart.component.scss'],
    encapsulation: ViewEncapsulation.Emulated,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimelineChartComponent extends BaseNeonComponent implements OnInit,
    OnDestroy {
    @ViewChild('myChart') chartModule: ChartComponent;

    private filters: {
        key: string,
        startDate: Date,
        endDate: Date,
        local: boolean
    }[];

    private optionsFromConfig: {
        title: string,
        database: string,
        table: string,
        dateField: string,
        granularity: string,
    };

    public active: {
        dateField: FieldMetaData,
        granularity: string,
        logarithmic: boolean
        bucketizer: Bucketizer,
        extent: Date[],
        focusGranularityDifferent: boolean
    };

    public chart: {
        data: {
            datasets: TimelineDataSet[]
        },
        type: string,
        options: any
    };

    // Cache the data from the last query
    private queryData: {
        data: {
            value: number,
            date: Date
        }[],
        granularity: string
    };

    private defaultActiveColor = new Color(57, 181, 74);

    constructor(connectionService: ConnectionService, datasetService: DatasetService, filterService: FilterService,
        exportService: ExportService, injector: Injector, themesService: ThemesService, ref: ChangeDetectorRef,
                visualizationService: VisualizationService) {
        super(connectionService, datasetService, filterService, exportService, injector, themesService, ref, visualizationService);
        this.optionsFromConfig = {
            title: this.injector.get('title', null),
            database: this.injector.get('database', null),
            table: this.injector.get('table', null),
            dateField: this.injector.get('dateField', null),
            granularity: this.injector.get('granularity', 'day'),
        };
        this.filters = [];
        this.active = {
            dateField: new FieldMetaData(),
            granularity: this.optionsFromConfig.granularity,
            logarithmic: false,
            bucketizer: new DateBucketizer(),
            extent: [],
            focusGranularityDifferent: false
        };

        this.onClick = this.onClick.bind(this);
        this.chart = {
            type: 'bar',
            data: {
                datasets: [new TimelineDataSet(this.defaultActiveColor)]
            },
            options: {
                barPercentage: 1,
                categoryPercentage: 1,
                responsive: true,
                maintainAspectRatio: false,
                events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'touchend'],
                onClick: this.onClick,
                animation: {
                  duration: 0, // general animation time
                },
                hover: {
                    mode: 'point',
                    onHover: null,
                },
                scales: {
                    xAxes: [{
                        type: 'time',
                        distribution: 'series',
                        time: {
                            unit: this.active.granularity
                        },
                        categoryPercentage: 1.0,
                        barPercentage: 1.0
                    }],
                    yAxes: [{
                        type: 'linear',
                        min: 0,
                        startAtZero: true
                    }],
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
            return this.active.dateField.prettyName + ': ' + tooltips[0].xLabel;
        };
        let tooltipDataFunc = (tooltipItem, data) => {
            let tooltip = data.datasets[tooltipItem.datasetIndex];
            let value = tooltip.data[tooltipItem.index].y;
            // Returning null removes the row from the tooltip
            return value === 0 ? null : tooltip.label + ': ' + value;
        };
        // this.chart.options['tooltips'].callbacks.title = tooltipTitleFunc.bind(this);
        // this.chart.options['tooltips'].callbacks.label = tooltipDataFunc.bind(this);
        this.queryTitle = 'Timeline';
    };

    subNgOnInit() {
        //Do nothing
    };

    postInit() {
        this.executeQueryChain();
    };

    subNgOnDestroy() {
        this.chartModule['chart'].destroy();
    };

    subGetBindings(bindings: any) {
        bindings.dateField = this.active.dateField.columnName;
        bindings.granularity = this.active.granularity;
    }

    getExportFields() {
        //{
        //    columnName: 'date',
        //    prettyName: 'Date'
        //},
        let fields = [{
            columnName: 'value',
            prettyName: 'Count'
        }];
        switch (this.active.granularity) {
            case 'minute':
                fields.push({
                    columnName: 'minute',
                    prettyName: 'Minute'
                });
            /* falls through */
            case 'hour':
                fields.push({
                    columnName: 'hour',
                    prettyName: 'Hour'
                });
            /* falls through */
            case 'day':
                fields.push({
                    columnName: 'day',
                    prettyName: 'Day'
                });
            /* falls through */
            case 'month':
                fields.push({
                    columnName: 'month',
                    prettyName: 'Month'
                });
            /* falls through */
            case 'year':
                fields.push({
                    columnName: 'year',
                    prettyName: 'Year'
                });
            /* falls through */
        }
        return fields;
    }

    getOptionFromConfig(field) {
        return this.optionsFromConfig[field];
    };

    onClick(_event, elements: any[]) {
        // console.log(event);
        //event.toString();
        // for (let el of elements) {
        //     let value = el._model.label;
        //     let key = this.active.dataField.columnName;
        //     let prettyKey = this.active.dataField.prettyName;
        //     let filter = {
        //         key: key,
        //         value: value,
        //         prettyKey: prettyKey
        //     };
        //     this.addLocalFilter(filter);
        //     this.addNeonFilter(false, filter);
        //     this.refreshVisualization();
        // }
        // TODO
    };

    onUpdateFields() {
        this.active.dateField = this.findFieldObject('dateField', neonMappings.DATE);
    };

    addLocalFilter(key: string, startDate: Date, endDate: Date, local?: boolean) {
        try {
            this.filters[0] = {
                key: key,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                local: local
            };
        } catch (e) {
            // Ignore potential date format errors
        }
    };

    createNeonFilterClauseEquals(_databaseAndTableName: {}, fieldName: string) {
        for (let filter of this.filters) {
            // Only apply filters that aren't local
            let filterClauses = [];
            filterClauses[0] = neon.query.where(fieldName, '>=', filter.startDate);
            let endDatePlusOne = filter.endDate.getTime() + DateBucketizer.MILLIS_IN_DAY;
            let endDatePlusOneDate = new Date(endDatePlusOne);
            filterClauses[1] = neon.query.where(fieldName, '<', endDatePlusOneDate);
            return neon.query.and.apply(neon.query, filterClauses);
        }
        return null;
    };

    getNeonFilterFields(): string[] {
        return [this.active.dateField.columnName];
    }
    getVisualizationName(): string {
        return 'Timeline';
    }

    getFilterText(filter) {
        // I.E. TIMELINE - EARTHQUAKES: 8 AUG 2015 TO 20 DEC 2015
        let database = this.meta.database.name;
        let table = this.meta.table.name;
        let field = this.active.dateField.columnName;
        let text = database + ' - ' + table + ' - ' + field + ' = ';
        let date = filter.startDate;
        text += (date.getUTCMonth() + 1) + '/' + date.getUTCDate() + '/' + date.getUTCFullYear();
        date = filter.endDate;
        text += ' to ';
        text += (date.getUTCMonth() + 1) + '/' + date.getUTCDate() + '/' + date.getUTCFullYear();
        return text;
    }

    refreshVisualization() {
        // TODO
        this.chartModule['chart'].update();
    }

    isValidQuery() {
        let valid = true;
        valid = (this.meta.database && this.meta.database.name && valid);
        valid = (this.meta.table && this.meta.table.name && valid);
        valid = (this.active.dateField && this.active.dateField.columnName && valid);
        return valid;
    }

    createQuery(): neon.query.Query {
        let databaseName = this.meta.database.name;
        let tableName = this.meta.table.name;
        let query = new neon.query.Query().selectFrom(databaseName, tableName);
        let whereClause = neon.query.where(this.active.dateField.columnName, '!=', null);
        let dateField = this.active.dateField.columnName;
        query = query.aggregate(neon.query['MIN'], dateField, 'date');
        let groupBys: any[] = [];
        switch (this.active.granularity) {
            //Passthrough is intentional and expected!  falls through comments tell the linter that it is ok.
            case 'minute':
                groupBys.push(new neon.query.GroupByFunctionClause('minute', dateField, 'minute'));
            /* falls through */
            case 'hour':
                groupBys.push(new neon.query.GroupByFunctionClause('hour', dateField, 'hour'));
            /* falls through */
            case 'day':
                groupBys.push(new neon.query.GroupByFunctionClause('dayOfMonth', dateField, 'day'));
            /* falls through */
            case 'month':
                groupBys.push(new neon.query.GroupByFunctionClause('month', dateField, 'month'));
            /* falls through */
            case 'year':
                groupBys.push(new neon.query.GroupByFunctionClause('year', dateField, 'year'));
            /* falls through */
        }
        query = query.groupBy(groupBys);
        query = query.sortBy('date', neon.query['ASCENDING']);
        query = query.where(whereClause);
        // Add the unshared filter field, if it exists
        if (this.hasUnsharedFilter()) {
            query.where(neon.query.where(this.meta.unsharedFilterField.columnName, '=', this.meta.unsharedFilterValue));
        }
        return query.aggregate(neon.query['COUNT'], '*', 'value');
    };

    getFiltersToIgnore() {
        let database = this.meta.database.name;
        let table = this.meta.table.name;
        let fields = [this.active.dateField.columnName];
        let ignoredFilterIds = [];
        let neonFilters = this.filterService.getFilters(database, table, fields);
        if (neonFilters && neonFilters.length > 0) {
            for (let filter of neonFilters) {
                // The data we want is in the whereClause's subclauses
                let whereClause = filter.filter.whereClause;
                if (whereClause && whereClause.whereClauses.length === 2) {
                    ignoredFilterIds.push(filter.id);
                }
            }
        }
        return (ignoredFilterIds.length > 0 ? ignoredFilterIds : null);
    }

    onQuerySuccess(response): void {
        // Convert all the dates into Date objects
        response.data.map((d) => {
            d.date = new Date(d.date);
        });

        this.queryData = {
            data: response.data,
            granularity: this.active.granularity
        };

        this.filterAndRefreshData();

        /*
        let colName = this.active.dataField.columnName;
        // let prettyColName = this.active.dataField.prettyName;
        let chartData = new BarData();

        let dataSets = new Map<string, BarDataSet>();

        let hasColor = this.hasColorField();

        /*
         * We need to build the datasets.
         * The datasets are just arrays of the data to draw, and the data is indexed
         * by the labels field.
         *
        for (let row of response.data) {
            let key: string = row[colName];
            if (!key) {
                continue;
            }
            if (chartData.labels.indexOf(key) === -1) {
                chartData.labels.push(key);
            }
        }

        for (let row of response.data) {
            let key: string = row[colName];
            if (!key) {
                continue;
            }
            let dataIndex = chartData.labels.indexOf(key);

            // The default group is the query title
            let group = this.queryTitle;
            if (hasColor) {
                group = row[this.meta.colorField.columnName];
            }

            let dataset = dataSets.get(group);
            if (dataset == null) {
                dataset = new BarDataSet(chartData.labels.length);
                dataSets.set(group, dataset);

                dataset.label = group;
                if (hasColor) {
                    dataset.color = this.colorSchemeService.getColorFor(this.meta.colorField.columnName, group);
                } else {
                    dataset.color = this.defaultActiveColor;
                }

                dataset.backgroundColor[0] = dataset.color.toRgb();
            }

            dataset.data[dataIndex] = row.value;
            // Set this to force the legend to update
            this.colorFieldNames = [this.meta.colorField.columnName];
        }

        chartData.datasets = Array.from(dataSets.values());
        this.chart.data = chartData;
        this.refreshVisualization();
        let title;
        switch (this.active.aggregation) {
            case 'count':
                title = 'Count';
                break;
            case 'average':
                title = 'Average'; // + this.active.aggregationField.prettyName;
                break;
            case 'sum':
                title = 'Sum'; // + this.active.aggregationField.prettyName;
                break;
        }
        title += ' by ' + this.active.dataField.prettyName;
        this.queryTitle = title;
        */
    }

    /**
     * Filter the raw data and re-draw the chart
     */
    filterAndRefreshData() {

        // The query includes a sort, so it *should* be sorted.
        // Start date will be the first entry, and the end date will be the last
        this.active.extent = [
            this.queryData.data[0].date,
            this.queryData.data[this.queryData.data.length - 1].date
        ];
        let startDate = this.active.extent[0];
        let endDate = this.active.extent[1];

        let filter = null;
        if (this.filters.length > 0) {
            filter = this.filters[0];
        }

        let dataSet = new TimelineDataSet(this.defaultActiveColor);

        // If we have a bucketizer, use it
        if (this.active.bucketizer) {
            this.active.bucketizer.setStartDate(startDate);
            this.active.bucketizer.setEndDate(endDate);

            let numBuckets = this.active.bucketizer.getNumBuckets();
            for (let i = 0; i < numBuckets; i++) {
                let bucketDate = this.active.bucketizer.getDateForBucket(i);
                dataSet.data[i] = {
                    t: bucketDate,
                    y: 0
                };
            }

            for (let row of this.queryData.data) {
                // Check if this should be in the focus data
                // Focus data is not bucketized, just zeroed
                // if (filter) {
                //     if (filter.startDate <= row.date && filter.endDate >= row.date) {
                //         series.focusData.push({
                //             date: this.zeroDate(row.date),
                //             value: row.value
                //         });
                //     }
                // }

                let bucketIndex = this.active.bucketizer.getBucketIndex(row.date);

                if (dataSet.data[bucketIndex]) {
                    dataSet.data[bucketIndex].y += row.value;
                }
            }
        } else {
            // No bucketizer, just add the data
            for (let row of this.queryData.data) {
                // Check if this should be in the focus data
                // if (filter) {
                //     if (filter.startDate <= row.date && filter.endDate >= row.date) {
                //         series.focusData.push({
                //             date: row.date,
                //             value: row.value
                //         });
                //     }
                // }

                dataSet.data.push({
                    t: row.date,
                    y: row.value
                });
            }
        }

        // if (series.focusData && series.focusData.length > 0) {
        //     let extentStart = series.focusData[0].date;
        //     let extentEnd = series.focusData[series.focusData.length - 1].date;
        //     this.active.extent = [extentStart, extentEnd];
        // }

        // Apply the color
        dataSet.setAllActive();

        // Make sure to update both the data and primary series
        this.chart.data.datasets = [dataSet];
        //this.active.primarySeries = series;

        this.refreshVisualization();
    }

    /**
     * Zero out a date, if needed
     */
    zeroDate(date: Date) {
        if (this.active.bucketizer && this.active.granularity !== 'minute') {
            return this.active.bucketizer.zeroOutDate(date);
        }
        return date;
    }

    handleChangeGranularity() {
        this.active.focusGranularityDifferent = false;
        switch (this.active.granularity.toLowerCase()) {
            case 'minute':
                this.active.focusGranularityDifferent = true;
            /* falls through */
            case 'hour':
                this.active.bucketizer = new DateBucketizer();
                this.active.bucketizer.setGranularity(DateBucketizer.HOUR);
                break;
            case 'day':
                this.active.bucketizer = new DateBucketizer();
                break;
            case 'month':
                this.active.bucketizer = new MonthBucketizer();
                break;
            case 'year':
                this.active.bucketizer = new YearBucketizer();
                break;
            default:
                this.active.bucketizer = null;
        }
        this.logChangeAndStartQueryChain();
    }

    setupFilters() {
        // Get neon filters
        // See if any neon filters are local filters and set/clear appropriately
        let database = this.meta.database.name;
        let table = this.meta.table.name;
        let fields = [this.active.dateField.columnName];
        let neonFilters = this.filterService.getFilters(database, table, fields);
        if (neonFilters && neonFilters.length > 0) {
            for (let filter of neonFilters) {
                // The data we want is in the whereClause's subclauses
                let whereClause = filter.filter.whereClause;
                if (whereClause && whereClause.whereClauses.length === 2) {
                    let key = whereClause.whereClauses[0].lhs;
                    let startDate = whereClause.whereClauses[0].rhs;
                    let endDate = whereClause.whereClauses[1].rhs;
                    this.addLocalFilter(key, startDate, endDate);
                }
            }
        } else {
            this.removeFilter();
        }
    }

    handleChangeDateField() {
        this.logChangeAndStartQueryChain(); // ('dateField', this.active.dateField.columnName);
    };

    logChangeAndStartQueryChain() { // (option: string, value: any, type?: string) {
        // this.logChange(option, value, type);
        if (!this.initializing) {
            this.executeQueryChain();
        }
    };

    unsharedFilterChanged() {
        // Update the data
        this.executeQueryChain();
    }

    unsharedFilterRemoved() {
        // Update the data
        this.executeQueryChain();
    }

    getButtonText() {
        let text = 'No Data';
        let data = this.chart.data['datasets'];
        if (!data || !data[0] || !data[0]['data'] || !data[0]['data'].length) {
            return text;
        } else {
            return 'Top ' + data[0]['data'].length;
        }
    };

    // Get filters and format for each call in HTML
    getCloseableFilters() {
        // let closeableFilters = this.filters.map((filter) => {
        //    return filter.key + " Filter";
        //});
        //return closeableFilters;
        if (this.filters.length > 0) {
            return ['Date Filter'];
        } else {
            return [];
        }
    };

    getFilterTitle(value: string) {
        return this.active.dateField.columnName + ' = ' + value;
    };

    getFilterCloseText(value: string) {
        return value;
    };

    getRemoveFilterTooltip(value: string) {
        return 'Delete Filter ' + this.getFilterTitle(value);
    };

    removeFilter(/*value: string*/) {
        this.filters = [];
        // TODO - Clear brush
    }
}
