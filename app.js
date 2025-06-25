class NOAAWeatherVisualizer {
    constructor() {
        this.currentData = null;
        this.availableYears = [];
        this.availableElements = [];
        this.availableStations = [];
        this.availableLocations = { countries: [], states: [] };
        this.isBrushing = false;
        this.heatmapDateRange = null;
        this.isInitialized = false;
        this.showTable = false;
        this.currentCountryStats = null;
        this.tableSortState = { column: null, direction: null }; // null, 'asc', 'desc'
        
        // Loading management
        this.loadingTimers = new Map(); // Track loading timers for each element

        // Resize handling
        this.resizeTimer = null;
        this.currentWorldData = null; // Store latest world data for redraws

        this.initializeEventListeners();
        this.setupChart();
        this.setupWorldMap();

        // Initialize the application
        this.initialize();
    }

    initializeEventListeners() {
        // Manual refresh button
        document.getElementById('load-data').addEventListener('click', () => {
            this.loadAndVisualizeData();
        });

        // Redownload data button
        document.getElementById('redownload-data').addEventListener('click', () => {
            this.loadAndVisualizeData(true);
        });

        // Table view toggle
        document.getElementById('show-table').addEventListener('change', (e) => {
            this.toggleTableView(e.target.checked);
        });

        // Auto-reload when filters change with debouncing
        let debounceTimer = null;
        const debouncedLoad = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (this.isInitialized) {
                    this.updateURLParams();
                    this.loadAndVisualizeData();
                }
            }, 150); // Small delay to prevent rapid firing
        };

        document.getElementById('year-select').addEventListener('change', () => {
            this.heatmapZoom = null;
            this.heatmapDateRange = null;
            this.loadAvailableElements();
            this.loadLocations();
            this.loadStations();
            debouncedLoad();
        });
        document.getElementById('element-select').addEventListener('change', () => {
            this.loadLocations();
            this.loadStations();
            debouncedLoad();
        });
        document.getElementById('chart-type').addEventListener('change', () => {
            debouncedLoad();
        });
        document.getElementById('country-select').addEventListener('change', async () => {
            console.log('Country changed to:', document.getElementById('country-select').value);
            await this.loadLocations(); // Reload locations to update state dropdown
            this.filterAndLoadStations();
            debouncedLoad();
        });
        document.getElementById('state-select').addEventListener('change', () => {
            this.filterAndLoadStations();
            debouncedLoad();
        });
        document.getElementById('station-select').addEventListener('change', () => {
            debouncedLoad();
        });

        this.setupResizeListener();
    }

    setupResizeListener() {
        const debouncedRedraw = () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                console.log('Window resized, redrawing visualizations...');
                this.redrawVisualizations();
            }, 150);
        };
        window.addEventListener('resize', debouncedRedraw);
    }

    redrawVisualizations() {
        // Redraw time series chart
        if (this.currentData) {
            const chartType = document.getElementById('chart-type').value;
            const element = document.getElementById('element-select').value;
            this.visualizeData(this.currentData, chartType, element);
        }
        // Redraw world map
        if (this.currentWorldData) {
            const element = document.getElementById('element-select').value;
            const selectedCountry = document.getElementById('country-select').value;
            const selectedState = document.getElementById('state-select').value;
            this.createWorldMap(this.currentWorldData, element, selectedCountry, selectedState);
        }
    }

    async initialize() {
        try {
            this.isInitialized = false;
            
            // Store URL params early for proper restoration
            const urlParams = new URLSearchParams(window.location.search);
            this.urlCountry = urlParams.get('country') || '';
            this.urlState = urlParams.get('state') || '';
            this.urlStation = urlParams.get('station') || '';
            
            console.log(`URL params: country="${this.urlCountry}", state="${this.urlState}", station="${this.urlStation}"`);
            
            // Initialize table view preference from localStorage
            this.initializeTableView();
            
            // Load available years first
            await this.loadAvailableYears();
            // Load available elements for the selected year
            await this.loadAvailableElements();
            // Restore basic filters from URL (year, element, chart type)
            this.restoreBasicFiltersFromURL();
            // Load locations with the URL country filter
            await this.loadLocations();
            // Load stations with the URL country and state filters
            await this.loadStations();
            // Then load default data
            await this.loadDefaultData();
            
            // Clear URL params after successful initialization
            this.clearUrlParams();
        } catch (error) {
            console.error('Error during initialization:', error);
            this.showErrorMessage('Failed to initialize application. Please refresh the page.');
        } finally {
            this.isInitialized = true;
            // A final redraw after a short delay ensures everything is sized correctly on initial load
            setTimeout(() => this.redrawVisualizations(), 200);
        }
    }

    async loadAvailableYears() {
        try {
            this.showLoadingDelayed('loading');
            this.setLoadingMessage('Checking available years...');
            const response = await fetch('/api/years');
            if (!response.ok) {
                throw new Error('Failed to fetch available years');
            }
            // Optionally, check for a custom header to see if cache was used
            if (response.headers.get('x-noaa-cache') === 'hit') {
                this.setLoadingMessage('Using cached year/element list...');
            } else {
                this.setLoadingMessage('Listing available years from S3 (first run may take a while)...');
            }
            this.availableYears = await response.json();
            this.populateYearSelector();
        } catch (error) {
            console.error('Error loading available years:', error);
            this.setLoadingMessage('Failed to load years. Using fallback list.');
            // Fallback to hardcoded years if API fails
            this.availableYears = [2024, 2023, 2022, 2021, 2020];
            this.populateYearSelector();
        } finally {
            this.hideLoadingImmediate('loading');
        }
    }

    populateYearSelector() {
        const yearSelect = document.getElementById('year-select');
        yearSelect.innerHTML = ''; // Clear existing options

        this.availableYears.forEach((year, index) => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            // Select the most recent year by default
            if (index === 0) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        });

        // console.log(`Populated year selector with ${this.availableYears.length} years (${this.availableYears[this.availableYears.length-1]} - ${this.availableYears[0]})`);
    }

    async loadAvailableElements() {
        const year = document.getElementById('year-select').value;
        if (!year) return;
        try {
            this.setLoadingMessage(`Checking available data types for ${year}...`);
            const response = await fetch(`/api/elements/${year}`);
            if (!response.ok) {
                throw new Error('Failed to fetch available elements');
            }
            if (response.headers.get('x-noaa-cache') === 'hit') {
                this.setLoadingMessage('Using cached year/element list...');
            } else {
                this.setLoadingMessage(`Listing available data types for ${year} from S3...`);
            }
            this.availableElements = await response.json();
            this.populateElementSelector();
        } catch (error) {
            console.error('Error loading available elements:', error);
            this.setLoadingMessage('Failed to load data types. Using fallback list.');
            // Fallback to hardcoded elements if API fails
            this.availableElements = ['TMAX', 'TMIN', 'PRCP', 'TAVG'];
            this.populateElementSelector();
        }
    }

    populateElementSelector() {
        const elementSelect = document.getElementById('element-select');
        const currentElement = elementSelect.value;
        elementSelect.innerHTML = ''; // Clear existing options

        this.availableElements.forEach((element, index) => {
            const option = document.createElement('option');
            // Handle both old format (strings) and new format (objects)
            if (typeof element === 'string') {
                option.value = element;
                option.textContent = element;
            } else {
                option.value = element.code;
                option.textContent = element.description;
                if (element.unit) {
                    option.title = `Unit: ${element.unit}`;
                }
            }

            // Select the first element by default, or keep current if still available
            const elementCode = typeof element === 'string' ? element : element.code;
            if ((currentElement && elementCode === currentElement) || (!currentElement && index === 0)) {
                option.selected = true;
            }
            elementSelect.appendChild(option);
        });

        console.log(`Populated element selector with ${this.availableElements.length} elements for year ${document.getElementById('year-select').value}`);
    }

    async loadStations() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;

        if (!year || !element) return;

        try {
            // Add geographic filters to the API call
            const params = new URLSearchParams();
            // Use URL parameters during initialization, otherwise use dropdown values
            const country = this.urlCountry || document.getElementById('country-select').value;
            const state = this.urlState || document.getElementById('state-select').value;
            
            if (country) params.append('country', country);
            if (state) params.append('state', state);
            
            const url = `/api/stations/${year}/${element}${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error('Failed to fetch available stations');
            }

            this.availableStations = await response.json();
            this.populateStationSelector();

        } catch (error) {
            console.error('Error loading available stations:', error);
            // Clear stations on error
            this.availableStations = [];
            this.populateStationSelector();
        }
    }

    populateStationSelector() {
        const stationSelect = document.getElementById('station-select');
        stationSelect.innerHTML = '<option value="">All Stations (Average)</option>';

        // No need for client-side filtering since it's now done server-side
        this.availableStations.forEach(station => {
            const option = document.createElement('option');
            option.value = station.id;
            option.textContent = station.name;
            option.title = `Station ID: ${station.id}`;

            // Select station from URL if available
            if (this.urlStation && station.id === this.urlStation) {
                option.selected = true;
            }

            stationSelect.appendChild(option);
        });

        // Clear the URL station after processing
        this.urlStation = null;

        console.log(`Populated station selector with ${this.availableStations.length} stations`);
    }

    async loadLocations() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;

        if (!year || !element) return;

        try {
            // Use URL country parameter during initialization, otherwise use dropdown value
            const country = this.urlCountry || document.getElementById('country-select').value;
            const params = new URLSearchParams();
            if (country) {
                params.append('country', country);
            }

            const url = `/api/locations/${year}/${element}${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch available locations');
            }

            this.availableLocations = await response.json();
            console.log('Loaded locations:', this.availableLocations);
            this.populateLocationSelectors();

        } catch (error) {
            console.error('Error loading available locations:', error);
            this.availableLocations = { countries: [], states: [] };
            this.populateLocationSelectors();
        }
    }

    populateLocationSelectors() {
        // Populate country selector
        const countrySelect = document.getElementById('country-select');
        // Use stored URL country or current dropdown value
        const targetCountry = this.urlCountry || countrySelect.value;
        console.log(`Populating countries: target country is "${targetCountry}", URL country is "${this.urlCountry}"`);
        countrySelect.innerHTML = '<option value="">All Countries</option>';

        this.availableLocations.countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            if (country === targetCountry) {
                option.selected = true;
                console.log(`Selected country option: "${country}"`);
            }
            countrySelect.appendChild(option);
        });

        // Don't clear URL country yet - still needed for stations loading

        // Populate state selector
        const stateSelect = document.getElementById('state-select');
        // Use stored URL state or current dropdown value
        const targetState = this.urlState || stateSelect.value;
        stateSelect.innerHTML = '<option value="">All States/Regions</option>';

        // Check if target state is in the filtered list
        const availableStateNames = this.availableLocations.states.filter(s => s);
        const shouldPreserveState = targetState && availableStateNames.includes(targetState);

        console.log(`Populating states: ${availableStateNames.length} available, target: "${targetState}", shouldPreserve: ${shouldPreserveState}`);

        this.availableLocations.states.forEach(state => {
            if (state) { // Only add non-null states
                const option = document.createElement('option');
                option.value = state;
                option.textContent = state;
                if (shouldPreserveState && state === targetState) option.selected = true;
                stateSelect.appendChild(option);
            }
        });

        // Don't clear URL state yet - still needed for stations loading

        // Log result for debugging
        console.log(`State dropdown final value: "${stateSelect.value}"`);
    }

    filterAndLoadStations() {
        // Filter stations based on geographic selections
        this.loadStations();
    }

    clearUrlParams() {
        // Clear URL parameters after initialization to prevent interference with normal operation
        this.urlCountry = null;
        this.urlState = null;
        this.urlStation = null;
        console.log('URL parameters cleared after initialization');
    }

    // Utility methods for delayed loading
    showLoadingDelayed(elementId, delay = 5000) {
        // Clear any existing timer for this element
        if (this.loadingTimers.has(elementId)) {
            clearTimeout(this.loadingTimers.get(elementId));
        }
        
        // Set a timer to show loading after the delay
        const timer = setTimeout(() => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'block';
            }
            this.loadingTimers.delete(elementId);
        }, delay);
        
        this.loadingTimers.set(elementId, timer);
    }

    hideLoadingImmediate(elementId) {
        // Clear any pending timer
        if (this.loadingTimers.has(elementId)) {
            clearTimeout(this.loadingTimers.get(elementId));
            this.loadingTimers.delete(elementId);
        }
        
        // Hide loading immediately
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'none';
        }
    }

    async loadCountryStats() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;

        if (!year || !element) return;

        try {
            // Add geographic filters to the API call
            const params = new URLSearchParams();
            // Use URL parameters during initialization, otherwise use dropdown values
            const country = this.urlCountry || document.getElementById('country-select').value;
            const state = this.urlState || document.getElementById('state-select').value;
            
            if (country) params.append('country', country);
            if (state) params.append('state', state);
            
            // Add date range filter if heatmap zoom is active
            if (this.heatmapDateRange) {
                params.append('startDate', this.heatmapDateRange.start.toISOString().slice(0, 10));
                params.append('endDate', this.heatmapDateRange.end.toISOString().slice(0, 10));
            }
            
            const url = `/api/country-stats/${year}/${element}${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error('Failed to fetch country statistics');
            }

            this.currentCountryStats = await response.json();
            console.log(`Loaded ${this.currentCountryStats.length} country statistics`);

            // Update table if visible
            if (this.showTable) {
                this.populateCountryStatsTable();
            }

        } catch (error) {
            console.error('Error loading country statistics:', error);
            this.currentCountryStats = [];
            if (this.showTable) {
                this.populateCountryStatsTable();
            }
        }
    }

    initializeTableView() {
        // Get table view preference from localStorage, default to false
        const savedPreference = localStorage.getItem('noaa-show-table');
        this.showTable = savedPreference === 'true';
        
        // Set checkbox state
        document.getElementById('show-table').checked = this.showTable;
        
        // Apply initial visibility
        this.updateTableVisibility();
        
        // Add sorting event listeners to table headers
        this.initializeTableSorting();
        
        console.log(`Table view initialized: ${this.showTable}`);
    }

    initializeTableSorting() {
        // Add click event listeners to sortable column headers
        const headers = document.querySelectorAll('th[data-column]');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.column;
                this.handleColumnSort(column);
            });
        });
    }

    handleColumnSort(column) {
        // Toggle sort direction: null -> desc -> asc -> null
        if (this.tableSortState.column !== column) {
            // New column, start with descending
            this.tableSortState.column = column;
            this.tableSortState.direction = 'desc';
        } else {
            // Same column, cycle through states
            switch (this.tableSortState.direction) {
                case null:
                    this.tableSortState.direction = 'desc';
                    break;
                case 'desc':
                    this.tableSortState.direction = 'asc';
                    break;
                case 'asc':
                    this.tableSortState.column = null;
                    this.tableSortState.direction = null;
                    break;
            }
        }

        // Update visual indicators
        this.updateSortIndicators();

        // Re-populate table with new sorting
        if (this.currentCountryStats && this.showTable) {
            this.populateCountryStatsTable();
        }

        console.log(`Table sorted by ${this.tableSortState.column} ${this.tableSortState.direction || 'none'}`);
    }

    updateSortIndicators() {
        // Clear all indicators
        const indicators = document.querySelectorAll('.sort-indicator');
        indicators.forEach(indicator => {
            indicator.className = 'sort-indicator';
        });

        // Set active indicator
        if (this.tableSortState.column && this.tableSortState.direction) {
            const activeHeader = document.querySelector(`th[data-column="${this.tableSortState.column}"] .sort-indicator`);
            if (activeHeader) {
                activeHeader.className = `sort-indicator ${this.tableSortState.direction}`;
            }
        }
    }

    toggleTableView(show) {
        this.showTable = show;
        
        // Save preference to localStorage
        localStorage.setItem('noaa-show-table', show.toString());
        
        // Update visibility
        this.updateTableVisibility();
        
        // If showing table and we have data, populate it
        if (show && this.currentCountryStats) {
            this.populateCountryStatsTable();
        } else if (show) {
            // Load country stats if we don't have them yet
            this.loadCountryStats();
        }
        
        console.log(`Table view toggled: ${show}`);
    }

    updateTableVisibility() {
        const tableContainer = document.getElementById('data-table-container');
        tableContainer.style.display = this.showTable ? 'block' : 'none';
    }

    async populateCountryStatsTable() {
        if (!this.currentCountryStats || !this.showTable) return;

        await this.updateTableHeaderUnits();

        const tableBody = document.getElementById('data-table-body');
        const tableInfo = document.getElementById('table-info');
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Update table info
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;
        const country = document.getElementById('country-select').value;
        const state = document.getElementById('state-select').value;
        
        let filterText = `${year} ${element} - Country Statistics (Max & Min Values)`;
        if (country) filterText += ` • ${country}`;
        if (state) filterText += ` • ${state}`;
        if (this.heatmapDateRange) {
            filterText += ` • ${this.heatmapDateRange.start.toISOString().slice(0, 10)} to ${this.heatmapDateRange.end.toISOString().slice(0, 10)}`;
        }
        
        tableInfo.textContent = `${this.currentCountryStats.length} countries • ${filterText}`;
        
        // Sort data if needed
        const sortedData = this.sortTableData([...this.currentCountryStats]);
        
        // Populate table rows
        sortedData.forEach(row => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #eee';
            
            // Country name
            const countryCell = document.createElement('td');
            countryCell.style.padding = '6px 8px';
            countryCell.style.fontWeight = 'bold';
            countryCell.textContent = row.country;
            tr.appendChild(countryCell);
            
            // Max value (formatted)
            const maxValueCell = document.createElement('td');
            maxValueCell.style.padding = '6px 8px';
            maxValueCell.style.textAlign = 'right';
            maxValueCell.style.fontWeight = 'bold';
            maxValueCell.style.color = '#d63031';
            maxValueCell.textContent = this.formatValue(row.maxValue, element);
            tr.appendChild(maxValueCell);
            
            // Max station name (with ID as tooltip)
            const maxStationCell = document.createElement('td');
            maxStationCell.style.padding = '6px 8px';
            maxStationCell.textContent = row.maxStationName;
            maxStationCell.title = `Station ID: ${row.maxStationId} • Date: ${this.formatDate(row.maxDate)}`;
            tr.appendChild(maxStationCell);
            
            // Min value (formatted)
            const minValueCell = document.createElement('td');
            minValueCell.style.padding = '6px 8px';
            minValueCell.style.textAlign = 'right';
            minValueCell.style.fontWeight = 'bold';
            minValueCell.style.color = '#0984e3';
            minValueCell.textContent = this.formatValue(row.minValue, element);
            tr.appendChild(minValueCell);
            
            // Min station name (with ID as tooltip)
            const minStationCell = document.createElement('td');
            minStationCell.style.padding = '6px 8px';
            minStationCell.textContent = row.minStationName;
            minStationCell.title = `Station ID: ${row.minStationId} • Date: ${this.formatDate(row.minDate)}`;
            tr.appendChild(minStationCell);
            
            // Max date
            const maxDateCell = document.createElement('td');
            maxDateCell.style.padding = '6px 8px';
            maxDateCell.style.textAlign = 'center';
            maxDateCell.style.fontSize = '12px';
            maxDateCell.textContent = this.formatDate(row.maxDate);
            tr.appendChild(maxDateCell);
            
            tableBody.appendChild(tr);
        });
        
        console.log(`Country stats table populated with ${sortedData.length} countries, sorted by ${this.tableSortState.column || 'default'}`);
    }

    sortTableData(data) {
        if (!this.tableSortState.column || !this.tableSortState.direction) {
            return data; // No sorting
        }

        return data.sort((a, b) => {
            let valueA, valueB;

            switch (this.tableSortState.column) {
                case 'country':
                    valueA = a.country.toLowerCase();
                    valueB = b.country.toLowerCase();
                    break;
                case 'maxStation':
                    valueA = a.maxStationName.toLowerCase();
                    valueB = b.maxStationName.toLowerCase();
                    break;
                case 'maxValue':
                    valueA = a.maxValue;
                    valueB = b.maxValue;
                    break;
                case 'minStation':
                    valueA = a.minStationName.toLowerCase();
                    valueB = b.minStationName.toLowerCase();
                    break;
                case 'minValue':
                    valueA = a.minValue;
                    valueB = b.minValue;
                    break;
                case 'maxDate':
                    valueA = new Date(this.formatDate(a.maxDate));
                    valueB = new Date(this.formatDate(b.maxDate));
                    break;
                default:
                    return 0;
            }

            let comparison = 0;
            if (valueA > valueB) {
                comparison = 1;
            } else if (valueA < valueB) {
                comparison = -1;
            }

            return this.tableSortState.direction === 'desc' ? -comparison : comparison;
        });
    }

    formatDate(dateStr) {
        // Convert YYYYMMDD to YYYY-MM-DD
        if (dateStr.length === 8) {
            return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        }
        return dateStr;
    }

    formatValue(value, element) {
        if (value === null || value === undefined) return 'N/A';
        
        // Convert and format based on element type
        const convertedValue = this.convertValue(value, element);
        
        if (element.startsWith('T')) { // Temperature
            return `${convertedValue.toFixed(1)}°C`;
        } else if (element.startsWith('P')) { // Precipitation
            return `${convertedValue.toFixed(1)} mm`;
        } else {
            return convertedValue.toFixed(2);
        }
    }

    restoreBasicFiltersFromURL() {
        const urlParams = new URLSearchParams(window.location.search);

        // Restore simple select values (not geographic filters - those are handled in populate methods)
        document.getElementById('year-select').value = urlParams.get('year') || this.availableYears[0] || '2024';
        document.getElementById('element-select').value = urlParams.get('element') || 'TMAX';
        document.getElementById('chart-type').value = urlParams.get('chartType') || 'line';

        const startDate = urlParams.get('startDate');
        const endDate = urlParams.get('endDate');

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // Basic validation
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                this.heatmapDateRange = { start, end };

                // We need to set heatmapZoom to something non-null for the 'Reset' button to appear.
                // The actual values don't matter as much as the presence of the object.
                // We can derive them from the dates.
                this.heatmapZoom = {
                    startDay: start.getDate(),
                    endDay: end.getDate(),
                    startMonth: start.getMonth() + 1,
                    endMonth: end.getMonth() + 1
                };
            }
        }
    }

    updateURLParams() {
        const params = new URLSearchParams();
        params.set('year', document.getElementById('year-select').value);
        params.set('element', document.getElementById('element-select').value);
        params.set('chartType', document.getElementById('chart-type').value);

        const country = document.getElementById('country-select').value;
        if (country) params.set('country', country);

        const state = document.getElementById('state-select').value;
        if (state) params.set('state', state);

        const station = document.getElementById('station-select').value;
        if (station) params.set('station', station);

        if (this.heatmapDateRange) {
            params.set('startDate', this.heatmapDateRange.start.toISOString().slice(0, 10));
            params.set('endDate', this.heatmapDateRange.end.toISOString().slice(0, 10));
        }

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({}, '', newUrl);
    }

    async loadDefaultData() {
        // Load data with default selections on page load
        try {
            this.showLoadingDelayed('loading');
            await this.loadAndVisualizeData();
            // Update URL with current filter state
            // this.updateURLParams();
        } catch (error) {
            console.error('Error loading default data:', error);
            this.showErrorMessage('Click "🔄 Refresh" to load weather data');
        } finally {
            this.hideLoadingImmediate('loading');
        }
    }

    showErrorMessage(message) {
        this.g.selectAll('*').remove();
        this.g.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height / 2)
            .attr('text-anchor', 'middle')
            .text(message)
            .style('font-size', '16px')
            .style('fill', '#7f8c8d');
    }

    setupChart() {
        const container = d3.select('#chart-container');

        this.margin = { top: 20, right: 80, bottom: 70, left: 80 };

        // Create SVG elements without setting dimensions initially
        this.svg = container.append('svg');
        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.tooltip = d3.select('#tooltip');

        // Initialize zoom state
        this.zoomExtent = null;
        this.originalData = null;
        this.heatmapZoom = null;
    }

    setupWorldMap() {
        const container = d3.select('#map-container');
        
        // Create SVG elements without setting dimensions initially
        this.mapSvg = container.append('svg');
        this.mapG = this.mapSvg.append('g');

        // Initialize world map data
        this.worldData = null;
        this.loadWorldMap();
    }

    async loadWorldMap() {
        try {
            // Load world topology data from a CDN
            const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
            if (!response.ok) {
                throw new Error('Failed to load world map data');
            }
            this.worldData = await response.json();
            console.log('World map data loaded successfully');
        } catch (error) {
            console.error('Error loading world map:', error);
            // Show error message in map container
            this.mapG.append('text')
                .attr('x', this.mapWidth / 2)
                .attr('y', this.mapHeight / 2)
                .attr('text-anchor', 'middle')
                .text('Unable to load world map')
                .style('font-size', '16px')
                .style('fill', '#7f8c8d');
        }
    }

    async loadAndVisualizeData(forceRedownload = false) {
        // Clear any error message or overlay before starting a new load
        this.clearErrorMessage && this.clearErrorMessage();
        if (this.g && this.g.selectAll) {
            this.g.selectAll('*').remove();
        }
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;
        const chartType = document.getElementById('chart-type').value;
        const station = document.getElementById('station-select').value;
        // Do not show loading UI yet; let queryWeatherData decide
        const refreshBtn = document.getElementById('load-data');
        const originalBtnText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        refreshBtn.disabled = true;
        let usedImmediate = false;
        try {
            // Pass a callback to queryWeatherData to control loading UI
            const data = await this.queryWeatherData(year, element, station, (isDownloading) => {
                if (isDownloading) {
                    this.showLoadingImmediate('loading');
                    this.setLoadingMessage(`Downloading data for YEAR=${year}, ELEMENT=${element}...`);
                    usedImmediate = true;
                } else {
                    this.showLoadingDelayed('loading');
                    this.setLoadingMessage('Loading weather data...');
                }
            }, forceRedownload);
            this.currentData = data;
            this.originalData = [...data];
            this.zoomExtent = null;
            this.visualizeData(data, chartType, element);
            if (this.showTable) {
                await this.loadCountryStats();
            }
            await this.loadAndVisualizeWorldMap(year, element);
        } catch (error) {
            console.error('Error loading data:', error);
            this.setLoadingMessage('Error loading data. Please try again.');
            alert('Error loading data. Please try again.');
        } finally {
            this.hideLoadingImmediate('loading');
            refreshBtn.innerHTML = originalBtnText;
            refreshBtn.disabled = false;
        }
    }

    async queryWeatherData(year, element, station = null, loadingUICallback, forceRedownload = false) {
        try {
            const params = new URLSearchParams({ limit: 5000 });
            if (station) {
                params.append('station', station);
            }
            // Add geographic filters
            const country = document.getElementById('country-select').value;
            const state = document.getElementById('state-select').value;
            if (country) {
                params.append('country', country);
            }
            if (state) {
                params.append('state', state);
            }
            if (forceRedownload) {
                params.append('forceRedownload', '1');
            }
            const response = await fetch(`/api/weather/${year}/${element}?${params}`);
            // Decide which loading UI to show based on header
            if (loadingUICallback) {
                const isDownloading = response.headers.get('x-noaa-download') === 'true';
                loadingUICallback(isDownloading);
            }
            if (!response.ok) {
                throw new Error('Failed to fetch weather data');
            }
            const data = await response.json();
            return data.map(row => ({
                ...row,
                date: this.parseDate(row.date),
                value: row.value
            }));
        } catch (error) {
            throw new Error(`Failed to load weather data: ${error.message}`);
        }
    }

    async loadAndVisualizeWorldMap(year, element) {
        if (!this.worldData) {
            console.log('World map data not yet loaded');
            return;
        }

        try {
            this.showLoadingDelayed('map-loading');
            
            const country = document.getElementById('country-select').value;
            const state = document.getElementById('state-select').value;
            
            const params = new URLSearchParams();
            if (country) params.append('country', country);
            if (state) params.append('state', state);
            
            if (this.heatmapDateRange) {
                params.append('startDate', this.heatmapDateRange.start.toISOString().slice(0, 10));
                params.append('endDate', this.heatmapDateRange.end.toISOString().slice(0, 10));
            }
            
            const response = await fetch(`/api/world-data/${year}/${element}?${params}`);
            if (!response.ok) {
                throw new Error('Failed to fetch world data');
            }
            
            const worldData = await response.json();
            this.currentWorldData = worldData; // Store for redraws
            this.createWorldMap(worldData, element, country, state);
            
            // Load country stats for table if visible (since table represents world map data)
            if (this.showTable) {
                await this.loadCountryStats();
            }
        } catch (error) {
            console.error('Error loading world map data:', error);
            this.mapG.selectAll('*').remove();
            this.mapG.append('text')
                .attr('x', this.mapWidth / 2)
                .attr('y', this.mapHeight / 2)
                .attr('text-anchor', 'middle')
                .text('Error loading world map data')
                .style('font-size', '16px')
                .style('fill', '#e74c3c');
        } finally {
            this.hideLoadingImmediate('map-loading');
        }
    }

    // Utility to normalize country names between map and data
    normalizeCountryName(name) {
        const mapping = {
            "United States of America": "United States",
            "Russia": "Russian Federation",
            "Czechia": "Czech Republic",
            "South Korea": "Korea, Republic of",
            "North Korea": "Korea, Democratic People's Republic of",
            "Iran": "Iran, Islamic Republic of",
            "Vietnam": "Viet Nam",
            "Syria": "Syrian Arab Republic",
            "Laos": "Lao People's Democratic Republic",
            "Moldova": "Moldova, Republic of",
            "Venezuela": "Venezuela, Bolivarian Republic of",
            "Tanzania": "Tanzania, United Republic of",
            "Bolivia": "Bolivia, Plurinational State of",
            "Brunei": "Brunei Darussalam",
            "Ivory Coast": "Côte d'Ivoire",
            "Congo": "Congo, Republic of the",
            "Democratic Republic of the Congo": "Congo, Democratic Republic of the",
            // Add more as needed
        };
        return mapping[name] || name;
    }

    createWorldMap(worldData, element, selectedCountry, selectedState) {
        // Always clear the map container and append a fresh SVG and group
        const container = d3.select('#map-container');
        container.selectAll('svg').remove();
        const containerRect = container.node().getBoundingClientRect();
        this.mapWidth = containerRect.width;
        this.mapHeight = containerRect.height;

        this.mapSvg = container.append('svg')
            .attr('width', '100%')
            .attr('height', '100%');
        this.mapG = this.mapSvg.append('g');

        // Get countries feature
        const countries = topojson.feature(this.worldData, this.worldData.objects.countries);

        // Create projection and path generator
        const projection = d3.geoNaturalEarth1();
        const margin = {top: 40, right: 20, bottom: 60, left: 20};
        projection.fitExtent(
            [[margin.left, margin.top], [this.mapWidth - margin.right, this.mapHeight - margin.bottom]],
            countries
        );
        const path = d3.geoPath().projection(projection);

        // Create data lookup for countries and states
        const dataLookup = new Map();
        const stateData = new Map();
        worldData.forEach(d => {
            if (d.type === 'country') {
                dataLookup.set(d.name, d.value);
            } else if (d.type === 'state') {
                stateData.set(d.name, d.value);
                if (d.parent) {
                    dataLookup.set(d.parent, d.value);
                }
            }
        });

        // Get data extent for color scale (combine country and state data)
        const allValues = [...Array.from(dataLookup.values()), ...Array.from(stateData.values())];
        const dataExtent = d3.extent(allValues);
        const colorScale = d3.scaleSequential()
            .interpolator(element === 'PRCP' ? d3.interpolateBlues : d3.interpolateRdYlBu)
            .domain(dataExtent);

        this.mapG.selectAll('.country')
            .data(countries.features)
            .enter().append('path')
            .attr('class', 'country')
            .attr('d', path)
            .attr('fill', d => {
                const countryName = d.properties.NAME || d.properties.name;
                const normalizedCountryName = this.normalizeCountryName(countryName);
                // If a country is selected, dim other countries
                if (selectedCountry && normalizedCountryName !== selectedCountry) {
                    return '#e9ecef'; // Light gray for non-selected countries
                }
                const value = dataLookup.get(normalizedCountryName);
                return value !== undefined ? colorScale(value) : '#f0f0f0';
            })
            .attr('stroke', d => {
                const countryName = d.properties.NAME || d.properties.name;
                const normalizedCountryName = this.normalizeCountryName(countryName);
                // Highlight the selected country with a thicker border
                return (selectedCountry && normalizedCountryName === selectedCountry) ? '#333' : '#666';
            })
            .attr('stroke-width', d => {
                const countryName = d.properties.NAME || d.properties.name;
                const normalizedCountryName = this.normalizeCountryName(countryName);
                // Thicker border for selected country
                return (selectedCountry && normalizedCountryName === selectedCountry) ? 2 : 0.5;
            })
            .style('cursor', 'pointer')
            .on('click', (_, d) => {
                const countryName = d.properties.NAME || d.properties.name;
                const normalizedCountryName = this.normalizeCountryName(countryName);
                const countrySelect = document.getElementById('country-select');
                const stateSelect = document.getElementById('state-select');

                if (countrySelect.value === normalizedCountryName) {
                    // If clicking the selected country, deselect it
                    countrySelect.value = '';
                } else {
                    // Otherwise, try to select the new country
                    const countryExists = Array.from(countrySelect.options).some(opt => opt.value === normalizedCountryName);
                    if (countryExists) {
                        countrySelect.value = normalizedCountryName;
                    } else {
                        console.warn(`Country "${normalizedCountryName}" not available for the current filters.`);
                        return; // Exit if country is not valid
                    }
                }

                stateSelect.value = ""; // Reset state filter

                // Programmatically trigger the change event to reload data
                countrySelect.dispatchEvent(new Event('change'));
            })
            .on('mouseover', (event, d) => {
                const countryName = d.properties.NAME || d.properties.name;
                const normalizedCountryName = this.normalizeCountryName(countryName);
                // Don't show tooltip for dimmed countries when a country is selected
                if (selectedCountry && normalizedCountryName !== selectedCountry) {
                    return;
                }
                const value = dataLookup.get(normalizedCountryName);
                const tooltipContent = `
                    <strong>${countryName}</strong><br/>
                    ${this.getValueLabel(element)}: ${value !== undefined ? value.toFixed(2) : 'No data'}
                `;
                this.tooltip
                    .style('opacity', 1)
                    .html(tooltipContent)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                this.tooltip.style('opacity', 0);
            });

        // Add title
        let titleText = `Average ${this.getValueLabel(element)} - ${document.getElementById('year-select').value}`;
        if (selectedState && selectedCountry) {
            titleText += ` (${selectedState}, ${selectedCountry})`;
        } else if (selectedCountry) {
            titleText += ` (${selectedCountry})`;
        }
        
        this.mapG.append('text')
            .attr('x', this.mapWidth / 2)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('font-weight', 'bold')
            .style('fill', '#2c3e50')
            .text(titleText);

        // Add a reset button if a country or state is selected
        if (selectedCountry || selectedState) {
            const resetButton = this.mapG.append('g')
                .attr('class', 'map-reset-button')
                .attr('transform', `translate(${this.mapWidth - 90}, 10)`)
                .style('cursor', 'pointer')
                .on('click', () => {
                    document.getElementById('country-select').value = '';
                    document.getElementById('state-select').value = '';
                    // Trigger change on country select to reload data
                    document.getElementById('country-select').dispatchEvent(new Event('change'));
                });

            resetButton.append('rect')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', 80)
                .attr('height', 25)
                .attr('rx', 4)
                .attr('fill', '#6c757d')
                .attr('stroke', '#5a6268');

            resetButton.append('text')
                .attr('x', 40)
                .attr('y', 17)
                .attr('text-anchor', 'middle')
                .attr('fill', 'white')
                .style('font-size', '12px')
                .text('Reset Filter');
        }

        // Add legend
        this.addMapLegend(colorScale, element, dataExtent);
    }

    showStateDataDisplay(worldData, element, selectedCountry, selectedState) {
        // Find the state data
        const stateInfo = worldData.find(d => d.type === 'state' && d.name === selectedState);
        
        if (!stateInfo) {
            // No data available for this state
            this.mapG.append('text')
                .attr('x', this.mapWidth / 2)
                .attr('y', this.mapHeight / 2)
                .attr('text-anchor', 'middle')
                .style('font-size', '18px')
                .style('fill', '#7f8c8d')
                .text(`No data available for ${selectedState}, ${selectedCountry}`);
            return;
        }

        // Show state data in a centered display
        const centerX = this.mapWidth / 2;
        const centerY = this.mapHeight / 2;

        // Background card
        this.mapG.append('rect')
            .attr('x', centerX - 200)
            .attr('y', centerY - 100)
            .attr('width', 400)
            .attr('height', 200)
            .attr('fill', '#f8f9fa')
            .attr('stroke', '#dee2e6')
            .attr('stroke-width', 2)
            .attr('rx', 8);

        // Title
        this.mapG.append('text')
            .attr('x', centerX)
            .attr('y', centerY - 60)
            .attr('text-anchor', 'middle')
            .style('font-size', '20px')
            .style('font-weight', 'bold')
            .style('fill', '#2c3e50')
            .text(`${selectedState}, ${selectedCountry}`);

        // Year and element
        this.mapG.append('text')
            .attr('x', centerX)
            .attr('y', centerY - 30)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', '#6c757d')
            .text(`${document.getElementById('year-select').value} • ${this.getValueLabel(element)}`);

        // Main value
        this.mapG.append('text')
            .attr('x', centerX)
            .attr('y', centerY + 10)
            .attr('text-anchor', 'middle')
            .style('font-size', '36px')
            .style('font-weight', 'bold')
            .style('fill', '#007bff')
            .text(stateInfo.value.toFixed(2));

        // Data points info
        this.mapG.append('text')
            .attr('x', centerX)
            .attr('y', centerY + 40)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#6c757d')
            .text(`Based on ${stateInfo.dataPoints.toLocaleString()} data points`);

        // Note about focusing on state
        this.mapG.append('text')
            .attr('x', centerX)
            .attr('y', centerY + 70)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('fill', '#868e96')
            .text('Data filtered to selected state only');
    }

    addMapLegend(colorScale, element, dataExtent) {
        const legendWidth = 300;
        const legendHeight = 20;
        const legendX = this.mapWidth - legendWidth - 20;
        const legendY = this.mapHeight - 40;

        // Create gradient
        const defs = this.mapSvg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'map-legend-gradient')
            .attr('x1', '0%')
            .attr('x2', '100%');

        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const value = dataExtent[0] + (dataExtent[1] - dataExtent[0]) * (i / steps);
            gradient.append('stop')
                .attr('offset', `${(i / steps) * 100}%`)
                .attr('stop-color', colorScale(value));
        }

        // Add legend rectangle
        this.mapG.append('rect')
            .attr('x', legendX)
            .attr('y', legendY)
            .attr('width', legendWidth)
            .attr('height', legendHeight)
            .style('fill', 'url(#map-legend-gradient)')
            .style('stroke', '#666')
            .style('stroke-width', 1);

        // Add legend labels
        this.mapG.append('text')
            .attr('x', legendX)
            .attr('y', legendY - 5)
            .style('font-size', '12px')
            .style('fill', '#2c3e50')
            .text(dataExtent[0].toFixed(1));

        this.mapG.append('text')
            .attr('x', legendX + legendWidth)
            .attr('y', legendY - 5)
            .attr('text-anchor', 'end')
            .style('font-size', '12px')
            .style('fill', '#2c3e50')
            .text(dataExtent[1].toFixed(1));

        this.mapG.append('text')
            .attr('x', legendX + legendWidth / 2)
            .attr('y', legendY - 5)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#2c3e50')
            .text(this.getValueLabel(element));
    }

    parseDate(dateString) {
        // Convert YYYYMMDD to Date object
        const year = parseInt(dateString.substring(0, 4));
        const month = parseInt(dateString.substring(4, 6)) - 1; // Month is 0-indexed
        const day = parseInt(dateString.substring(6, 8));
        return new Date(year, month, day);
    }

    convertValue(value, element) {
        if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
            return value / 10.0;
        }
        if (element === 'PRCP') {
            return value / 10.0;
        }
        return value;
    }

    getValueLabel(element) {
        const labels = {
            'TMAX': 'Temperature (°C)',
            'TMIN': 'Temperature (°C)',
            'TAVG': 'Temperature (°C)',
            'PRCP': 'Precipitation (mm)'
        };
        return labels[element] || 'Value';
    }

    visualizeData(data, chartType, element) {
        // JIT (Just-In-Time) sizing: get dimensions right before drawing
        const container = d3.select('#chart-container');
        const containerRect = container.node().getBoundingClientRect();
        
        this.width = containerRect.width - this.margin.left - this.margin.right;
        this.height = containerRect.height - this.margin.top - this.margin.bottom;
        
        this.svg
            .attr('width', '100%')
            .attr('height', '100%');

        // Immediately clear all existing elements to prevent overlap
        this.g.selectAll('*').remove();

        // Show/hide zoom instructions based on chart type
        const instructions = document.getElementById('zoom-instructions');
        if (chartType === 'line') {
            instructions.style.display = 'block';
            instructions.textContent = 'Drag to select a time range to zoom in';
        } else if (chartType === 'heatmap') {
            instructions.style.display = 'block';
            instructions.textContent = 'Drag to select a region to zoom into a specific time period';
        } else {
            instructions.style.display = 'none';
        }

        if (!data || data.length === 0) {
            this.g.append('text')
                .attr('x', this.width / 2)
                .attr('y', this.height / 2)
                .attr('text-anchor', 'middle')
                .text('No data available for the selected parameters')
                .style('font-size', '16px')
                .style('fill', '#7f8c8d')
                .style('opacity', 0)
                .transition()
                .duration(300)
                .style('opacity', 1);
            return;
        }

        // Create new chart elements
        switch (chartType) {
        case 'line':
            this.createLineChart(data, element);
            break;
        case 'bar':
            this.createBarChart(data, element);
            break;
        case 'heatmap':
            this.createHeatMap(data, element);
            break;
        }

        // Fade in new elements smoothly
        this.g.selectAll('*')
            .style('opacity', 0)
            .transition()
            .duration(400)
            .style('opacity', 1);
    }

    createLineChart(data, element) {
        const aggregatedData = this.aggregateDataByDate(data);

        // Apply zoom filter if exists
        const filteredData = this.zoomExtent ?
            aggregatedData.filter(d => d.date >= this.zoomExtent[0] && d.date <= this.zoomExtent[1]) :
            aggregatedData;

        // Update currentData to reflect filtered data for table view
        if (this.zoomExtent) {
            // Convert aggregated data back to raw format for table display
            const filteredRawData = data.filter(d => d.date >= this.zoomExtent[0] && d.date <= this.zoomExtent[1]);
            this.currentData = filteredRawData;
        } else {
            this.currentData = data;
        }

        // Update table if visible
        if (this.showTable) {
            this.loadCountryStats();
        }

        const x = d3.scaleTime()
            .domain(this.zoomExtent || d3.extent(aggregatedData, d => d.date))
            .range([0, this.width]);

        const y = d3.scaleLinear()
            .domain(d3.extent(filteredData, d => d.avgValue))
            .nice()
            .range([this.height, 0]);

        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.avgValue))
            .curve(d3.curveMonotoneX);

        // Add x-axis
        this.g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d')));

        // Add y-axis
        this.g.append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(y));

        // Add line path
        this.g.append('path')
            .datum(filteredData)
            .attr('class', 'line-path')
            .attr('fill', 'none')
            .attr('stroke', '#3498db')
            .attr('stroke-width', 2)
            .attr('d', line);

        // Add brush for zoom selection (add before data points so it doesn't interfere with tooltips)
        this.addBrushZoom(x, element);

        // Add data points (after brush so they receive mouse events)
        const circles = this.g.selectAll('.dot')
            .data(filteredData)
            .enter().append('circle')
            .attr('class', 'dot')
            .attr('cx', d => x(d.date))
            .attr('cy', d => y(d.avgValue))
            .attr('r', 3)
            .attr('fill', '#3498db')
            .style('pointer-events', 'all'); // Ensure they can receive mouse events

        const stationId = document.getElementById('station-select').value;
        const stationInfo = this.availableStations.find(s => s.id === stationId);
        const stationName = stationInfo ? stationInfo.name : stationId;

        const tooltipText = stationId ?
            d => `Date: ${d3.timeFormat('%Y-%m-%d')(d.date)}<br/>Station: ${stationName}<br/>${this.getValueLabel(element)}: ${d.avgValue.toFixed(2)}` :
            d => `Date: ${d3.timeFormat('%Y-%m-%d')(d.date)}<br/>Average ${this.getValueLabel(element)}: ${d.avgValue.toFixed(2)}<br/>Stations: ${d.station_count || 'N/A'}`;

        this.addTooltip(circles, tooltipText);

        this.addAxesLabels('Date', this.getValueLabel(element));

        // Add zoom controls
        this.addZoomControls(element);
    }

    addHeatmapBrush(xScale, yScale, monthNames, originalData, element, heatmapData) {
        const brush = d3.brush()
            .extent([[0, 0], [this.width, this.height]]);

        const brushGroup = this.g.append('g')
            .attr('class', 'heatmap-brush')
            .call(brush);

        // Style the brush overlay to allow both brushing and tooltips
        brushGroup.selectAll('.overlay')
            .style('pointer-events', 'all')
            .style('fill', 'transparent')
            .style('cursor', 'crosshair');

        brushGroup.selectAll('.selection')
            .style('fill', 'rgba(0, 123, 255, 0.2)')
            .style('stroke', '#007bff')
            .style('stroke-width', 2);

        brushGroup
            .on('mousemove', (event) => {
                if (this.isBrushing) return;

                const [mx, my] = d3.pointer(event);
                const dayDomain = xScale.domain();
                const monthDomain = yScale.domain();

                const dayIndex = Math.floor(mx / xScale.step());
                const monthIndex = Math.floor(my / yScale.step());

                if (dayIndex < 0 || dayIndex >= dayDomain.length || monthIndex < 0 || monthIndex >= monthDomain.length) {
                    this.tooltip.style('opacity', 0);
                    return;
                }

                const day = dayDomain[dayIndex];
                const monthName = monthDomain[monthIndex];
                const month = monthNames.indexOf(monthName) + 1;
                
                const d = heatmapData.find(p => p.day === day && p.month === month);

                if (d) {
                    this.tooltip
                        .style('opacity', 1)
                        .html(`${monthName} ${d.day}<br/>${this.getValueLabel(element)}: ${d.value ? d.value.toFixed(2) : 'No data'}`)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 10) + 'px');
                } else {
                    this.tooltip.style('opacity', 0);
                }
            })
            .on('mouseout', () => {
                this.tooltip.style('opacity', 0);
            });

        brush.on('start', () => {
            this.isBrushing = true;
            this.tooltip.style('opacity', 0);
        });

        brush.on('end', (event) => {
            this.isBrushing = false;

            if (!event.selection) return;

            const [[x0, y0], [x1, y1]] = event.selection;

            // Convert pixel coordinates to day/month values using scaleBand domain
            const dayDomain = xScale.domain();
            const monthDomain = yScale.domain();

            const startDayIndex = Math.max(0, Math.floor(x0 / xScale.step()));
            const endDayIndex = Math.min(dayDomain.length - 1, Math.floor(x1 / xScale.step()));
            const startMonthIndex = Math.max(0, Math.floor(y0 / yScale.step()));
            const endMonthIndex = Math.min(monthDomain.length - 1, Math.floor(y1 / yScale.step()));

            const startDay = dayDomain[startDayIndex];
            const endDay = dayDomain[endDayIndex];
            const startMonthName = monthDomain[startMonthIndex];
            const endMonthName = monthDomain[endMonthIndex];

            // Convert month names to month numbers (1-12)
            const monthNamesList = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const startMonth = monthNamesList.indexOf(startMonthName) + 1;
            const endMonth = monthNamesList.indexOf(endMonthName) + 1;
            const year = document.getElementById('year-select').value;

            // Store zoom state
            this.heatmapZoom = {
                startDay,
                endDay,
                startMonth,
                endMonth
            };

            this.heatmapDateRange = {
                start: new Date(year, startMonth - 1, startDay),
                end: new Date(year, endMonth - 1, endDay)
            };

            // Clear the brush selection
            this.g.select('.heatmap-brush').call(brush.move, null);

            // Re-render the heatmap with the new zoom extent
            this.g.selectAll('*').remove();
            this.createHeatMap(originalData, element);

            // Reload world map data with the new date range
            this.loadAndVisualizeWorldMap(year, element);
            this.updateURLParams();
        });
    }

    addHeatmapZoomControls(originalData, element) {
        // Add zoom reset button if zoomed
        if (this.heatmapZoom) {
            const resetButton = this.g.append('g')
                .attr('class', 'heatmap-zoom-reset')
                .attr('transform', `translate(${this.width - 80}, 10)`)
                .style('cursor', 'pointer')
                .on('click', () => {
                    this.heatmapZoom = null;
                    this.heatmapDateRange = null;
                    this.g.selectAll('*').remove();
                    this.createHeatMap(originalData, element);
                    // Also reload the world map to reset its date filter
                    const year = document.getElementById('year-select').value;
                    this.loadAndVisualizeWorldMap(year, element);
                    this.updateURLParams();
                });

            resetButton.append('rect')
                .attr('width', 70)
                .attr('height', 25)
                .attr('fill', '#e74c3c')
                .attr('rx', 3);

            resetButton.append('text')
                .attr('x', 35)
                .attr('y', 17)
                .attr('text-anchor', 'middle')
                .attr('fill', 'white')
                .style('font-size', '12px')
                .text('Reset Zoom');
        }
    }

    createBarChart(data, element) {
        const monthlyData = this.aggregateDataByMonth(data);

        // Update currentData for table view
        this.currentData = data;

        // Update table if visible
        if (this.showTable) {
            this.loadCountryStats();
        }

        const x = d3.scaleBand()
            .domain(monthlyData.map(d => d.month))
            .range([0, this.width])
            .padding(0.1);

        const y = d3.scaleLinear()
            .domain([0, d3.max(monthlyData, d => d.avgValue)])
            .nice()
            .range([this.height, 0]);

        this.g.append('g')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(x));

        this.g.append('g')
            .call(d3.axisLeft(y));

        const bars = this.g.selectAll('.bar')
            .data(monthlyData)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d.month))
            .attr('width', x.bandwidth())
            .attr('y', d => y(d.avgValue))
            .attr('height', d => this.height - y(d.avgValue))
            .attr('fill', '#e74c3c');

        const stationId = document.getElementById('station-select').value;
        const stationInfo = this.availableStations.find(s => s.id === stationId);
        const stationName = stationInfo ? stationInfo.name : stationId;

        const barTooltipText = stationId ?
            d => `Month: ${d.monthName}<br/>Station: ${stationName}<br/>${this.getValueLabel(element)}: ${d.avgValue.toFixed(2)}<br/>Data Points: ${d.count}` :
            d => `Month: ${d.monthName}<br/>Average ${this.getValueLabel(element)}: ${d.avgValue.toFixed(2)}<br/>Data Points: ${d.count}`;

        this.addTooltip(bars, barTooltipText);

        this.addAxesLabels('Month', this.getValueLabel(element));
    }

    createHeatMap(data, element) {
        const heatmapData = this.prepareHeatmapData(data);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const days = Array.from({ length: 31 }, (_, i) => i + 1);

        // Apply zoom filter if exists
        const filteredData = this.heatmapZoom ?
            heatmapData.filter(d =>
                d.month >= this.heatmapZoom.startMonth && d.month <= this.heatmapZoom.endMonth &&
                d.day >= this.heatmapZoom.startDay && d.day <= this.heatmapZoom.endDay
            ) : heatmapData;

        // Update currentData to reflect filtered data for table view
        if (this.heatmapDateRange) {
            // Filter raw data based on heatmap date range
            const filteredRawData = data.filter(d => 
                d.date >= this.heatmapDateRange.start && d.date <= this.heatmapDateRange.end
            );
            this.currentData = filteredRawData;
        } else {
            this.currentData = data;
        }

        // Update table if visible
        if (this.showTable) {
            this.loadCountryStats();
        }

        // Adjust domains based on zoom
        const dayDomain = this.heatmapZoom ?
            Array.from({ length: this.heatmapZoom.endDay - this.heatmapZoom.startDay + 1 },
                (_, i) => i + this.heatmapZoom.startDay) : days;
        const monthDomain = this.heatmapZoom ?
            monthNames.slice(this.heatmapZoom.startMonth - 1, this.heatmapZoom.endMonth) : monthNames;

        const x = d3.scaleBand()
            .domain(dayDomain)
            .range([0, this.width])
            .padding(0.01);

        const y = d3.scaleBand()
            .domain(monthDomain)
            .range([0, this.height])
            .padding(0.01);

        const colorScale = d3.scaleSequential()
            .interpolator(element === 'PRCP' ? d3.interpolateBlues : d3.interpolateRdYlBu)
            .domain(d3.extent(heatmapData, d => d.value));

        // Create a group for heat rectangles that will be above the brush
        const heatGroup = this.g.append('g').attr('class', 'heat-group');
        
        heatGroup.selectAll('.heat-rect')
            .data(filteredData)
            .enter().append('rect')
            .attr('class', 'heat-rect')
            .attr('x', d => x(d.day))
            .attr('y', d => y(monthNames[d.month - 1]))
            .attr('width', x.bandwidth())
            .attr('height', y.bandwidth())
            .attr('fill', d => d.value ? colorScale(d.value) : '#f8f9fa')
            .style('pointer-events', 'none');

        // Add brush for heatmap zoom selection on TOP of the heatmap rectangles
        this.addHeatmapBrush(x, y, monthNames, data, element, heatmapData);

        this.g.append('g')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(x).tickValues(x.domain().filter((_, i) => !(i % 5))));

        this.g.append('g')
            .call(d3.axisLeft(y));

        this.addAxesLabels('Day of Month', 'Month');

        // Add zoom reset button if zoomed
        this.addHeatmapZoomControls(data, element);
    }

    aggregateDataByDate(data) {
        return data.map(d => ({
            date: d.date,
            avgValue: d.value,
            station_count: d.station_count
        })).sort((a, b) => a.date - b.date);
    }

    aggregateDataByMonth(data) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const grouped = d3.group(data, d => d.month);
        return Array.from(grouped, ([month, values]) => ({
            month,
            monthName: monthNames[month - 1],
            avgValue: d3.mean(values, d => d.value),
            count: values.length
        })).sort((a, b) => a.month - b.month);
    }

    prepareHeatmapData(data) {
        const result = [];
        for (let month = 1; month <= 12; month++) {
            for (let day = 1; day <= 31; day++) {
                const dayData = data.filter(d => d.month === month && d.day === day);
                result.push({
                    month,
                    day,
                    value: dayData.length > 0 ? d3.mean(dayData, d => d.value) : null
                });
            }
        }
        return result;
    }

    addTooltip(selection, contentFn) {
        selection
            .on('mouseover', (event, d) => {
                this.tooltip
                    .style('opacity', 1)
                    .html(contentFn(d))
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                this.tooltip.style('opacity', 0);
            });
    }

    addBrushZoom(xScale, element) {
        const brush = d3.brushX()
            .extent([[0, 0], [this.width, this.height]])
            .on('end', (event) => {
                if (!event.selection) return;

                const [x0, x1] = event.selection;
                const startDate = xScale.invert(x0);
                const endDate = xScale.invert(x1);

                this.zoomExtent = [startDate, endDate];

                // Clear the brush selection
                this.g.select('.brush').call(brush.move, null);

                // Re-render the chart with the new zoom extent
                this.g.selectAll('*').remove();
                this.createLineChart(this.originalData, element);
            });

        const brushGroup = this.g.append('g')
            .attr('class', 'brush')
            .call(brush);

        // Make sure brush doesn't interfere with data point hover events
        brushGroup.selectAll('.overlay')
            .style('pointer-events', 'all');

        // Ensure brush handles don't block tooltips
        brushGroup.selectAll('.handle')
            .style('pointer-events', 'all');
    }

    addZoomControls(element) {
        // Add zoom reset button if zoomed
        if (this.zoomExtent) {
            const resetButton = this.g.append('g')
                .attr('class', 'zoom-reset')
                .attr('transform', `translate(${this.width - 80}, 10)`)
                .style('cursor', 'pointer')
                .on('click', () => {
                    this.zoomExtent = null;
                    this.g.selectAll('*').remove();
                    this.createLineChart(this.originalData, element);
                });

            resetButton.append('rect')
                .attr('width', 70)
                .attr('height', 25)
                .attr('fill', '#e74c3c')
                .attr('rx', 3);

            resetButton.append('text')
                .attr('x', 35)
                .attr('y', 17)
                .attr('text-anchor', 'middle')
                .attr('fill', 'white')
                .style('font-size', '12px')
                .text('Reset Zoom');
        }
    }

    addAxesLabels(xLabel, yLabel) {
        this.g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 0 - this.margin.left)
            .attr('x', 0 - (this.height / 2))
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#2c3e50')
            .text(yLabel);

        this.g.append('text')
            .attr('transform', `translate(${this.width / 2}, ${this.height + this.margin.bottom - 10})`)
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#2c3e50')
            .text(xLabel);
    }

    generateCurrentQuery() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;
        const station = document.getElementById('station-select').value;
        const country = document.getElementById('country-select').value;
        const state = document.getElementById('state-select').value;

        if (!year || !element) {
            return 'No query available - please select year and element first';
        }

        // Build geographic filter if needed
        let geoFilter = '';
        if (country || state) {
            geoFilter = `
                AND ID IN (
                    SELECT st.id 
                    FROM read_parquet('data/ghcnd-stations.parquet') st
                    LEFT JOIN read_parquet('data/ghcnd-countries.parquet') c
                        ON SUBSTRING(st.id, 1, 2) = c.s
                    LEFT JOIN read_parquet('data/ghcnd-states.parquet') states
                        ON st.st = states.st
                    WHERE 1=1
                    ${country ? `AND c.name = '${country}'` : ''}
                    ${state ? `AND states.name = '${state}'` : ''}
                )
            `;
        }

        const query = station ? `
SELECT 
    DATE as date,
    CAST(DATA_VALUE AS DOUBLE) as value,
    1 as station_count,
    EXTRACT(MONTH FROM STRPTIME(DATE, '%Y%m%d')) as month,
    EXTRACT(DAY FROM STRPTIME(DATE, '%Y%m%d')) as day,
    EXTRACT(YEAR FROM STRPTIME(DATE, '%Y%m%d')) as year
FROM read_parquet('data/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
WHERE DATA_VALUE IS NOT NULL 
    AND DATA_VALUE != -9999
    AND (Q_FLAG IS NULL OR Q_FLAG != 'X')
    AND ID = '${station}'
    ${geoFilter}
ORDER BY DATE
LIMIT 5000;
        ` : `
WITH daily_averages AS (
    SELECT 
        DATE as date,
        AVG(CAST(DATA_VALUE AS DOUBLE)) as avg_value,
        COUNT(*) as station_count,
        EXTRACT(MONTH FROM STRPTIME(DATE, '%Y%m%d')) as month,
        EXTRACT(DAY FROM STRPTIME(DATE, '%Y%m%d')) as day,
        EXTRACT(YEAR FROM STRPTIME(DATE, '%Y%m%d')) as year
    FROM read_parquet('data/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
    WHERE DATA_VALUE IS NOT NULL 
        AND DATA_VALUE != -9999
        AND (Q_FLAG IS NULL OR Q_FLAG != 'X')
        ${geoFilter}
    GROUP BY DATE
    HAVING COUNT(*) >= 1
)
SELECT 
    date,
    avg_value as value,
    station_count,
    month,
    day,
    year
FROM daily_averages
ORDER BY date
LIMIT 5000;
        `;

        return query.trim();
    }

    generateStationsQuery() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;
        const country = document.getElementById('country-select').value;
        const state = document.getElementById('state-select').value;

        if (!year || !element) {
            return 'No stations query available - please select year and element first';
        }

        // Build geographic filter if needed
        let geoFilter = '';
        if (country || state) {
            geoFilter = `
                AND (
                    ${country ? `c.name = '${country}'` : '1=1'}
                    ${country && state ? ' AND ' : ''}
                    ${state ? `states.name = '${state}'` : ''}
                )
            `;
        }

        const query = `
WITH available_stations AS (
    SELECT DISTINCT ID as station_id
    FROM read_parquet('data/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
    WHERE ID IS NOT NULL
)
SELECT 
    s.station_id,
    COALESCE(st.name, s.station_id) as station_name,
    c.name as country_name,
    states.name as state_name
FROM available_stations s
LEFT JOIN read_parquet('data/ghcnd-stations.parquet') st
    ON s.station_id = st.id
LEFT JOIN read_parquet('data/ghcnd-countries.parquet') c
    ON SUBSTRING(s.station_id, 1, 2) = c.s
LEFT JOIN read_parquet('data/ghcnd-states.parquet') states
    ON st.st = states.st
WHERE st.name IS NOT NULL
    ${geoFilter}
ORDER BY station_name
LIMIT 1000;
        `;

        return query.trim();
    }

    async copyStationsQueryToClipboard() {
        try {
            const query = this.generateStationsQuery();
            await navigator.clipboard.writeText(query);
            
            // Show visual feedback
            const button = document.getElementById('copy-stations-query');
            const originalText = button.textContent;
            button.textContent = '✅ Copied!';
            button.style.backgroundColor = '#27ae60';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.backgroundColor = '';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy stations query: ', err);
            alert('Failed to copy stations query to clipboard');
        }
    }

    setLoadingMessage(msg) {
        const loadingText = document.querySelector('#loading .loading-text');
        if (loadingText) {
            loadingText.textContent = msg;
        }
    }

    // Add a clearErrorMessage method to remove error overlays
    clearErrorMessage() {
        // Remove error message from the chart area
        if (this.g && this.g.selectAll) {
            this.g.selectAll('text').filter(function() {
                return this.textContent && this.textContent.includes('Failed to initialize application') || this.textContent.includes('Click "🔄 Refresh" to load weather data') || this.textContent.includes('Error loading data');
            }).remove();
        }
    }

    showLoadingImmediate(elementId) {
        // Immediately show the loading spinner for the given element
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'block';
        }
        // Also clear any pending delayed loading timers for this element
        if (this.loadingTimers.has(elementId)) {
            clearTimeout(this.loadingTimers.get(elementId));
            this.loadingTimers.delete(elementId);
        }
    }

    async updateTableHeaderUnits() {
        const element = document.getElementById('element-select').value;
        let unit = '';
        try {
            const response = await fetch(`/api/element-unit/${element}`);
            if (response.ok) {
                const data = await response.json();
                unit = data.unit || '';
            }
        } catch (e) {
            // Fallback: leave unit as empty string
        }
        const valueLabel = unit ? `Value (${unit})` : 'Value';

        // Update Max Value header
        const maxValueTh = document.querySelector('th[data-column="maxValue"]');
        if (maxValueTh) {
            maxValueTh.innerHTML = `<i class=\"fas fa-arrow-up\"></i> Max ${valueLabel} <span class=\"sort-indicator\"></span>`;
        }
        // Update Min Value header
        const minValueTh = document.querySelector('th[data-column="minValue"]');
        if (minValueTh) {
            minValueTh.innerHTML = `<i class=\"fas fa-arrow-down\"></i> Min ${valueLabel} <span class=\"sort-indicator\"></span>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NOAAWeatherVisualizer();
});
