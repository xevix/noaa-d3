class NOAAWeatherVisualizer {
    constructor() {
        this.currentData = null;
        
        this.initializeEventListeners();
        this.setupChart();
        
        // Load default data on page load
        this.loadDefaultData();
    }
    
    initializeEventListeners() {
        // Manual refresh button
        document.getElementById('load-data').addEventListener('click', () => {
            this.loadAndVisualizeData();
        });
        
        // Auto-reload when filters change
        document.getElementById('year-select').addEventListener('change', () => {
            this.loadAndVisualizeData();
        });
        
        document.getElementById('element-select').addEventListener('change', () => {
            this.loadAndVisualizeData();
        });
        
        document.getElementById('chart-type').addEventListener('change', () => {
            this.loadAndVisualizeData();
        });
    }
    
    async loadDefaultData() {
        // Load data with default selections on page load
        try {
            document.getElementById('loading').style.display = 'block';
            await this.loadAndVisualizeData();
        } catch (error) {
            console.error('Error loading default data:', error);
            // Show a friendly message instead of an alert on page load
            this.g.append('text')
                .attr('x', this.width / 2)
                .attr('y', this.height / 2)
                .attr('text-anchor', 'middle')
                .text('Click "Load Data" to view weather visualizations')
                .style('font-size', '16px')
                .style('fill', '#7f8c8d');
        } finally {
            document.getElementById('loading').style.display = 'none';
        }
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
        
        // Show loading state
        document.getElementById('loading').style.display = 'block';
        const refreshBtn = document.getElementById('load-data');
        const originalBtnText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '⏳ Loading...';
        refreshBtn.disabled = true;
        
        try {
            const data = await this.queryWeatherData(year, element);
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
    
    async queryWeatherData(year, element) {
        try {
            const response = await fetch(`/api/weather/${year}/${element}?limit=5000`);
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
                .style('fill', '#7f8c8d');
            return;
        }
        
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
        const xAxis = this.g.append('g')
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
            
        this.addTooltip(circles, d => `Date: ${d3.timeFormat('%Y-%m-%d')(d.date)}<br/>Average ${this.getValueLabel(element)}: ${d.avgValue.toFixed(2)}<br/>Stations: ${d.station_count || 'N/A'}`);
        
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
            
        this.addTooltip(bars, d => `Month: ${d.monthName}<br/>Average ${this.getValueLabel(element)}: ${d.avgValue.toFixed(2)}<br/>Data Points: ${d.count}`);
        
        this.addAxesLabels('Month', this.getValueLabel(element));
    }
    
    createHeatMap(data, element) {
        const heatmapData = this.prepareHeatmapData(data);
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const days = Array.from({length: 31}, (_, i) => i + 1);
        
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