const express = require('express');
const path = require('path');
const fs = require('fs');
const duckdb = require('duckdb');

const app = express();
const port = 3000;

const db = new duckdb.Database(':memory:');
const connection = db.connect();

app.use(express.static('.'));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/stations/:year/:element', async (req, res) => {
    const { year, element } = req.params;

    try {
        const query = `
            WITH available_stations AS (
                SELECT DISTINCT ID as station_id
                FROM read_parquet('/Users/xevix/Downloads/data/noaa/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
                WHERE ID IS NOT NULL
            )
            SELECT 
                s.station_id,
                COALESCE(st.name, s.station_id) as station_name,
                c.name as country_name,
                states.name as state_name
            FROM available_stations s
            LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-stations.parquet') st
                ON s.station_id = st.id
            LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-countries.parquet') c
                ON SUBSTRING(s.station_id, 1, 2) = c.s
            LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-states.parquet') states
                ON st.st = states.st
            WHERE st.name IS NOT NULL
            ORDER BY station_name
            LIMIT 1000
        `;

        connection.all(query, (err, result) => {
            if (err) {
                console.error('Database error getting stations:', err);
                res.status(500).json({ error: 'Failed to get available stations' });
            } else {
                const stations = result.map(row => ({
                    id: String(row.station_id),
                    name: String(row.station_name || row.station_id),
                    country: row.country_name,
                    state: row.state_name
                }));
                
                console.log(`Found ${stations.length} stations for ${year}/${element}`);
                res.json(stations);
            }
        });
    } catch (error) {
        console.error('Server error getting stations:', error);
        res.status(500).json({ error: 'Server error getting stations' });
    }
});

app.get('/api/locations/:year/:element', async (req, res) => {
    const { year, element } = req.params;
    const country = req.query.country; // Optional country filter
    
    try {
        // Get available countries and states for this year/element using lookup tables
        const query = `
            WITH available_stations AS (
                SELECT DISTINCT ID as station_id
                FROM read_parquet('/Users/xevix/Downloads/data/noaa/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
                WHERE ID IS NOT NULL
            ),
            station_locations AS (
                SELECT 
                    s.station_id,
                    c.name as country_name,
                    states.name as state_name
                FROM available_stations s
                LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-stations.parquet') st
                    ON s.station_id = st.id
                LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-countries.parquet') c
                    ON SUBSTRING(s.station_id, 1, 2) = c.s
                LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-states.parquet') states
                    ON st.st = states.st
                WHERE c.name IS NOT NULL
            ),
            all_countries AS (
                SELECT DISTINCT country_name
                FROM station_locations
                WHERE country_name IS NOT NULL
            ),
            filtered_states AS (
                SELECT DISTINCT state_name
                FROM station_locations
                WHERE country_name IS NOT NULL
                ${country ? `AND country_name = '${country}'` : ''}
            )
            SELECT 'country' as type, country_name as name FROM all_countries
            UNION ALL
            SELECT 'state' as type, state_name as name FROM filtered_states WHERE state_name IS NOT NULL
        `;
        
        connection.all(query, (err, result) => {
            if (err) {
                console.error('Database error getting locations:', err);
                res.status(500).json({ error: 'Failed to get available locations' });
            } else {
                const countries = new Set();
                const states = new Set();
                
                result.forEach(row => {
                    if (row.type === 'country' && row.name) {
                        countries.add(row.name);
                    } else if (row.type === 'state' && row.name) {
                        states.add(row.name);
                    }
                });
                
                res.json({
                    countries: Array.from(countries).sort(),
                    states: Array.from(states).sort()
                });
            }
        });
    } catch (error) {
        console.error('Server error getting locations:', error);
        res.status(500).json({ error: 'Server error getting locations' });
    }
});

app.get('/api/years', async (req, res) => {
    try {
        const dataDir = '/Users/xevix/Downloads/data/noaa/by_year';

        // Read directory names and extract years
        const dirNames = fs.readdirSync(dataDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .filter(name => name.startsWith('YEAR='))
            .map(name => parseInt(name.split('=')[1]))
            .filter(year => !isNaN(year))
            .sort((a, b) => b - a); // Sort descending (newest first)

        // console.log(`Found ${dirNames.length} years available:`, dirNames.slice(0, 10), dirNames.length > 10 ? '...' : '');
        res.json(dirNames);

    } catch (error) {
        console.error('Server error getting years:', error);
        res.status(500).json({ error: 'Server error getting years' });
    }
});

app.get('/api/weather/:year/:element', async (req, res) => {
    const { year, element } = req.params;
    const limit = req.query.limit || 5000;
    const station = req.query.station; // Optional station filter
    const country = req.query.country; // Optional country filter
    const state = req.query.state; // Optional state filter

    try {
        // Build geographic filter if needed
        let geoFilter = '';
        if (country || state) {
            geoFilter = `
                AND ID IN (
                    SELECT st.id 
                    FROM read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-stations.parquet') st
                    LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-countries.parquet') c
                        ON SUBSTRING(st.id, 1, 2) = c.s
                    LEFT JOIN read_parquet('/Users/xevix/Downloads/data/noaa/ghcnd-states.parquet') states
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
            FROM read_parquet('/Users/xevix/Downloads/data/noaa/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
            WHERE DATA_VALUE IS NOT NULL 
                AND DATA_VALUE != -9999
                AND ID = '${station}'
                ${geoFilter}
            ORDER BY DATE
            LIMIT ${limit}
        ` : `
            WITH daily_averages AS (
                SELECT 
                    DATE as date,
                    AVG(CAST(DATA_VALUE AS DOUBLE)) as avg_value,
                    COUNT(*) as station_count,
                    EXTRACT(MONTH FROM STRPTIME(DATE, '%Y%m%d')) as month,
                    EXTRACT(DAY FROM STRPTIME(DATE, '%Y%m%d')) as day,
                    EXTRACT(YEAR FROM STRPTIME(DATE, '%Y%m%d')) as year
                FROM read_parquet('/Users/xevix/Downloads/data/noaa/by_year/YEAR=${year}/ELEMENT=${element}/*.parquet')
                WHERE DATA_VALUE IS NOT NULL 
                    AND DATA_VALUE != -9999
                    ${geoFilter}
                GROUP BY DATE
                ORDER BY DATE
            )
            SELECT 
                date,
                avg_value as value,
                station_count,
                month,
                day,
                year
            FROM daily_averages
            LIMIT ${limit}
        `;

        console.log("Query: ", query);

        connection.all(query, (err, result) => {
            if (err) {
                console.error('Database error:', err);
                res.status(500).json({ error: 'Database query failed' });
            } else {
                try {
                    // console.log(`Query returned ${result.length} rows`);
                    if (result.length > 0) {
                        // console.log('Sample row:', result[0]);
                    }

                    const processedData = result.map((row, index) => {
                        try {
                            return {
                                date: String(row.date || ''),
                                value: convertValue(Number(row.value), element),
                                station_count: Number(row.station_count),
                                month: Number(row.month),
                                day: Number(row.day),
                                year: Number(row.year)
                            };
                        } catch (rowError) {
                            console.error(`Error processing row ${index}:`, rowError, row);
                            return null;
                        }
                    }).filter(row => row !== null);

                    // console.log(`Processed ${processedData.length} rows successfully`);
                    res.json(processedData);
                } catch (processingError) {
                    console.error('Error processing results:', processingError);
                    res.status(500).json({ error: 'Error processing data' });
                }
            }
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

function convertValue(value, element) {
    if (element === 'TMAX' || element === 'TMIN' || element === 'TAVG') {
        return value / 10.0;
    }
    if (element === 'PRCP') {
        return value / 10.0;
    }
    return value;
}

app.listen(port, () => {
    console.log(`NOAA Weather Visualization server running at http://localhost:${port}`);
});