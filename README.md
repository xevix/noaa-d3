# NOAA Weather Data Visualization

A D3.js-based web application for visualizing NOAA weather data stored in Parquet files using DuckDB for efficient querying.

## Features

- **Interactive Data Visualization**: View weather data through line charts, bar charts, and heat maps
- **Multiple Weather Elements**: Supports Temperature (TMAX, TMIN, TAVG) and Precipitation (PRCP) data
- **Year Selection**: Choose from available years (2020-2023)
- **Real-time Querying**: Uses DuckDB to query Parquet files directly without preprocessing
- **Responsive Design**: Clean, modern interface that works on different screen sizes

## Prerequisites
- [uv (Python package manager)](https://docs.astral.sh/uv/getting-started/installation/) - for running Python scripts to fetch data
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) - for downloading data from S3
- [Node.js](https://nodejs.org/en/download) (v14 or higher)

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Fetch dimensions
   ```bash
   npm run fetch-metadata
   ```

## Usage

1. Start the server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Use the controls to:
   - Select a year
   - Choose a weather element (Temperature or Precipitation) 
   - Pick a chart type (Line, Bar, or Heat Map)

## Data Structure

The application downloads NOAA weather data as needed and stores it in `data` in the following directory structure:
```
data/by_year/
├── YEAR=2020/
│   ├── ELEMENT=TMAX/
│   ├── ELEMENT=TMIN/
│   ├── ELEMENT=PRCP/
│   └── ...
├── YEAR=2021/
└── ...
```

## Chart Types

- **Line Chart**: Shows daily temperature/precipitation trends over time
- **Bar Chart**: Displays monthly averages 
- **Heat Map**: Provides a calendar view showing values by day and month

## Dependencies

- **D3.js**: Data visualization library
- **DuckDB**: Fast analytical database for querying Parquet files
- **Express.js**: Web server framework

## API Endpoints

- `GET /api/weather/:year/:element`: Returns weather data for the specified year and element

## Development

To run in development mode:
```bash
npm run dev
```

The server will start on port 3000 and serve the static files.