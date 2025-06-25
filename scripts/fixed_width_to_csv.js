// fixed_width_to_csv.js
// Translation of fixed_width_to_csv.py to JavaScript (Node.js)
// Dependencies: aws-cli (for S3), duckdb (Node.js package), fs, path

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const duckdb = require('duckdb');

// Column definitions as in the Python script
const columnNamesAndStartPositions = {
  stations: [
    ['ID', 1],
    ['LATITUDE', 13],
    ['LONGITUDE', 22],
    ['ELEVATION', 32],
    ['STATE', 39],
    ['NAME', 42],
    ['GSN FLAG', 73],
    ['HCN/CRN FLAG', 77],
    ['WMO ID', 81],
  ],
  countries: [
    ['CODE', 1],
    ['NAME', 4],
  ],
  states: [
    ['CODE', 1],
    ['NAME', 4],
  ],
};

function extractColumns(line, columnStarts) {
  const columns = [];
  for (let i = 0; i < columnStarts.length; i++) {
    const start = columnStarts[i];
    const end = i < columnStarts.length - 1 ? columnStarts[i + 1] : undefined;
    const colValue = end ? line.slice(start, end) : line.slice(start);
    columns.push(colValue.trimEnd());
  }
  return columns;
}

function convertFixedWidthToCsv(inputFilePath, outputFilePath, dataSetName) {
  let lines;
  try {
    lines = fs.readFileSync(inputFilePath, 'utf-8').split('\n');
  } catch (err) {
    console.error(`Error: File '${inputFilePath}' not found or unreadable.`);
    return;
  }
  if (!lines.length || (lines.length === 1 && lines[0] === '')) {
    console.error('Error: Input file is empty.');
    return;
  }
  const columnStarts = columnNamesAndStartPositions[dataSetName].map(([, start]) => start - 1);
  const headerRow = columnNamesAndStartPositions[dataSetName].map(([name]) => name.toLowerCase().replace(/ /g, '_'));
  const out = fs.createWriteStream(outputFilePath, { encoding: 'utf-8' });
  out.write(headerRow.join('|') + '\n');
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const columns = extractColumns(line, columnStarts);
    out.write(columns.join('|') + '\n');
    if ((idx + 1) % 1000 === 0) {
      console.log(`Processed ${idx + 1} lines...`);
    }
  });
  out.end();
  console.log(`\nConversion complete!`);
  console.log(`Input:  ${inputFilePath}`);
  console.log(`Output: ${outputFilePath}`);
  console.log(`Total lines processed: ${lines.length}`);
}

function downloadFromS3IfNotExists(s3Path, localPath) {
  if (!fs.existsSync(localPath)) {
    console.log(`File '${localPath}' not found. Downloading from S3...`);
    execSync(`aws s3 cp --no-sign-request ${s3Path} ${localPath}`, { stdio: 'inherit' });
    console.log(`Downloaded file '${localPath}' from S3.`);
  } else {
    console.log(`File '${localPath}' already exists. Skipping download.`);
  }
}

function convertToParquet(inputFilePath, outputFilePath) {
  // Using DuckDB Node.js API
  console.log(`Converting ${inputFilePath} to ${outputFilePath}`);
  const db = new duckdb.Database(':memory:');
  db.run(
    `COPY (FROM read_csv('${inputFilePath}', delim='|', header=true)) TO '${outputFilePath}' (PARQUET_VERSION V2, COMPRESSION ZSTD)`,
    (err) => {
      if (err) {
        console.error('DuckDB error:', err);
      } else {
        console.log(`Converted ${inputFilePath} to ${outputFilePath}`);
      }
      db.close();
    }
  );
}

function convertDataSet(dataSetName) {
  const inputFilePath = `data/ghcnd-${dataSetName}.txt`;
  const outputFilePath = `data/ghcnd-${dataSetName}.csv`;
  const parquetFilePath = `data/ghcnd-${dataSetName}.parquet`;
  if (!fs.existsSync(parquetFilePath)) {
    downloadFromS3IfNotExists(`s3://noaa-ghcn-pds/ghcnd-${dataSetName}.txt`, inputFilePath);
    convertFixedWidthToCsv(inputFilePath, outputFilePath, dataSetName);
    convertToParquet(outputFilePath, parquetFilePath);
  } else {
    console.log(`Parquet file '${parquetFilePath}' already exists. Skipping conversion.`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    Object.keys(columnNamesAndStartPositions).sort().forEach(convertDataSet);
  } else if (args.length === 1) {
    convertDataSet(args[0]);
  } else {
    console.log(`Usage: node ${path.basename(process.argv[1])} [<data_set_name>]`);
    console.log('\nThis script converts a fixed-width space-separated file to a');
    console.log('pipe-delimited CSV file. The data set name is used to determine');
    console.log('the column names and start positions.');
    console.log('If no data set name is provided, all data sets will be processed.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 