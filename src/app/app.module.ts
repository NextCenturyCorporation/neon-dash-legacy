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
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import 'hammerjs';

import { NgGridModule } from 'angular2-grid';

import { ActiveGridService } from './services/active-grid.service';
import { ConnectionService } from './services/connection.service';
import { DatasetService } from './services/dataset.service';
import { ErrorNotificationService } from './services/error-notification.service';
import { ExportService } from './services/export.service';
import { FilterService } from './services/filter.service';
import { ImportService } from './services/import.service';
import { ParameterService } from './services/parameter.service';
import { PropertyService } from './services/property.service';
import { ThemesService } from './services/themes.service';
import { TranslationService } from './services/translation.service';
import { VisualizationService } from './services/visualization.service';
import { ColorSchemeService } from './services/color-scheme.service';

import { AppComponent } from './app.component';
import { AboutNeonComponent } from './components/about-neon/about-neon.component';
import { AddVisualizationComponent } from './components/add-visualization/add-visualization.component';
import { BarChartComponent } from './components/bar-chart/bar-chart.component';
import { ConfigEditorComponent } from './components/config-editor/config-editor.component';
import { DashboardOptionsComponent } from './components/dashboard-options/dashboard-options.component';
import { DatasetSelectorComponent } from './components/dataset-selector/dataset-selector.component';
import { DataTableComponent } from './components/data-table/data-table.component';
import { DocumentViewerComponent } from './components/document-viewer/document-viewer.component';
import { DocumentViewerSingleItemComponent } from './components/document-viewer-single-item/document-viewer-single-item.component';
import { ExportControlComponent } from './components/export-control/export-control.component';
import { FilterBuilderComponent } from './components/filter-builder/filter-builder.component';
import { FilterTrayComponent } from './components/filter-tray/filter-tray.component';
import { LegendComponent } from './components/legend/legend.component';
import { LineChartComponent } from './components/line-chart/line-chart.component';
import { MapComponent } from './components/map/map.component';
import { ScatterPlotComponent } from './components/scatter-plot/scatter-plot.component';
import { SnackBarComponent } from './components/snack-bar/snack-bar.component';
import { StackedTimelineComponent } from './components/stacked-timeline/stacked-timeline.component';
import { TextCloudComponent } from './components/text-cloud/text-cloud.component';
import { TimelineComponent } from './components/timeline/timeline.component';
import { UnsharedFilterComponent } from './components/unshared-filter/unshared-filter.component';
import { VisualizationContainerComponent } from './components/visualization-container/visualization-container.component';
import { VisualizationInjectorComponent } from './components/visualization-injector/visualization-injector.component';
import { ChartModule } from 'angular2-chartjs';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
//import { JSONEditorModule } from 'ng2-jsoneditor';
import {AppMaterialModule} from './app.material.module';

export function getAppConfig() {
    return window['appConfig'];
}

@NgModule({
    declarations: [
        AppComponent,
        AboutNeonComponent,
        AddVisualizationComponent,
        BarChartComponent,
        ConfigEditorComponent,
        DashboardOptionsComponent,
        DatasetSelectorComponent,
        DataTableComponent,
        DocumentViewerComponent,
        DocumentViewerSingleItemComponent,
        ExportControlComponent,
        FilterBuilderComponent,
        FilterTrayComponent,
        LegendComponent,
        LineChartComponent,
        MapComponent,
        ScatterPlotComponent,
        SnackBarComponent,
        StackedTimelineComponent,
        TextCloudComponent,
        TimelineComponent,
        UnsharedFilterComponent,
        VisualizationContainerComponent,
        VisualizationInjectorComponent
    ],
    imports: [
        BrowserModule,
        CommonModule,
        FormsModule,
        HttpModule,
        NgGridModule,
        ChartModule,
        NgxDatatableModule,
        BrowserAnimationsModule,
        AppMaterialModule,
    ],
    providers: [
        ActiveGridService,
        ConnectionService,
        DatasetService,
        ErrorNotificationService,
        ExportService,
        FilterService,
        ImportService,
        ParameterService,
        PropertyService,
        ThemesService,
        TranslationService,
        VisualizationService,
        ColorSchemeService,
        {
            provide: 'config',
            useFactory: getAppConfig
        }
    ],
    entryComponents: [AppComponent, AddVisualizationComponent, DocumentViewerSingleItemComponent, FilterTrayComponent, SnackBarComponent,
        ConfigEditorComponent],
    bootstrap: [AppComponent]
})

export class AppModule {

}
