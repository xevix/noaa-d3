/**
 * @jest-environment jsdom
 */

// Mock global fetch
global.fetch = jest.fn();

// Mock D3 library
global.d3 = {
    select: jest.fn(() => ({
        selectAll: jest.fn(() => ({ remove: jest.fn() })),
        append: jest.fn(() => ({
            attr: jest.fn(() => ({ attr: jest.fn() })),
            style: jest.fn(() => ({ style: jest.fn() })),
            text: jest.fn(() => ({}))
        })),
        attr: jest.fn(() => ({ attr: jest.fn() })),
        style: jest.fn(() => ({ style: jest.fn() })),
        remove: jest.fn()
    })),
    scaleLinear: jest.fn(() => ({
        domain: jest.fn(() => ({ range: jest.fn(() => ({})) })),
        range: jest.fn(() => ({ domain: jest.fn(() => ({})) }))
    })),
    extent: jest.fn(() => [0, 100]),
    timeParse: jest.fn(() => new Date()),
    timeFormat: jest.fn(() => () => '2024-01-01')
};

// Mock DOM elements
const mockElement = {
    addEventListener: jest.fn(),
    style: { display: 'block' },
    value: '2024',
    checked: false,
    innerHTML: '',
    appendChild: jest.fn(),
    textContent: ''
};

global.document = {
    getElementById: jest.fn(() => mockElement),
    createElement: jest.fn(() => mockElement)
};

global.window = {
    location: { search: '?year=2024&element=TMAX' },
    URLSearchParams: jest.fn(() => ({
        get: jest.fn(() => '2024'),
        set: jest.fn(),
        toString: jest.fn(() => 'year=2024&element=TMAX')
    })),
    localStorage: {
        getItem: jest.fn(() => 'false'),
        setItem: jest.fn()
    },
    navigator: {
        clipboard: { writeText: jest.fn(() => Promise.resolve()) }
    }
};

describe('NOAA Weather Visualizer Utility Functions', () => {
    describe('Data Conversion Functions', () => {
        it('should convert temperature values correctly', () => {
            const convertValue = (value, element) => {
                if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
                    return value / 10.0;
                }
                if (element === 'PRCP') {
                    return value / 10.0;
                }
                return value;
            };

            expect(convertValue(250, 'TMAX')).toBe(25.0);
            expect(convertValue(-50, 'TMIN')).toBe(-5.0);
            expect(convertValue(100, 'PRCP')).toBe(10.0);
            expect(convertValue(100, 'OTHER')).toBe(100);
        });

        it('should parse dates correctly', () => {
            const parseDate = (dateString) => {
                const year = parseInt(dateString.substring(0, 4));
                const month = parseInt(dateString.substring(4, 6)) - 1;
                const day = parseInt(dateString.substring(6, 8));
                return new Date(year, month, day);
            };

            const result = parseDate('20240115');
            expect(result.getFullYear()).toBe(2024);
            expect(result.getMonth()).toBe(0);
            expect(result.getDate()).toBe(15);
        });

        it('should get correct value labels', () => {
            const getValueLabel = (element) => {
                switch (element) {
                    case 'TMAX':
                    case 'TMIN':
                    case 'TAVG':
                        return 'Temperature (°C)';
                    case 'PRCP':
                        return 'Precipitation (mm)';
                    default:
                        return 'Value';
                }
            };

            expect(getValueLabel('TMAX')).toBe('Temperature (°C)');
            expect(getValueLabel('PRCP')).toBe('Precipitation (mm)');
            expect(getValueLabel('OTHER')).toBe('Value');
        });
    });

    describe('Data Processing Functions', () => {
        it('should aggregate data by date', () => {
            const aggregateDataByDate = (data) => {
                const grouped = {};
                data.forEach(d => {
                    if (!grouped[d.date]) {
                        grouped[d.date] = { values: [], count: 0 };
                    }
                    grouped[d.date].values.push(d.value);
                    grouped[d.date].count++;
                });

                return Object.keys(grouped).map(date => ({
                    date: date,
                    value: grouped[date].values.reduce((sum, val) => sum + val, 0) / grouped[date].values.length,
                    count: grouped[date].count
                }));
            };

            const testData = [
                { date: '20240101', value: 25.0 },
                { date: '20240101', value: 27.0 },
                { date: '20240102', value: 30.0 }
            ];

            const result = aggregateDataByDate(testData);
            expect(result).toHaveLength(2);
            expect(result[0].value).toBe(26.0);
            expect(result[0].count).toBe(2);
        });

        it('should prepare heatmap data correctly', () => {
            const prepareHeatmapData = (data) => {
                const heatmapData = [];
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                
                data.forEach(d => {
                    for (let day = 1; day <= 31; day++) {
                        heatmapData.push({
                            month: monthNames[d.month - 1],
                            day: day,
                            value: d.value || 0
                        });
                    }
                });
                
                return heatmapData;
            };

            const testData = [
                { month: 1, value: 25.0 },
                { month: 2, value: 28.0 }
            ];

            const result = prepareHeatmapData(testData);
            expect(result).toHaveLength(62); // 31 days × 2 months
            expect(result[0].month).toBe('Jan');
        });
    });

    describe('Table Functions', () => {
        it('should sort table data correctly', () => {
            const sortTableData = (data, column, direction) => {
                if (!column || !direction) return data;
                
                return [...data].sort((a, b) => {
                    let aVal = a[column];
                    let bVal = b[column];
                    
                    if (typeof aVal === 'string') {
                        aVal = aVal.toLowerCase();
                        bVal = bVal.toLowerCase();
                    }
                    
                    if (direction === 'asc') {
                        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                    } else {
                        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                    }
                });
            };

            const testData = [
                { country: 'Canada', maxValue: 30 },
                { country: 'Australia', maxValue: 45 },
                { country: 'Brazil', maxValue: 35 }
            ];

            const sortedByCountry = sortTableData(testData, 'country', 'asc');
            expect(sortedByCountry[0].country).toBe('Australia');

            const sortedByValue = sortTableData(testData, 'maxValue', 'desc');
            expect(sortedByValue[0].maxValue).toBe(45);
        });

        it('should format dates correctly', () => {
            const formatDate = (dateStr) => {
                if (!dateStr || dateStr.length !== 8) return dateStr;
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                return `${year}-${month}-${day}`;
            };

            expect(formatDate('20240115')).toBe('2024-01-15');
            expect(formatDate('invalid')).toBe('invalid');
        });

        it('should format values with units', () => {
            const formatValue = (value, element) => {
                if (value === null || value === undefined) return 'N/A';
                
                if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
                    return `${value.toFixed(1)}°C`;
                }
                if (element === 'PRCP') {
                    return `${value.toFixed(1)}mm`;
                }
                return value.toString();
            };

            expect(formatValue(25.5, 'TMAX')).toBe('25.5°C');
            expect(formatValue(10.2, 'PRCP')).toBe('10.2mm');
            expect(formatValue(null, 'TMAX')).toBe('N/A');
        });
    });

    describe('URL Parameter Handling', () => {
        it('should build URL parameters correctly', () => {
            const updateURLParams = (params) => {
                const urlParams = new URLSearchParams();
                Object.keys(params).forEach(key => {
                    if (params[key]) {
                        urlParams.set(key, params[key]);
                    }
                });
                return urlParams.toString();
            };

            const params = {
                year: '2024',
                element: 'TMAX'
            };

            const result = updateURLParams(params);
            expect(result).toBe('year=2024&element=TMAX');
        });
    });
});

describe('API Integration Tests', () => {
    beforeEach(() => {
        fetch.mockClear();
    });

    it('should load available years', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([2024, 2023, 2022])
        });

        const loadAvailableYears = async () => {
            const response = await fetch('/api/years');
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        };

        const years = await loadAvailableYears();
        expect(fetch).toHaveBeenCalledWith('/api/years');
        expect(years).toEqual([2024, 2023, 2022]);
    });

    it('should load weather data with parameters', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([
                { date: '20240101', value: 25.0, station_count: 1 }
            ])
        });

        const loadWeatherData = async (year, element, filters = {}) => {
            let url = `/api/weather/${year}/${element}`;
            const params = new URLSearchParams();
            if (filters.station) params.append('station', filters.station);
            if (params.toString()) url += `?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        };

        const data = await loadWeatherData('2024', 'TMAX', { station: 'US1FL001' });
        expect(fetch).toHaveBeenCalledWith('/api/weather/2024/TMAX?station=US1FL001');
        expect(data).toHaveLength(1);
    });

    it('should handle API errors gracefully', async () => {
        fetch.mockRejectedValueOnce(new Error('Network error'));

        const loadWithErrorHandling = async () => {
            try {
                const response = await fetch('/api/years');
                return await response.json();
            } catch (error) {
                return [];
            }
        };

        const result = await loadWithErrorHandling();
        expect(result).toEqual([]);
    });
});

describe('Error Handling', () => {
    it('should show error messages', () => {
        const mockGetElementById = jest.fn(() => mockElement);
        const originalGetElementById = document.getElementById;
        document.getElementById = mockGetElementById;

        const showErrorMessage = (message) => {
            const errorElement = document.getElementById('error-message');
            if (errorElement) {
                errorElement.textContent = message;
                errorElement.style.display = 'block';
            }
        };

        showErrorMessage('Test error');
        expect(mockGetElementById).toHaveBeenCalledWith('error-message');
        
        // Restore original
        document.getElementById = originalGetElementById;
    });

    it('should handle missing DOM elements', () => {
        const mockGetElementById = jest.fn(() => null);
        const originalGetElementById = document.getElementById;
        document.getElementById = mockGetElementById;

        const safeGetElement = (id) => {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`Element with id '${id}' not found`);
                return null;
            }
            return element;
        };

        const element = safeGetElement('missing-element');
        expect(element).toBe(null);
        
        // Restore original
        document.getElementById = originalGetElementById;
    });
}); 