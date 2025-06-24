const express = require('express');
const path = require('path');
const fs = require('fs');
const duckdb = require('duckdb');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { UNSIGNED } = require('@aws-sdk/s3-request-presigner');

const app = express();
const port = 3000;

const db = new duckdb.Database(':memory:');
const connection = db.connect();

const s3 = new S3Client({
    region: 'us-east-1',
    credentials: UNSIGNED
});
const LOCAL_DATA_ROOT = path.join(__dirname, 'data');
const S3_BUCKET = 'noaa-ghcn-pds';
const S3_PREFIX = 'parquet/by_year';

const AVAILABLE_CACHE_FILE = path.join(LOCAL_DATA_ROOT, 'available_year_elements.json');

// Helper to profile DuckDB queries
function profileQuery(method, sql, ...args) {
    const start = Date.now();
    console.log(`[DuckDB] QUERY START (${method}):`, sql);
    const cb = args[args.length - 1];
    const wrappedCb = function (...cbArgs) {
        const end = Date.now();
        const duration = end - start;
        console.log(`[DuckDB] QUERY END (${method}): took ${duration} ms`);
        cb(...cbArgs);
    };
    args[args.length - 1] = wrappedCb;
    return connection[method](sql, ...args);
}

async function ensureLocalData(year, element) {
    // Always use DuckDB COPY to download S3 parquet files to local, then query locally
    const localDir = path.join(LOCAL_DATA_ROOT, `by_year/YEAR=${year}/ELEMENT=${element}`);
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    const s3ParquetPath = `s3://${S3_BUCKET}/${S3_PREFIX}/YEAR=${year}/ELEMENT=${element}/*.parquet`;
    const localParquetFile = path.join(localDir, 'data.parquet');
    // If the local file exists and is non-empty, use it
    if (fs.existsSync(localParquetFile) && fs.statSync(localParquetFile).size > 0) {
        return { path: localParquetFile, downloaded: false };
    }
    // Remove any existing local parquet files first (to avoid partial/corrupt data)
    if (fs.existsSync(localDir)) {
        for (const file of fs.readdirSync(localDir)) {
            if (file.endsWith('.parquet')) {
                fs.unlinkSync(path.join(localDir, file));
            }
        }
    }
    try {
        await new Promise((resolve, reject) => {
            profileQuery('run',
                `COPY (SELECT * FROM read_parquet('${s3ParquetPath}')) TO '${localParquetFile}' (FORMAT PARQUET, PARQUET_VERSION 'V2', COMPRESSION 'ZSTD');`,
                (err) => {
                    if (err) reject(err); else resolve();
                }
            );
        });
        if (!fs.existsSync(localParquetFile) || fs.statSync(localParquetFile).size === 0) {
            throw new Error('DuckDB COPY did not produce a local parquet file');
        }
        return { path: localParquetFile, downloaded: true };
    } catch (copyErr) {
        console.error(`[DuckDB COPY failed] for ${year}/${element}:`, copyErr.message || copyErr);
        throw new Error(`No parquet files found for year=${year}, element=${element}. Data may be missing or download failed.`);
    }
}

// Helper for lookup tables (stations, countries, states, etc.)
async function ensureLocalLookupFile(filename, s3Subpath) {
    const localPath = path.join(LOCAL_DATA_ROOT, filename);
    if (!fs.existsSync(localPath)) {
        const getParams = { Bucket: S3_BUCKET, Key: s3Subpath };
        const fileStream = fs.createWriteStream(localPath);
        const { Body } = await s3.send(new GetObjectCommand(getParams));
        await new Promise((resolve, reject) => {
            Body.pipe(fileStream)
                .on('error', reject)
                .on('close', resolve);
        });
    }
    return localPath;
}

app.use(express.static('.'));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/stations/:year/:element', async (req, res) => {
    const { year, element } = req.params;
    const country = req.query.country; // Optional country filter
    const state = req.query.state; // Optional state filter

    try {
        // Ensure data is present
        const dataResult = await ensureLocalData(year, element);
        const dataPath = dataResult.path;
        const stationsPath = await ensureLocalLookupFile('ghcnd-stations.parquet', 'parquet/ghcnd-stations.parquet');
        const countriesPath = await ensureLocalLookupFile('ghcnd-countries.parquet', 'parquet/ghcnd-countries.parquet');
        const statesPath = await ensureLocalLookupFile('ghcnd-states.parquet', 'parquet/ghcnd-states.parquet');

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
                FROM read_parquet('${dataPath}')
                WHERE ID IS NOT NULL
            )
            SELECT 
                s.station_id,
                COALESCE(st.name, s.station_id) as station_name,
                c.name as country_name,
                states.name as state_name
            FROM available_stations s
            LEFT JOIN read_parquet('${stationsPath}') st
                ON s.station_id = st.id
            LEFT JOIN read_parquet('${countriesPath}') c
                ON SUBSTRING(s.station_id, 1, 2) = c.s
            LEFT JOIN read_parquet('${statesPath}') states
                ON st.st = states.st
            WHERE st.name IS NOT NULL
                ${geoFilter}
            ORDER BY station_name
            LIMIT 1000
        `;

        profileQuery('all', query, (err, result) => {
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
        // Ensure data is present
        const dataResult = await ensureLocalData(year, element);
        const dataPath = dataResult.path;
        const stationsPath = await ensureLocalLookupFile('ghcnd-stations.parquet', 'parquet/ghcnd-stations.parquet');
        const countriesPath = await ensureLocalLookupFile('ghcnd-countries.parquet', 'parquet/ghcnd-countries.parquet');
        const statesPath = await ensureLocalLookupFile('ghcnd-states.parquet', 'parquet/ghcnd-states.parquet');

        // Get available countries and states for this year/element using lookup tables
        const query = `
            WITH available_stations AS (
                SELECT DISTINCT ID as station_id
                FROM read_parquet('${dataPath}')
                WHERE ID IS NOT NULL
            ),
            station_locations AS (
                SELECT 
                    s.station_id,
                    c.name as country_name,
                    states.name as state_name
                FROM available_stations s
                LEFT JOIN read_parquet('${stationsPath}') st
                    ON s.station_id = st.id
                LEFT JOIN read_parquet('${countriesPath}') c
                    ON SUBSTRING(s.station_id, 1, 2) = c.s
                LEFT JOIN read_parquet('${statesPath}') states
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

        profileQuery('all', query, (err, result) => {
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

                const response = {
                    countries: Array.from(countries).sort(),
                    states: Array.from(states).sort()
                };

                console.log(`Locations API: ${country ? `filtered by country "${country}"` : 'no country filter'} - returning ${response.countries.length} countries, ${response.states.length} states`);
                res.json(response);
            }
        });
    } catch (error) {
        console.error('Server error getting locations:', error);
        res.status(500).json({ error: 'Server error getting locations' });
    }
});

async function loadOrCreateAvailableYearElementsCache() {
    if (fs.existsSync(AVAILABLE_CACHE_FILE)) {
        // Use the cache if it exists
        try {
            const raw = fs.readFileSync(AVAILABLE_CACHE_FILE, 'utf-8');
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to read available_year_elements.json, will re-query:', e);
        }
    }
    // Query S3 via DuckDB for all available (year, element) pairs
    const s3Glob = `s3://${S3_BUCKET}/${S3_PREFIX}/YEAR=*/ELEMENT=*/*.parquet`;
    const sql = `SELECT DISTINCT
        REGEXP_EXTRACT(file, 'YEAR=([0-9]{4})', 1) AS year,
        REGEXP_EXTRACT(file, 'ELEMENT=([A-Z0-9]+)', 1) AS element
    FROM glob('${s3Glob}')`;
    return new Promise((resolve, reject) => {
        profileQuery('all', sql, (err, rows) => {
            if (err) {
                console.error('DuckDB S3 year/element query failed:', err);
                reject(err);
                return;
            }
            // Save to cache
            try {
                fs.writeFileSync(AVAILABLE_CACHE_FILE, JSON.stringify(rows, null, 2), 'utf-8');
            } catch (e) {
                console.error('Failed to write available_year_elements.json:', e);
            }
            resolve(rows);
        });
    });
}

app.get('/api/years', async (_, res) => {
    try {
        let usedCache = false;
        if (fs.existsSync(AVAILABLE_CACHE_FILE)) usedCache = true;
        const available = await loadOrCreateAvailableYearElementsCache();
        // Extract unique years, sort descending
        const years = Array.from(new Set(available.map(r => parseInt(r.year, 10)))).filter(y => !isNaN(y)).sort((a, b) => b - a);
        res.set('X-Noaa-Cache', usedCache ? 'hit' : 'miss');
        res.json(years);
    } catch (error) {
        console.error('Server error getting years:', error);
        res.status(500).json({ error: 'Server error getting years' });
    }
});

app.get('/api/elements/:year', async (req, res) => {
    const { year } = req.params;
    try {
        let usedCache = false;
        if (fs.existsSync(AVAILABLE_CACHE_FILE)) usedCache = true;
        const available = await loadOrCreateAvailableYearElementsCache();
        // Extract unique elements for this year
        const elements = Array.from(new Set(
            available.filter(r => String(r.year) === String(year)).map(r => r.element)
        )).sort();
        // Optionally, add descriptions as before (reuse existing logic if needed)
        // Get element descriptions from CSV
        const csvPath = "dimensions/complete_element_descriptions.csv";
        const query = `
            SELECT Element, Description, Unit
            FROM read_csv('${csvPath}', header=true)
            WHERE Element IN (${elements.map(name => `'${name}'`).join(', ')})
        `;
        profileQuery('all', query, (err, descriptions) => {
            res.set('X-Noaa-Cache', usedCache ? 'hit' : 'miss');
            if (err) {
                console.error('Error reading element descriptions:', err);
                // Fallback to just element names
                const out = elements.map(name => ({ code: name, description: name }));
                res.json(out);
            } else {
                // Create lookup map for descriptions
                const descMap = {};
                descriptions.forEach(row => {
                    descMap[row.Element] = {
                        description: row.Description,
                        unit: row.Unit
                    };
                });
                // Augment elements with descriptions
                const out = elements.map(name => ({
                    code: name,
                    description: descMap[name] ? `${name} - ${descMap[name].description}` : name,
                    unit: descMap[name] ? descMap[name].unit : null
                }));
                res.json(out);
            }
        });
    } catch (error) {
        console.error('Server error getting elements:', error);
        res.status(500).json({ error: 'Server error getting elements' });
    }
});

app.get('/api/world-data/:year/:element', async (req, res) => {
    const { year, element } = req.params;
    const selectedCountry = req.query.country;
    const selectedState = req.query.state;
    const { startDate, endDate } = req.query;

    try {
        // Ensure data is present
        const dataResult = await ensureLocalData(year, element);
        const dataPath = dataResult.path;
        const stationsPath = await ensureLocalLookupFile('ghcnd-stations.parquet', 'parquet/ghcnd-stations.parquet');
        const countriesPath = await ensureLocalLookupFile('ghcnd-countries.parquet', 'parquet/ghcnd-countries.parquet');
        const statesPath = await ensureLocalLookupFile('ghcnd-states.parquet', 'parquet/ghcnd-states.parquet');

        let query;
        if (selectedState) {
            // When a state is selected, show data for that specific state.
            // If a country is also selected, it acts as an additional filter.
            let whereClauses = [
                `w.DATA_VALUE IS NOT NULL`,
                `w.DATA_VALUE != -9999`,
                `(w.Q_FLAG IS NULL OR w.Q_FLAG != 'X')`,
                `c.name IS NOT NULL`,
                `states.name IS NOT NULL`,
                `states.name = '${selectedState}'`
            ];
            if (selectedCountry) {
                whereClauses.push(`c.name = '${selectedCountry}'`);
            }
            if (startDate && endDate) {
                const startYYYYMMDD = startDate.replace(/-/g, '');
                const endYYYYMMDD = endDate.replace(/-/g, '');
                whereClauses.push(`w.date BETWEEN '${startYYYYMMDD}' AND '${endYYYYMMDD}'`);
            }

            query = `
                SELECT 
                    'state' as type,
                    states.name as name,
                    c.name as parent,
                    AVG(CAST(w.DATA_VALUE AS DOUBLE)) as avg_value,
                    COUNT(*) as data_points
                FROM read_parquet('${dataPath}') w
                LEFT JOIN read_parquet('${stationsPath}') st
                    ON w.ID = st.id
                LEFT JOIN read_parquet('${countriesPath}') c
                    ON SUBSTRING(w.ID, 1, 2) = c.s
                LEFT JOIN read_parquet('${statesPath}') states
                    ON st.st = states.st
                WHERE ${whereClauses.join(' AND ')}
                GROUP BY c.name, states.name
                HAVING COUNT(*) >= 10
            `;
        } else if (selectedCountry) {
            // When only a country is selected, show all states for that country
            let dateFilter = '';
            if (startDate && endDate) {
                const startYYYYMMDD = startDate.replace(/-/g, '');
                const endYYYYMMDD = endDate.replace(/-/g, '');
                dateFilter = ` AND w.date BETWEEN '${startYYYYMMDD}' AND '${endYYYYMMDD}'`;
            }

            query = `
                SELECT 
                    'state' as type,
                    states.name as name,
                    c.name as parent,
                    AVG(CAST(w.DATA_VALUE AS DOUBLE)) as avg_value,
                    COUNT(*) as data_points
                FROM read_parquet('${dataPath}') w
                LEFT JOIN read_parquet('${stationsPath}') st
                    ON w.ID = st.id
                LEFT JOIN read_parquet('${countriesPath}') c
                    ON SUBSTRING(w.ID, 1, 2) = c.s
                LEFT JOIN read_parquet('${statesPath}') states
                    ON st.st = states.st
                WHERE w.DATA_VALUE IS NOT NULL 
                    AND w.DATA_VALUE != -9999
                    AND (w.Q_FLAG IS NULL OR w.Q_FLAG != 'X')
                    AND c.name IS NOT NULL
                    AND states.name IS NOT NULL
                    AND c.name = '${selectedCountry}'
                    ${dateFilter}
                GROUP BY c.name, states.name
                HAVING COUNT(*) >= 10
                
                UNION ALL

                SELECT
                    'country' as type,
                    c.name as name,
                    NULL as parent,
                    AVG(CAST(w.DATA_VALUE AS DOUBLE)) as avg_value,
                    COUNT(*) as data_points
                FROM read_parquet('${dataPath}') w
                LEFT JOIN read_parquet('${countriesPath}') c
                    ON SUBSTRING(w.ID, 1, 2) = c.s
                WHERE w.DATA_VALUE IS NOT NULL 
                    AND w.DATA_VALUE != -9999
                    AND (w.Q_FLAG IS NULL OR w.Q_FLAG != 'X')
                    AND c.name IS NOT NULL
                    AND c.name = '${selectedCountry}'
                    ${dateFilter}
                GROUP BY c.name
            `;
        } else {
            // When no country is selected, show all countries
            let dateFilter = '';
            if (startDate && endDate) {
                const startYYYYMMDD = startDate.replace(/-/g, '');
                const endYYYYMMDD = endDate.replace(/-/g, '');
                dateFilter = ` AND w.date BETWEEN '${startYYYYMMDD}' AND '${endYYYYMMDD}'`;
            }
            query = `
                SELECT 
                    'country' as type,
                    c.name as name,
                    NULL as parent,
                    AVG(CAST(w.DATA_VALUE AS DOUBLE)) as avg_value,
                    COUNT(*) as data_points
                FROM read_parquet('${dataPath}') w
                LEFT JOIN read_parquet('${stationsPath}') st
                    ON w.ID = st.id
                LEFT JOIN read_parquet('${countriesPath}') c
                    ON SUBSTRING(w.ID, 1, 2) = c.s
                WHERE w.DATA_VALUE IS NOT NULL 
                    AND w.DATA_VALUE != -9999
                    AND (w.Q_FLAG IS NULL OR w.Q_FLAG != 'X')
                    AND c.name IS NOT NULL
                    ${dateFilter}
                GROUP BY c.name
                HAVING COUNT(*) >= 100
            `;
        }

        profileQuery('all', query, (err, result) => {
            if (err) {
                console.error('Database error getting world data:', err);
                res.status(500).json({ error: 'Failed to get world data' });
            } else {
                const processedData = result.map(row => ({
                    type: row.type,
                    name: row.name,
                    parent: row.parent,
                    value: convertValue(Number(row.avg_value), element),
                    dataPoints: Number(row.data_points)
                }));

                console.log(`Found ${processedData.length} geographic regions for ${year}/${element}`);
                res.json(processedData);
            }
        });
    } catch (error) {
        console.error('Server error getting world data:', error);
        res.status(500).json({ error: 'Server error getting world data' });
    }
});

app.get('/api/country-stats/:year/:element', async (req, res) => {
    const { year, element } = req.params;
    const country = req.query.country; // Optional country filter
    const state = req.query.state; // Optional state filter

    try {
        // Ensure data is present
        const dataResult = await ensureLocalData(year, element);
        const dataPath = dataResult.path;
        const stationsPath = await ensureLocalLookupFile('ghcnd-stations.parquet', 'parquet/ghcnd-stations.parquet');
        const countriesPath = await ensureLocalLookupFile('ghcnd-countries.parquet', 'parquet/ghcnd-countries.parquet');
        const statesPath = await ensureLocalLookupFile('ghcnd-states.parquet', 'parquet/ghcnd-states.parquet');

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

        // Add date range filter if provided
        let dateFilter = '';
        if (req.query.startDate && req.query.endDate) {
            dateFilter = `AND DATE >= '${req.query.startDate.replace(/-/g, '')}' AND DATE <= '${req.query.endDate.replace(/-/g, '')}'`;
        }

        const query = `
            WITH station_data AS (
                SELECT 
                    w.ID as station_id,
                    w.DATE as date,
                    CAST(w.DATA_VALUE AS DOUBLE) as value,
                    st.name as station_name,
                    c.name as country_name,
                    states.name as state_name
                FROM read_parquet('${dataPath}') w
                LEFT JOIN read_parquet('${stationsPath}') st
                    ON w.ID = st.id
                LEFT JOIN read_parquet('${countriesPath}') c
                    ON SUBSTRING(w.ID, 1, 2) = c.s
                LEFT JOIN read_parquet('${statesPath}') states
                    ON st.st = states.st
                WHERE w.DATA_VALUE IS NOT NULL 
                    AND w.DATA_VALUE != -9999
                    AND (w.Q_FLAG IS NULL OR w.Q_FLAG != 'X')
                    AND c.name IS NOT NULL
                    ${geoFilter}
                    ${dateFilter}
            ),
            country_max_values AS (
                SELECT DISTINCT ON (country_name) 
                    country_name,
                    station_id as max_station_id,
                    station_name as max_station_name,
                    value as max_value,
                    date as max_date
                FROM station_data
                ORDER BY country_name, value DESC, date DESC
            ),
            country_min_values AS (
                SELECT DISTINCT ON (country_name) 
                    country_name,
                    station_id as min_station_id,
                    station_name as min_station_name,
                    value as min_value,
                    date as min_date
                FROM station_data
                ORDER BY country_name, value ASC, date DESC
            )
            SELECT 
                max_vals.country_name,
                max_vals.max_station_id,
                COALESCE(max_vals.max_station_name, max_vals.max_station_id) as max_station_name,
                max_vals.max_value,
                max_vals.max_date,
                min_vals.min_station_id,
                COALESCE(min_vals.min_station_name, min_vals.min_station_id) as min_station_name,
                min_vals.min_value,
                min_vals.min_date
            FROM country_max_values max_vals
            JOIN country_min_values min_vals ON max_vals.country_name = min_vals.country_name
            ORDER BY max_vals.max_value DESC, max_vals.country_name
        `;

        profileQuery('all', query, (err, result) => {
            if (err) {
                console.error('Database error getting country stats:', err);
                res.status(500).json({ error: 'Failed to get country statistics' });
            } else {
                const countryStats = result.map(row => ({
                    country: String(row.country_name),
                    maxStationId: String(row.max_station_id),
                    maxStationName: String(row.max_station_name || row.max_station_id),
                    maxValue: Number(row.max_value),
                    maxDate: String(row.max_date),
                    minStationId: String(row.min_station_id),
                    minStationName: String(row.min_station_name || row.min_station_id),
                    minValue: Number(row.min_value),
                    minDate: String(row.min_date)
                }));

                console.log(`Found ${countryStats.length} country statistics for ${year}/${element}`);
                res.json(countryStats);
            }
        });
    } catch (error) {
        console.error('Server error getting country stats:', error);
        res.status(500).json({ error: 'Server error getting country statistics' });
    }
});

app.get('/api/weather/:year/:element', async (req, res) => {
    const { year, element } = req.params;
    const limit = req.query.limit || 5000;
    const station = req.query.station; // Optional station filter
    const country = req.query.country; // Optional country filter
    const state = req.query.state; // Optional state filter

    try {
        // Ensure data is present
        const dataResult = await ensureLocalData(year, element);
        const dataPath = dataResult.path;
        if (dataResult.downloaded) {
            res.set('X-Noaa-Download', 'true');
        }
        const stationsPath = await ensureLocalLookupFile('ghcnd-stations.parquet', 'parquet/ghcnd-stations.parquet');
        const countriesPath = await ensureLocalLookupFile('ghcnd-countries.parquet', 'parquet/ghcnd-countries.parquet');
        const statesPath = await ensureLocalLookupFile('ghcnd-states.parquet', 'parquet/ghcnd-states.parquet');

        // Build geographic filter if needed
        let geoFilter = '';
        if (country || state) {
            geoFilter = `
                AND ID IN (
                    SELECT st.id 
                    FROM read_parquet('${stationsPath}') st
                    LEFT JOIN read_parquet('${countriesPath}') c
                        ON SUBSTRING(st.id, 1, 2) = c.s
                    LEFT JOIN read_parquet('${statesPath}') states
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
            FROM read_parquet('${dataPath}')
            WHERE DATA_VALUE IS NOT NULL 
                AND DATA_VALUE != -9999
                AND (Q_FLAG IS NULL OR Q_FLAG != 'X')
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
                FROM read_parquet('${dataPath}')
                WHERE DATA_VALUE IS NOT NULL 
                    AND DATA_VALUE != -9999
                    AND (Q_FLAG IS NULL OR Q_FLAG != 'X')
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

        console.log('Query: ', query);

        profileQuery('all', query, (err, result) => {
            if (err) {
                console.error('Database error:', err);
                res.status(500).json({ error: 'Database query failed' });
            } else {
                try {
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
