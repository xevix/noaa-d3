# Unit Tests for NOAA Weather Visualizer

This document describes the comprehensive unit test suite that has been added to the NOAA weather visualization project.

## Test Framework Setup

- **Testing Framework**: Jest
- **HTTP Testing**: Supertest for API endpoint testing
- **DOM Testing**: jsdom environment for client-side testing
- **Test Coverage**: Built-in Jest coverage reporting

## Test Files

### 1. `__tests__/utils.test.js`
Tests for utility functions that can be extracted and tested independently:

#### Utility Functions Tested:
- **convertValue**: Converts NOAA data values (temperatures divided by 10, precipitation divided by 10)
- **parseDate**: Parses YYYYMMDD date strings to JavaScript Date objects
- **formatDate**: Formats date strings to YYYY-MM-DD format
- **formatValue**: Formats values with appropriate units (°C, mm, etc.)
- **getValueLabel**: Returns appropriate labels for different weather elements
- **normalizeCountryName**: Normalizes country names for consistency
- **buildGeoFilter**: Builds SQL geographic filters for database queries
- **buildDateFilter**: Builds SQL date range filters
- **aggregateDataByDate**: Aggregates weather data by date
- **sortTableData**: Sorts table data by column and direction

### 2. `__tests__/app.test.js`
Tests for client-side functionality and browser-specific features:

#### Features Tested:
- **Data Conversion Functions**: Temperature and precipitation value conversions
- **Data Processing**: Date parsing, aggregation by date, heatmap data preparation
- **Table Functions**: Sorting, date formatting, value formatting with units
- **URL Parameter Handling**: Building and parsing URL parameters
- **API Integration**: Mocked fetch calls for loading years, weather data
- **Error Handling**: Error message display, missing DOM element handling

### 3. `__tests__/server.test.js`
Tests for server-side utility functions and data processing:

#### Server Functions Tested:
- **convertValue**: Server-side value conversion logic
- **SQL Query Building**: Geographic and date filters for database queries
- **Data Processing**: Element name extraction from directories, year extraction
- **Error Handling**: Database error handling, appropriate error responses
- **Data Validation**: Parameter validation, year range validation

## Test Coverage

The test suite includes 70 comprehensive tests covering:

- ✅ **Data Conversion**: Temperature, precipitation, and other weather data conversions
- ✅ **Date Handling**: Parsing, formatting, and validation of date strings
- ✅ **Table Operations**: Sorting, formatting, and display of tabular data
- ✅ **API Integration**: Mocked HTTP requests and responses
- ✅ **Error Handling**: Graceful error handling and user feedback
- ✅ **URL Management**: Parameter building and parsing for application state
- ✅ **Database Queries**: SQL filter building and validation
- ✅ **File System Operations**: Directory parsing and data extraction

## Running Tests

### Run All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Categories

### Unit Tests
- Individual function testing with various inputs and edge cases
- Data type validation and conversion testing
- Error condition handling

### Integration Tests
- API endpoint functionality (mocked)
- Data flow between components
- Error propagation and handling

### Edge Case Testing
- Invalid input handling
- Null/undefined value processing
- Boundary condition testing
- Empty data set handling

## Mock Strategy

The test suite uses comprehensive mocking for:

### External Dependencies
- **D3.js**: Mocked for DOM manipulation and visualization
- **DuckDB**: Mocked database connections and queries
- **File System**: Mocked directory reading and file operations
- **Fetch API**: Mocked HTTP requests and responses

### DOM Environment
- **jsdom**: Provides browser-like environment for client-side tests
- **Document/Window**: Mocked DOM APIs and browser objects
- **Local Storage**: Mocked browser storage APIs

## Benefits of This Test Suite

1. **Quality Assurance**: Ensures core functionality works as expected
2. **Regression Prevention**: Catches breaking changes during development
3. **Documentation**: Tests serve as living documentation of expected behavior
4. **Refactoring Safety**: Allows safe code modifications with confidence
5. **Development Speed**: Fast feedback on code changes
6. **Edge Case Coverage**: Tests handle various error conditions and edge cases

## Future Test Enhancements

Consider adding:
- End-to-end tests with real browser automation
- Performance testing for large datasets
- Visual regression testing for charts and maps
- Integration tests with actual database connections
- Load testing for API endpoints

## Test Configuration

The test configuration is defined in `package.json`:

```json
{
  "jest": {
    "testEnvironment": "node",
    "collectCoverageFrom": [
      "*.js",
      "!eslint.config.js",
      "!jest.config.js"
    ],
    "coverageDirectory": "coverage",
    "testMatch": [
      "**/__tests__/**/*.js",
      "**/?(*.)+(spec|test).js"
    ]
  }
}
```

This comprehensive test suite provides a solid foundation for maintaining and enhancing the NOAA weather visualization application. 