// Utility functions extracted from the main application for testing
describe('Utility Functions', () => {
    describe('convertValue', () => {
        const convertValue = (value, element) => {
            if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
                return value / 10.0;
            }
            if (element === 'PRCP') {
                return value / 10.0;
            }
            return value;
        };

        it('should convert temperature values by dividing by 10', () => {
            expect(convertValue(250, 'TMAX')).toBe(25.0);
            expect(convertValue(-100, 'TMIN')).toBe(-10.0);
            expect(convertValue(0, 'TAVG')).toBe(0.0);
        });

        it('should convert precipitation values by dividing by 10', () => {
            expect(convertValue(50, 'PRCP')).toBe(5.0);
            expect(convertValue(0, 'PRCP')).toBe(0.0);
        });

        it('should not convert other element values', () => {
            expect(convertValue(100, 'AWND')).toBe(100);
            expect(convertValue(50, 'SNOW')).toBe(50);
            expect(convertValue(0, 'OTHER')).toBe(0);
        });

        it('should handle edge cases', () => {
            expect(convertValue(1, 'TMAX')).toBe(0.1);
            expect(convertValue(-1, 'TMIN')).toBe(-0.1);
            expect(convertValue(999, 'PRCP')).toBe(99.9);
        });
    });

    describe('parseDate', () => {
        const parseDate = (dateString) => {
            if (!dateString || dateString.length !== 8) {
                return null;
            }
            const year = parseInt(dateString.substring(0, 4));
            const month = parseInt(dateString.substring(4, 6)) - 1; // Month is 0-indexed
            const day = parseInt(dateString.substring(6, 8));
            return new Date(year, month, day);
        };

        it('should parse valid date strings correctly', () => {
            const date = parseDate('20240315');
            expect(date.getFullYear()).toBe(2024);
            expect(date.getMonth()).toBe(2); // March is 2 (0-indexed)
            expect(date.getDate()).toBe(15);
        });

        it('should handle leap year dates', () => {
            const date = parseDate('20240229');
            expect(date.getFullYear()).toBe(2024);
            expect(date.getMonth()).toBe(1); // February is 1
            expect(date.getDate()).toBe(29);
        });

        it('should handle invalid date strings', () => {
            expect(parseDate('')).toBe(null);
            expect(parseDate('20240')).toBe(null);
            expect(parseDate('2024031')).toBe(null);
            expect(parseDate('202403150')).toBe(null);
            expect(parseDate(null)).toBe(null);
            expect(parseDate(undefined)).toBe(null);
        });

        it('should handle edge dates', () => {
            const newYear = parseDate('20240101');
            expect(newYear.getMonth()).toBe(0);
            expect(newYear.getDate()).toBe(1);

            const newYearEve = parseDate('20241231');
            expect(newYearEve.getMonth()).toBe(11);
            expect(newYearEve.getDate()).toBe(31);
        });
    });

    describe('formatDate', () => {
        const formatDate = (dateStr) => {
            if (!dateStr || dateStr.length !== 8) {
                return dateStr;
            }
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            return `${year}-${month}-${day}`;
        };

        it('should format valid date strings', () => {
            expect(formatDate('20240315')).toBe('2024-03-15');
            expect(formatDate('20231225')).toBe('2023-12-25');
            expect(formatDate('20240101')).toBe('2024-01-01');
        });

        it('should return invalid strings unchanged', () => {
            expect(formatDate('')).toBe('');
            expect(formatDate('invalid')).toBe('invalid');
            expect(formatDate('2024')).toBe('2024');
            expect(formatDate('202403150')).toBe('202403150');
        });

        it('should handle null and undefined', () => {
            expect(formatDate(null)).toBe(null);
            expect(formatDate(undefined)).toBe(undefined);
        });
    });

    describe('formatValue', () => {
        const formatValue = (value, element) => {
            if (value === null || value === undefined) {
                return 'N/A';
            }
            
            if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
                return `${value.toFixed(1)}°C`;
            }
            if (element === 'PRCP') {
                return `${value.toFixed(1)}mm`;
            }
            return value.toString();
        };

        it('should format temperature values with degree symbol', () => {
            expect(formatValue(25.5, 'TMAX')).toBe('25.5°C');
            expect(formatValue(-10.0, 'TMIN')).toBe('-10.0°C');
            expect(formatValue(0, 'TAVG')).toBe('0.0°C');
        });

        it('should format precipitation values with mm unit', () => {
            expect(formatValue(15.7, 'PRCP')).toBe('15.7mm');
            expect(formatValue(0, 'PRCP')).toBe('0.0mm');
        });

        it('should format other values as strings', () => {
            expect(formatValue(100, 'AWND')).toBe('100');
            expect(formatValue(50.5, 'SNOW')).toBe('50.5');
        });

        it('should handle null and undefined values', () => {
            expect(formatValue(null, 'TMAX')).toBe('N/A');
            expect(formatValue(undefined, 'PRCP')).toBe('N/A');
        });
    });

    describe('getValueLabel', () => {
        const getValueLabel = (element) => {
            switch (element) {
                case 'TMAX':
                case 'TMIN':
                case 'TAVG':
                    return 'Temperature (°C)';
                case 'PRCP':
                    return 'Precipitation (mm)';
                case 'AWND':
                    return 'Wind Speed (m/s)';
                case 'SNOW':
                    return 'Snow (mm)';
                default:
                    return 'Value';
            }
        };

        it('should return correct labels for temperature elements', () => {
            expect(getValueLabel('TMAX')).toBe('Temperature (°C)');
            expect(getValueLabel('TMIN')).toBe('Temperature (°C)');
            expect(getValueLabel('TAVG')).toBe('Temperature (°C)');
        });

        it('should return correct labels for precipitation and wind', () => {
            expect(getValueLabel('PRCP')).toBe('Precipitation (mm)');
            expect(getValueLabel('AWND')).toBe('Wind Speed (m/s)');
            expect(getValueLabel('SNOW')).toBe('Snow (mm)');
        });

        it('should return default label for unknown elements', () => {
            expect(getValueLabel('UNKNOWN')).toBe('Value');
            expect(getValueLabel('')).toBe('Value');
            expect(getValueLabel(null)).toBe('Value');
        });
    });

    describe('normalizeCountryName', () => {
        const normalizeCountryName = (name) => {
            const normalizationMap = {
                'UNITED STATES': 'United States of America',
                'UNITED KINGDOM': 'United Kingdom',
                'RUSSIAN FEDERATION': 'Russia',
                'SOUTH KOREA': 'Korea, Republic of',
                'NORTH KOREA': 'Korea, Democratic People\'s Republic of'
            };
            return normalizationMap[name] || name;
        };

        it('should normalize known country names', () => {
            expect(normalizeCountryName('UNITED STATES')).toBe('United States of America');
            expect(normalizeCountryName('UNITED KINGDOM')).toBe('United Kingdom');
            expect(normalizeCountryName('RUSSIAN FEDERATION')).toBe('Russia');
        });

        it('should return unknown country names unchanged', () => {
            expect(normalizeCountryName('CANADA')).toBe('CANADA');
            expect(normalizeCountryName('FRANCE')).toBe('FRANCE');
            expect(normalizeCountryName('JAPAN')).toBe('JAPAN');
        });

        it('should handle edge cases', () => {
            expect(normalizeCountryName('')).toBe('');
            expect(normalizeCountryName(null)).toBe(null);
            expect(normalizeCountryName(undefined)).toBe(undefined);
        });
    });

    describe('buildGeoFilter', () => {
        const buildGeoFilter = (country, state) => {
            if (!country && !state) return '';
            
            const filters = [];
            if (country) {
                filters.push(`c.name = '${country}'`);
            }
            if (state) {
                filters.push(`states.name = '${state}'`);
            }
            
            return `\n                AND (\n                    ${filters.join(' AND ')}\n                )\n            `;
        };

        it('should build filter with country only', () => {
            const result = buildGeoFilter('UNITED STATES', null);
            expect(result).toContain("c.name = 'UNITED STATES'");
            expect(result).not.toContain('states.name');
        });

        it('should build filter with state only', () => {
            const result = buildGeoFilter(null, 'FLORIDA');
            expect(result).toContain("states.name = 'FLORIDA'");
            expect(result).not.toContain('c.name');
        });

        it('should build filter with both country and state', () => {
            const result = buildGeoFilter('UNITED STATES', 'FLORIDA');
            expect(result).toContain("c.name = 'UNITED STATES'");
            expect(result).toContain("states.name = 'FLORIDA'");
            expect(result).toContain(' AND ');
        });

        it('should return empty string when neither country nor state is provided', () => {
            expect(buildGeoFilter(null, null)).toBe('');
            expect(buildGeoFilter('', '')).toBe('');
        });
    });

    describe('buildDateFilter', () => {
        const buildDateFilter = (startDate, endDate) => {
            if (!startDate || !endDate) return '';
            const startYYYYMMDD = startDate.replace(/-/g, '');
            const endYYYYMMDD = endDate.replace(/-/g, '');
            return ` AND w.date BETWEEN '${startYYYYMMDD}' AND '${endYYYYMMDD}'`;
        };

        it('should build date filter with both dates', () => {
            const result = buildDateFilter('2024-01-01', '2024-12-31');
            expect(result).toBe(" AND w.date BETWEEN '20240101' AND '20241231'");
        });

        it('should return empty string when dates are missing', () => {
            expect(buildDateFilter(null, null)).toBe('');
            expect(buildDateFilter('2024-01-01', null)).toBe('');
            expect(buildDateFilter(null, '2024-12-31')).toBe('');
            expect(buildDateFilter('', '')).toBe('');
        });

        it('should handle different date formats', () => {
            const result = buildDateFilter('2024-03-15', '2024-03-20');
            expect(result).toBe(" AND w.date BETWEEN '20240315' AND '20240320'");
        });
    });

    describe('aggregateDataByDate', () => {
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

        it('should aggregate data by date correctly', () => {
            const testData = [
                { date: '20240101', value: 25.0 },
                { date: '20240101', value: 27.0 },
                { date: '20240102', value: 30.0 },
                { date: '20240102', value: 28.0 },
                { date: '20240103', value: 22.0 }
            ];

            const result = aggregateDataByDate(testData);
            expect(result).toHaveLength(3);
            
            const day1 = result.find(r => r.date === '20240101');
            expect(day1.value).toBe(26.0);
            expect(day1.count).toBe(2);

            const day2 = result.find(r => r.date === '20240102');
            expect(day2.value).toBe(29.0);
            expect(day2.count).toBe(2);

            const day3 = result.find(r => r.date === '20240103');
            expect(day3.value).toBe(22.0);
            expect(day3.count).toBe(1);
        });

        it('should handle empty data array', () => {
            const result = aggregateDataByDate([]);
            expect(result).toEqual([]);
        });

        it('should handle single data point', () => {
            const testData = [{ date: '20240101', value: 25.0 }];
            const result = aggregateDataByDate(testData);
            
            expect(result).toHaveLength(1);
            expect(result[0].date).toBe('20240101');
            expect(result[0].value).toBe(25.0);
            expect(result[0].count).toBe(1);
        });
    });

    describe('sortTableData', () => {
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

        it('should sort by string column ascending', () => {
            const testData = [
                { country: 'Canada', value: 30 },
                { country: 'Australia', value: 45 },
                { country: 'Brazil', value: 35 }
            ];

            const result = sortTableData(testData, 'country', 'asc');
            expect(result[0].country).toBe('Australia');
            expect(result[1].country).toBe('Brazil');
            expect(result[2].country).toBe('Canada');
        });

        it('should sort by string column descending', () => {
            const testData = [
                { country: 'Canada', value: 30 },
                { country: 'Australia', value: 45 },
                { country: 'Brazil', value: 35 }
            ];

            const result = sortTableData(testData, 'country', 'desc');
            expect(result[0].country).toBe('Canada');
            expect(result[1].country).toBe('Brazil');
            expect(result[2].country).toBe('Australia');
        });

        it('should sort by numeric column ascending', () => {
            const testData = [
                { country: 'Canada', value: 30 },
                { country: 'Australia', value: 45 },
                { country: 'Brazil', value: 35 }
            ];

            const result = sortTableData(testData, 'value', 'asc');
            expect(result[0].value).toBe(30);
            expect(result[1].value).toBe(35);
            expect(result[2].value).toBe(45);
        });

        it('should sort by numeric column descending', () => {
            const testData = [
                { country: 'Canada', value: 30 },
                { country: 'Australia', value: 45 },
                { country: 'Brazil', value: 35 }
            ];

            const result = sortTableData(testData, 'value', 'desc');
            expect(result[0].value).toBe(45);
            expect(result[1].value).toBe(35);
            expect(result[2].value).toBe(30);
        });

        it('should return original data when no column or direction specified', () => {
            const testData = [
                { country: 'Canada', value: 30 },
                { country: 'Australia', value: 45 }
            ];

            expect(sortTableData(testData, null, 'asc')).toEqual(testData);
            expect(sortTableData(testData, 'country', null)).toEqual(testData);
            expect(sortTableData(testData, null, null)).toEqual(testData);
        });
    });
}); 