#!/usr/bin/env node

/**
 * Map Data Download Script
 * 
 * This script downloads the required map data files for the NOAA Weather Visualizer:
 * - US States TopoJSON (unprojected boundaries)
 * - Canadian Provinces & Territories GeoJSON
 * 
 * Usage:
 *   node scripts/download_map_data.js
 *   OR
 *   ./scripts/download_map_data.js
 * 
 * The script will:
 * 1. Download the latest versions of both map files
 * 2. Save them to the data/ directory with the correct filenames
 * 3. Show download progress and file sizes
 * 4. Provide a summary of successful/failed downloads
 * 
 * Sources:
 * - US States: https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json
 * - Canadian Provinces: GitHub Gist by M1r1k with Canadian provinces GeoJSON
 * 
 * Note: These files are used by app.js for rendering state/province maps
 * when users select specific locations in the weather visualization.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

// Configuration for the map data files to download
const mapFiles = [
    {
        name: 'US States TopoJSON',
        url: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
        filename: 'us-states-10m.json',
        description: 'TopoJSON file with US state boundaries (unprojected)'
    },
    {
        name: 'Canadian Provinces GeoJSON',
        url: 'https://gist.githubusercontent.com/M1r1k/d5731bf39e1dfda5b53b4e4c560d968d/raw/canada_provinces.geo.json',
        filename: 'canada-provinces-territories.geo.json',
        description: 'GeoJSON file with Canadian provinces and territories'
    }
];

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory');
}

/**
 * Download a file from URL and save it to the specified path
 * @param {string} url - The URL to download from
 * @param {string} filePath - The local file path to save to
 * @returns {Promise<void>}
 */
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading from: ${url}`);
        
        const file = fs.createWriteStream(filePath);
        
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                console.log(`Redirecting to: ${response.headers.location}`);
                return downloadFile(response.headers.location, filePath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`✓ Downloaded: ${path.basename(filePath)}`);
                resolve();
            });
            
            file.on('error', (err) => {
                fs.unlink(filePath, () => {}); // Delete the file on error
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Get file size in a human-readable format
 * @param {string} filePath - Path to the file
 * @returns {string} - Formatted file size
 */
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const bytes = stats.size;
        
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    } catch {
        return 'Unknown';
    }
}

/**
 * Main function to download all map files
 */
async function downloadMapData() {
    console.log('🗺️  Downloading map data files...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const mapFile of mapFiles) {
        try {
            const filePath = path.join(dataDir, mapFile.filename);
            
            console.log(`📍 ${mapFile.name}`);
            console.log(`   ${mapFile.description}`);
            
            // Check if file already exists
            if (fs.existsSync(filePath)) {
                const currentSize = getFileSize(filePath);
                console.log(`   Current file exists (${currentSize})`);
                console.log('   Downloading new version...');
            }
            
            await downloadFile(mapFile.url, filePath);
            
            const fileSize = getFileSize(filePath);
            console.log(`   File size: ${fileSize}`);
            console.log('   ✅ Success\n');
            
            successCount++;
            
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}\n`);
            errorCount++;
        }
    }
    
    // Summary
    console.log('📊 Download Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📁 Saved to: ${dataDir}`);
    
    if (errorCount > 0) {
        console.log('\n⚠️  Some downloads failed. Please check the URLs and try again.');
        process.exit(1);
    } else {
        console.log('\n🎉 All map data files downloaded successfully!');
    }
}

// Handle command line execution
if (require.main === module) {
    downloadMapData()
        .catch((error) => {
            console.error('❌ Script failed:', error.message);
            process.exit(1);
        });
}

module.exports = { downloadMapData }; 