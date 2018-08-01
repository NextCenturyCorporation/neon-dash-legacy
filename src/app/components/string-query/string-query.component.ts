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
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Injector,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation
} from '@angular/core';

import { ActiveGridService } from '../../services/active-grid.service';
import { ConnectionService } from '../../services/connection.service';
import { DatasetService } from '../../services/dataset.service';
import { FilterService, ServiceFilter } from '../../services/filter.service';
import { ExportService } from '../../services/export.service';
import { ThemesService } from '../../services/themes.service';
import { VisualizationService } from '../../services/visualization.service';

import { BaseNeonComponent, BaseNeonOptions } from '../base-neon-component/base-neon.component';
import { FieldMetaData, TableMetaData, DatabaseMetaData } from '../../dataset';
import * as neon from 'neon-framework';

/**
 * Manages configurable options for the specific visualization.
 */
export class StringQueryOptions extends BaseNeonOptions {
    public multiFilter: boolean;

    /**
     * Initializes all the non-field options for the specific visualization.
     *
     * @override
     */
    onInit() {
        this.multiFilter = this.injector.get('multiFilter', false);
    }

    /**
     * Updates all the field options for the specific visualization.  Called on init and whenever the table is changed.
     *
     * @override
     */
    updateFieldsOnTableChanged() {
        // Do nothing.
    }
}

@Component({
    selector: 'app-string-query',
    templateUrl: './string-query.component.html',
    styleUrls: ['./string-query.component.scss'],
    encapsulation: ViewEncapsulation.Emulated,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StringQueryComponent extends BaseNeonComponent implements OnInit, OnDestroy {
    @ViewChild('visualization', {read: ElementRef}) visualization: ElementRef;
    @ViewChild('headerText') headerText: ElementRef;

    public options: StringQueryOptions;

    public clauses: WhereClauseMetaData[] = [];
    public databaseTableFieldKeysToFilterIds: Map<string, string> = new Map<string, string>();
    private operator: OperatorMetaData = {
        value: 'string',
        prettyName: 'String'
    };

    public counter: number = -1;

    constructor(
        activeGridService: ActiveGridService,
        connectionService: ConnectionService,
        datasetService: DatasetService,
        filterService: FilterService,
        exportService: ExportService,
        injector: Injector,
        themesService: ThemesService,
        ref: ChangeDetectorRef,
        visualizationService: VisualizationService
    ) {
        super(
            activeGridService,
            connectionService,
            datasetService,
            filterService,
            exportService,
            injector,
            themesService,
            ref,
            visualizationService
        );

        this.options = new StringQueryOptions(this.injector, this.datasetService, 'String Query');
        this.isExportable = false;
    }

    subNgOnInit() {
        this.options.databases.forEach((database) => {
            database.tables.forEach((table) => {
                table.fields.forEach((field) => {
                    let databaseTableFieldKey = this.getDatabaseTableFieldKey(database.name, table.name);
                    this.databaseTableFieldKeysToFilterIds.set(databaseTableFieldKey, '');
                });

                if (this.options.multiFilter) {
                    this.options.table = table;
                    this.addBlankWhereClause();
                }
            });
        });

        if (!this.options.multiFilter) {
            this.addBlankWhereClause();
        }
    }

    postInit() {
        // Do nothing
    }

    subNgOnDestroy() {
        // Do nothing
    }

    getExportFields() {
        // Do nothing.  Doesn't export nor does this visualization register to export
        // therefore, this function can be ignored.
        return null;
    }

    /**
     * Sets the properties in the given bindings for the bar chart.
     *
     * @arg {object} bindings
     * @override
     */
    subGetBindings(bindings: any) {
        bindings.clauses = this.clauses;
        bindings.databaseTableFieldKeysToFilterIds = this.databaseTableFieldKeysToFilterIds;
    }

    addBlankWhereClause() {
        let clause: WhereClauseMetaData = new WhereClauseMetaData(this.injector, this.datasetService);
        clause.changeDatabase = this.options.database;
        clause.changeTable = this.options.table;
        clause.changeField = this.emptyField;
        clause.databases = this.options.databases;
        clause.database = this.options.database;
        clause.tables = this.options.tables;
        clause.table = this.options.table;
        clause.fields = this.options.fields;
        clause.field = this.emptyField;
        clause.operator = this.operator;
        clause.value = '';
        clause.active = false;
        clause.id = ++this.counter;
        if (clause.database && clause.table) {
            this.clauses.push(clause);
        }
    }

    removeClause(clause) {
        this.clauses = this.clauses.filter((clauseFromList) => {
            return clause.id !== clauseFromList.id;
        });

        let databaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);

        if (this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey)) {
            let shouldReplace = this.clauses.some((clauseFromList) => {
                return databaseTableFieldKey === this.getDatabaseTableFieldKey(clauseFromList.database.name, clauseFromList.table.name);
            });

            if (shouldReplace) {
                this.filterService.replaceFilter(
                    this.messenger,
                    this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey),
                    this.id,
                    clause.database.name,
                    clause.table.name,
                    this.createNeonFilter(clause.database.name, clause.table.name),
                    {
                        visName: this.options.title,
                        text: this.getFilterName(clause)
                    }
                );
            } else {
                this.removeFilterById(databaseTableFieldKey);
            }
        }

        if (!this.clauses.length) {
            this.addBlankWhereClause();
        }
    }

    activateClause(clause) {
        if (this.validateClause(clause)) {
            clause.active = true;
            let databaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);
            this.updateFiltersOfKey(databaseTableFieldKey);
        }
    }

    updateFiltersOfKey(databaseTableFieldKey: string) {
        let filterId = this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey);
        let activeMatchingClauses = this.clauses.filter((clause) => {
            let clauseDatabaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);
            return databaseTableFieldKey === clauseDatabaseTableFieldKey && this.validateClause(clause) && clause.active;
        });
        if (activeMatchingClauses.length) {
            this.addNeonFilter(false, new CustomFilter(activeMatchingClauses, databaseTableFieldKey, filterId));
        } else {
            this.removeFilterById(databaseTableFieldKey);
        }
    }

    updateFilters() {
        this.databaseTableFieldKeysToFilterIds.forEach((filterId, databaseTableFieldKey) => {
            this.updateFiltersOfKey(databaseTableFieldKey);
        });
    }

    resetFilterBuilder() {
        let callback = () => {
            this.clauses = [];
            this.addBlankWhereClause();
        };
        let filterIds = [];
        this.databaseTableFieldKeysToFilterIds.forEach((filterId, databaseTableFieldKey) => {
            if (filterId) {
                filterIds.push(filterId);
            }
        });
        this.filterService.removeFilters(this.messenger, filterIds, callback.bind(this));
    }

    getDatabaseTableFieldKey(database, table) {
        return database + '-' + table;
    }

    // TODO Why override addNeonFilter rather than making a new function?
    /*
    * Assumes all clauses passed in have the same database/table combination
    *
    * @override
    */
    addNeonFilter(executeQueryChainOnsuccess: boolean, filter: CustomFilter) {
        if (!filter.clauses || !filter.clauses.length) {
            return;
        }
        let onSuccess = (neonFilterId) => {
            this.databaseTableFieldKeysToFilterIds.set(filter.databaseTableFieldKey, neonFilterId);
        };
        let onError = () => {
            console.error('filter failed to set');
        };
        let sampleClause: WhereClauseMetaData = filter.clauses[0];

        if (filter.filterId) {
            this.filterService.replaceFilter(
                this.messenger,
                filter.filterId,
                this.id,
                sampleClause.database.name,
                sampleClause.table.name,
                this.createNeonFilter(sampleClause.database.name, sampleClause.table.name),
                {
                    visName: this.options.title,
                    text: this.getFilterName(sampleClause)
                },
                onSuccess.bind(this),
                onError.bind(this));
        } else {
            this.filterService.addFilter(
                this.messenger,
                this.id,
                sampleClause.database.name,
                sampleClause.table.name,
                this.createNeonFilter(sampleClause.database.name, sampleClause.table.name),
                {
                    visName: this.options.title,
                    text: this.getFilterName(sampleClause)
                },
                onSuccess.bind(this),
                onError.bind(this)
            );
        }
    }

    /**
     * Returns the name of the filter using the given clause.
     *
     * @arg {WhereClauseMetaData} clause
     * @return {string}
     */
    getFilterName(clause) {
        return clause.field.prettyName + ' ' + clause.operator.prettyName + ' ' + clause.value;
    }

    createNeonFilter(database: string, table: string) {
        let databaseTableFieldKey = this.getDatabaseTableFieldKey(database, table);
        let activeMatchingClauses = this.clauses.filter((clause) => {
            let clauseDatabaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);
            return databaseTableFieldKey === clauseDatabaseTableFieldKey && this.validateClause(clause)
                    && clause.active && clause.value.trim() !== '';
        });

        let filterClauses = activeMatchingClauses.map((clause) => {
            return neon.query.where(clause.field.columnName, 'string', clause.value);
        });
        if (filterClauses.length === 1) {
            return filterClauses[0];
        }
        return neon.query.or.apply(neon.query, filterClauses);
    }

    /**
     * Removes a filter.  (Does nothing in this visualization.)
     *
     * @override
     */
    removeFilter(filter: any) {
        // Do nothing.
    }

    refreshVisualization() {
        // constantly refreshed due to bindings.  Do nothing
    }

    isValidQuery() {
        // Don't query
        return false;
    }

    createQuery(): neon.query.Query {
        // Don't query
        return null;
    }

    getFiltersToIgnore() {
        // Don't query
        return null;
    }

    onQuerySuccess(): void {
        // Don't query
        return null;
    }

    setupFilters() {
        // Do nothing
    }

    handleFiltersChangedEvent() {
        // Do nothing
    }

    /**
     * Returns the list of filter objects.
     *
     * @return {array}
     * @override
     */
    getCloseableFilters(): any[] {
        return [];
    }

    getFilterText(filter): string {
        // Do nothing, no filters
        return '';
    }

    /**
     * Returns an object containing the ElementRef objects for the visualization.
     *
     * @return {any} Object containing:  {ElementRef} headerText, {ElementRef} visualization
     * @override
     */
    getElementRefs() {
        return {
            visualization: this.visualization,
            headerText: this.headerText
        };
    }

    /**
     * Returns the options for the specific visualization.
     *
     * @return {BaseNeonOptions}
     * @override
     */
    getOptions(): BaseNeonOptions {
        return this.options;
    }

    /**
     * Updates the filters due to the change of the AND/OR toggle if needed.
     */
    handleChangeAndOr() {
        if (this.clauses.length > 1) {
            this.updateFilters();
        }
    }

    /**
     * Updates the active status, tables, fields, and value in the given clause and the filters.
     *
     * @arg {WhereClauseMetaData} clause
     */
    handleChangeDatabaseOfClause(clause: WhereClauseMetaData) {
        let databaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);

        clause.active = false;
        clause.database = clause.changeDatabase;
        clause.updateTables();

        if (this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey)) {
            this.updateFiltersOfKey(databaseTableFieldKey);
        }
    }

    /**
     * Updates the active status, fields, and value in the given clause and the filters.
     *
     * @arg {WhereClauseMetaData} clause
     */
    handleChangeTableOfClause(clause: WhereClauseMetaData) {
        let databaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);

        clause.active = false;
        clause.table = clause.changeTable;
        clause.updateFields();

        if (this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey)) {
            this.updateFiltersOfKey(databaseTableFieldKey);
        }
    }

    /**
     * Updates the active status and value in the given clause and the filters.
     *
     * @arg {WhereClauseMetaData} clause
     */
    handleChangeFieldOfClause(clause: WhereClauseMetaData) {
        let databaseTableFieldKey = this.getDatabaseTableFieldKey(clause.database.name, clause.table.name);

        clause.active = false;
        clause.field = clause.changeField;

        if (this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey)) {
            this.updateFiltersOfKey(databaseTableFieldKey);
        }
    }

    /**
     * Updates the active status of the given clause.
     *
     * @arg {WhereClauseMetaData} clause
     */
    handleChangeDataOfClause(clause: WhereClauseMetaData) {
        clause.active = false;
    }

    /**
     * Removes the filters with the given database-table key.
     *
     * @arg {string} databaseTableFieldKey
     */
    removeFilterById(databaseTableFieldKey: string) {
        this.filterService.removeFilters(
            this.messenger,
            [this.databaseTableFieldKeysToFilterIds.get(databaseTableFieldKey)],
            () => {
                this.databaseTableFieldKeysToFilterIds.set(databaseTableFieldKey, '');
            }
        );
    }

    /**
     * Returns the validity of the given clause.
     *
     * @arg {WhereClauseMetaData} clause
     */
    validateClause(clause: WhereClauseMetaData) {
        return clause.database && clause.table && clause.value.trim() !== '';
    }
}

class OperatorMetaData {
    value: string;
    prettyName: string;
}

class WhereClauseMetaData extends BaseNeonOptions {
    changeDatabase: DatabaseMetaData;
    changeTable: TableMetaData;
    changeField: FieldMetaData;
    field: FieldMetaData;
    operator: OperatorMetaData;
    value: string;
    active: boolean;
    id: number;

    /**
     * Initializes all the non-field options for the specific visualization.
     *
     * @override
     */
    onInit() {
        // Do nothing.
    }

    /**
     * Updates all the field options for the specific visualization.  Called on init and whenever the table is changed.
     *
     * @override
     */
    updateFieldsOnTableChanged() {
        // Do nothing.
    }
}

class CustomFilter {
    clauses: WhereClauseMetaData[];
    databaseTableFieldKey: string;
    filterId: string;

    constructor(clauses: WhereClauseMetaData[], databaseTableFieldKey: string, filterId: string) {
        this.clauses = clauses;
        this.databaseTableFieldKey = databaseTableFieldKey;
        this.filterId = filterId;
    }
}
