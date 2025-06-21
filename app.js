class NOAAWeatherVisualizer {
    constructor() {
        this.currentData = null;
        this.availableYears = [];
        this.availableElements = [];
        this.availableStations = [];
        this.availableLocations = { countries: [], states: [] };

        this.initializeEventListeners();
        this.setupChart();

        // Initialize the application
        this.initialize();
    }

    initializeEventListeners() {
        // Manual refresh button
        document.getElementById('load-data').addEventListener('click', () => {
            this.loadAndVisualizeData();
        });

        // Auto-reload when filters change with debouncing
        let debounceTimer = null;
        const debouncedLoad = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.loadAndVisualizeData();
            }, 150); // Small delay to prevent rapid firing
        };

        document.getElementById('year-select').addEventListener('change', () => {
            this.updateURLParams();
            this.loadAvailableElements();
            this.loadLocations();
            this.loadStations();
            debouncedLoad();
        });
        document.getElementById('element-select').addEventListener('change', () => {
            this.updateURLParams();
            this.loadLocations();
            this.loadStations();
            debouncedLoad();
        });
        document.getElementById('chart-type').addEventListener('change', () => {
            this.updateURLParams();
            debouncedLoad();
        });
        document.getElementById('country-select').addEventListener('change', () => {
            this.updateURLParams();
            this.loadLocations(); // Reload locations to update state dropdown
            this.filterAndLoadStations();
            debouncedLoad();
        });
        document.getElementById('state-select').addEventListener('change', () => {
            this.updateURLParams();
            this.filterAndLoadStations();
            debouncedLoad();
        });
        document.getElementById('station-select').addEventListener('change', () => {
            this.updateURLParams();
            debouncedLoad();
        });
    }

    async initialize() {
        try {
            // Load available years first
            await this.loadAvailableYears();
            // Load available elements for the selected year
            await this.loadAvailableElements();
            // Restore filters from URL
            this.restoreFiltersFromURL();
            // Load locations and stations for default selection
            await this.loadLocations();
            await this.loadStations();
            // Then load default data
            await this.loadDefaultData();
        } catch (error) {
            console.error('Error during initialization:', error);
            this.showErrorMessage('Failed to initialize application. Please refresh the page.');
        }
    }

    async loadAvailableYears() {
        try {
            document.getElementById('loading').style.display = 'block';
            const response = await fetch('/api/years');
            if (!response.ok) {
                throw new Error('Failed to fetch available years');
            }

            this.availableYears = await response.json();
            this.populateYearSelector();

        } catch (error) {
            console.error('Error loading available years:', error);
            // Fallback to hardcoded years if API fails
            this.availableYears = [2024, 2023, 2022, 2021, 2020];
            this.populateYearSelector();
        } finally {
            document.getElementById('loading').style.display = 'none';
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
            const response = await fetch(`/api/elements/${year}`);
            if (!response.ok) {
                throw new Error('Failed to fetch available elements');
            }

            this.availableElements = await response.json();
            this.populateElementSelector();

        } catch (error) {
            console.error('Error loading available elements:', error);
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
            const response = await fetch(`/api/stations/${year}/${element}`);
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

        // Get current geographic filters
        const selectedCountry = document.getElementById('country-select').value;
        const selectedState = document.getElementById('state-select').value;

        // Filter stations based on geographic selections
        const filteredStations = this.availableStations.filter(station => {
            if (selectedCountry && station.country !== selectedCountry) return false;
            if (selectedState && station.state !== selectedState) return false;
            return true;
        });

        filteredStations.forEach(station => {
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

        console.log(`Populated station selector with ${filteredStations.length}/${this.availableStations.length} stations`);
    }

    async loadLocations() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;

        if (!year || !element) return;

        try {
            // Add country parameter if selected
            const country = document.getElementById('country-select').value;
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
            this.populateLocationSelectors();

        } catch (error) {
            console.error('Error loading available locations:', error);
            this.availableLocations = { countries: [], states: [] };
            this.populateLocationSelectors();
        }
    }

    populateLocationSelectors() {
        // Get URL parameters for restoration
        const urlParams = new URLSearchParams(window.location.search);
        const urlCountry = urlParams.get('country');
        const urlState = urlParams.get('state');

        // Populate country selector
        const countrySelect = document.getElementById('country-select');
        const currentCountry = countrySelect.value || urlCountry;
        countrySelect.innerHTML = '<option value="">All Countries</option>';

        this.availableLocations.countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            if (country === currentCountry) option.selected = true;
            countrySelect.appendChild(option);
        });

        // Populate state selector
        const stateSelect = document.getElementById('state-select');
        const currentState = stateSelect.value || urlState;
        stateSelect.innerHTML = '<option value="">All States/Regions</option>';

        this.availableLocations.states.forEach(state => {
            if (state) { // Only add non-null states
                const option = document.createElement('option');
                option.value = state;
                option.textContent = state;
                if (state === currentState) option.selected = true;
                stateSelect.appendChild(option);
            }
        });

        console.log(`Populated location selectors: ${this.availableLocations.countries.length} countries, ${this.availableLocations.states.filter(s => s).length} states`);
    }

    filterAndLoadStations() {
        // Filter stations based on geographic selections
        this.loadStations();
    }

    restoreFiltersFromURL() {
        const urlParams = new URLSearchParams(window.location.search);

        // Restore year
        const year = urlParams.get('year');
        if (year && this.availableYears.includes(parseInt(year))) {
            document.getElementById('year-select').value = year;
        }

        // Restore element
        const element = urlParams.get('element');
        if (element) {
            document.getElementById('element-select').value = element;
        }

        // Restore chart type
        const chartType = urlParams.get('chart');
        if (chartType) {
            document.getElementById('chart-type').value = chartType;
        }

        // Restore country
        const country = urlParams.get('country');
        if (country) {
            document.getElementById('country-select').value = country;
        }

        // Restore state
        const state = urlParams.get('state');
        if (state) {
            document.getElementById('state-select').value = state;
        }

        // Restore station (will be set after stations are loaded)
        this.urlStation = urlParams.get('station');
    }

    updateURLParams() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;
        const chartType = document.getElementById('chart-type').value;
        const country = document.getElementById('country-select').value;
        const state = document.getElementById('state-select').value;
        const station = document.getElementById('station-select').value;

        const params = new URLSearchParams();
        if (year) params.set('year', year);
        if (element) params.set('element', element);
        if (chartType) params.set('chart', chartType);
        if (country) params.set('country', country);
        if (state) params.set('state', state);
        if (station) params.set('station', station);

        const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newURL);
    }

    async loadDefaultData() {
        // Load data with default selections on page load
        try {
            document.getElementById('loading').style.display = 'block';
            await this.loadAndVisualizeData();
            // Update URL with current filter state
            this.updateURLParams();
        } catch (error) {
            console.error('Error loading default data:', error);
            this.showErrorMessage('Click "🔄 Refresh" to load weather data');
        } finally {
            document.getElementById('loading').style.display = 'none';
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
        const containerRect = container.node().getBoundingClientRect();

        this.margin = { top: 20, right: 80, bottom: 70, left: 80 };
        this.width = containerRect.width - this.margin.left - this.margin.right;
        this.height = containerRect.height - this.margin.top - this.margin.bottom;

        this.svg = container.append('svg')
            .attr('width', this.width + this.margin.left + this.margin.right)
            .attr('height', this.height + this.margin.top + this.margin.bottom);

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.tooltip = d3.select('#tooltip');

        // Initialize zoom state
        this.zoomExtent = null;
        this.originalData = null;
    }

    async loadAndVisualizeData() {
        const year = document.getElementById('year-select').value;
        const element = document.getElementById('element-select').value;
        const chartType = document.getElementById('chart-type').value;
        const station = document.getElementById('station-select').value;

        // Clear existing chart immediately to prevent overlaps
        this.g.selectAll('*').remove();

        // Show loading state
        document.getElementById('loading').style.display = 'block';
        const refreshBtn = document.getElementById('load-data');
        const originalBtnText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '⏳ Loading...';
        refreshBtn.disabled = true;

        try {
            const data = await this.queryWeatherData(year, element, station);
            this.currentData = data;
            this.originalData = [...data]; // Store original data for zoom reset
            this.zoomExtent = null; // Reset zoom
            this.visualizeData(data, chartType, element);
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Error loading data. Please try again.');
        } finally {
            // Reset loading state
            document.getElementById('loading').style.display = 'none';
            refreshBtn.innerHTML = originalBtnText;
            refreshBtn.disabled = false;
        }
    }

    async queryWeatherData(year, element, station = null) {
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

            const response = await fetch(`/api/weather/${year}/${element}?${params}`);
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
        // Immediately clear all existing elements to prevent overlap
        this.g.selectAll('*').remove();

        // Show/hide zoom instructions based on chart type
        const instructions = document.getElementById('zoom-instructions');
        instructions.style.display = chartType === 'line' ? 'block' : 'none';

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
        this.addBrushZoom(x, aggregatedData, element);

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

    createBarChart(data, element) {
        const monthlyData = this.aggregateDataByMonth(data);

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

        const x = d3.scaleBand()
            .domain(days)
            .range([0, this.width])
            .padding(0.01);

        const y = d3.scaleBand()
            .domain(monthNames)
            .range([0, this.height])
            .padding(0.01);

        const colorScale = d3.scaleSequential()
            .interpolator(element === 'PRCP' ? d3.interpolateBlues : d3.interpolateRdYlBu)
            .domain(d3.extent(heatmapData, d => d.value));

        this.g.selectAll('.heat-rect')
            .data(heatmapData)
            .enter().append('rect')
            .attr('class', 'heat-rect')
            .attr('x', d => x(d.day))
            .attr('y', d => y(monthNames[d.month - 1]))
            .attr('width', x.bandwidth())
            .attr('height', y.bandwidth())
            .attr('fill', d => d.value ? colorScale(d.value) : '#f8f9fa')
            .on('mouseover', (event, d) => {
                this.tooltip
                    .style('opacity', 1)
                    .html(`${monthNames[d.month - 1]} ${d.day}<br/>${this.getValueLabel(element)}: ${d.value ? d.value.toFixed(2) : 'No data'}`)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                this.tooltip.style('opacity', 0);
            });

        this.g.append('g')
            .attr('transform', `translate(0,${this.height})`)
            .call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => !(i % 5))));

        this.g.append('g')
            .call(d3.axisLeft(y));

        this.addAxesLabels('Day of Month', 'Month');
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

    addBrushZoom(xScale, data, element) {
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
}

document.addEventListener('DOMContentLoaded', () => {
    new NOAAWeatherVisualizer();
});
