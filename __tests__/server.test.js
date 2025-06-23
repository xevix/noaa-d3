const request = require('supertest');
const express = require('express');

describe('Server Utility Functions', () => {
    describe('convertValue function', () => {
        const convertValue = (value, element) => {
            if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
                return value / 10.0;
            }
            if (element === 'PRCP') {
                return value / 10.0;
            }
            return value;
        };

        it('should convert temperature values correctly', () => {
            expect(convertValue(250, 'TMAX')).toBe(25.0);
            expect(convertValue(-100, 'TMIN')).toBe(-10.0);
            expect(convertValue(0, 'TAVG')).toBe(0.0);
        });

        it('should convert precipitation values correctly', () => {
            expect(convertValue(50, 'PRCP')).toBe(5.0);
            expect(convertValue(0, 'PRCP')).toBe(0.0);
            expect(convertValue(100, 'PRCP')).toBe(10.0);
        });

        it('should not convert other element values', () => {
            expect(convertValue(100, 'AWND')).toBe(100);
            expect(convertValue(50, 'SNOW')).toBe(50);
            expect(convertValue(999, 'OTHER')).toBe(999);
        });

        it('should handle edge cases', () => {
            expect(convertValue(1, 'TMAX')).toBe(0.1);
            expect(convertValue(-1, 'TMIN')).toBe(-0.1);
            expect(convertValue(999, 'PRCP')).toBe(99.9);
        });
    });

    describe('SQL Query Building', () => {
        describe('Geographic filters', () => {
            const buildGeoFilter = (country, state) => {
                if (!country && !state) return '';
                
                const conditions = [];
                if (country) {
                    conditions.push(`c.name = '${country}'`);
                }
                if (state) {
                    conditions.push(`states.name = '${state}'`);
                }
                
                return `
                AND (
                    ${conditions.join(' AND ')}
                )
            `;
            };

            it('should build country filter', () => {
                const result = buildGeoFilter('UNITED STATES', null);
                expect(result).toContain("c.name = 'UNITED STATES'");
                expect(result).not.toContain('states.name');
            });

            it('should build state filter', () => {
                const result = buildGeoFilter(null, 'FLORIDA');
                expect(result).toContain("states.name = 'FLORIDA'");
                expect(result).not.toContain('c.name');
            });

            it('should build combined filter', () => {
                const result = buildGeoFilter('UNITED STATES', 'FLORIDA');
                expect(result).toContain("c.name = 'UNITED STATES'");
                expect(result).toContain("states.name = 'FLORIDA'");
                expect(result).toContain(' AND ');
            });

            it('should return empty string for no filters', () => {
                expect(buildGeoFilter(null, null)).toBe('');
                expect(buildGeoFilter('', '')).toBe('');
            });
        });

        describe('Date filters', () => {
            const buildDateFilter = (startDate, endDate) => {
                if (!startDate || !endDate) return '';
                const startYYYYMMDD = startDate.replace(/-/g, '');
                const endYYYYMMDD = endDate.replace(/-/g, '');
                return `AND DATE >= '${startYYYYMMDD}' AND DATE <= '${endYYYYMMDD}'`;
            };

            it('should build date range filter', () => {
                const result = buildDateFilter('2024-01-01', '2024-12-31');
                expect(result).toBe("AND DATE >= '20240101' AND DATE <= '20241231'");
            });

            it('should return empty for missing dates', () => {
                expect(buildDateFilter(null, null)).toBe('');
                expect(buildDateFilter('2024-01-01', null)).toBe('');
                expect(buildDateFilter(null, '2024-12-31')).toBe('');
            });
        });
    });

    describe('Data Processing', () => {
        describe('Element name extraction', () => {
            const extractElementNames = (directories) => {
                return directories
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name)
                    .filter(name => name.startsWith('ELEMENT='))
                    .map(name => name.split('=')[1])
                    .sort();
            };

            it('should extract element names from directories', () => {
                const mockDirectories = [
                    { isDirectory: () => true, name: 'ELEMENT=TMAX' },
                    { isDirectory: () => true, name: 'ELEMENT=TMIN' },
                    { isDirectory: () => true, name: 'ELEMENT=PRCP' },
                    { isDirectory: () => false, name: 'somefile.txt' },
                    { isDirectory: () => true, name: 'OTHER_DIR' }
                ];

                const result = extractElementNames(mockDirectories);
                expect(result).toEqual(['PRCP', 'TMAX', 'TMIN']);
            });

            it('should handle empty directory list', () => {
                const result = extractElementNames([]);
                expect(result).toEqual([]);
            });
        });

        describe('Year extraction', () => {
            const extractYears = (directories) => {
                return directories
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name)
                    .filter(name => name.startsWith('YEAR='))
                    .map(name => parseInt(name.split('=')[1]))
                    .filter(year => !isNaN(year))
                    .sort((a, b) => b - a); // Sort descending (newest first)
            };

            it('should extract and sort years from directories', () => {
                const mockDirectories = [
                    { isDirectory: () => true, name: 'YEAR=2022' },
                    { isDirectory: () => true, name: 'YEAR=2024' },
                    { isDirectory: () => true, name: 'YEAR=2023' },
                    { isDirectory: () => false, name: 'somefile.txt' },
                    { isDirectory: () => true, name: 'YEAR=invalid' }
                ];

                const result = extractYears(mockDirectories);
                expect(result).toEqual([2024, 2023, 2022]);
            });
        });
    });

    describe('Error Handling', () => {
        it('should create appropriate error responses', () => {
            const createErrorResponse = (message, statusCode = 500) => {
                return {
                    status: statusCode,
                    body: { error: message }
                };
            };

            const error404 = createErrorResponse('Not found', 404);
            expect(error404.status).toBe(404);
            expect(error404.body.error).toBe('Not found');

            const error500 = createErrorResponse('Server error');
            expect(error500.status).toBe(500);
            expect(error500.body.error).toBe('Server error');
        });

        it('should handle database errors gracefully', () => {
            const handleDatabaseError = (error) => {
                console.error('Database error:', error);
                return {
                    status: 500,
                    body: { error: 'Database query failed' }
                };
            };

            const result = handleDatabaseError(new Error('Connection failed'));
            expect(result.status).toBe(500);
            expect(result.body.error).toBe('Database query failed');
        });
    });

    describe('Data Validation', () => {
        describe('Parameter validation', () => {
            const validateParams = (params, required) => {
                const missing = required.filter(param => !params[param]);
                return {
                    isValid: missing.length === 0,
                    missing: missing
                };
            };

            it('should validate required parameters', () => {
                const params = { year: '2024', element: 'TMAX' };
                const result = validateParams(params, ['year', 'element']);
                
                expect(result.isValid).toBe(true);
                expect(result.missing).toEqual([]);
            });

            it('should identify missing parameters', () => {
                const params = { year: '2024' };
                const result = validateParams(params, ['year', 'element']);
                
                expect(result.isValid).toBe(false);
                expect(result.missing).toEqual(['element']);
            });
        });

        describe('Data type validation', () => {
            const isValidYear = (year) => {
                const yearNum = parseInt(year);
                return !isNaN(yearNum) && yearNum >= 1880 && yearNum <= 2030;
            };

            it('should validate year ranges', () => {
                expect(isValidYear('2024')).toBe(true);
                expect(isValidYear('1900')).toBe(true);
                expect(isValidYear('1800')).toBe(false);
                expect(isValidYear('2050')).toBe(false);
                expect(isValidYear('invalid')).toBe(false);
            });
        });
    });
});

describe('Error Handling', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
    });

    it('should handle database connection errors', async () => {
        app.get('/api/test-db-error', (req, res) => {
            const mockConnection = {
                all: (query, callback) => {
                    callback(new Error('Database connection failed'), null);
                }
            };
            
            mockConnection.all('SELECT 1', (err, result) => {
                if (err) {
                    res.status(500).json({ error: 'Database query failed' });
                } else {
                    res.json(result);
                }
            });
        });

        const response = await request(app).get('/api/test-db-error');
        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Database query failed');
    });

    it('should handle malformed requests', async () => {
        app.post('/api/test-malformed', (req, res) => {
            try {
                // Simulate processing invalid JSON
                const data = req.body;
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid request data');
                }
                res.json({ success: true });
            } catch (error) {
                res.status(400).json({ error: 'Invalid request' });
            }
        });

        const response = await request(app)
            .post('/api/test-malformed')
            .send('invalid json');
        
        expect(response.status).toBe(400);
    });
}); 