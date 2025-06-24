# /// script
# dependencies = [
#   "duckdb",
# ]
# ///

"""
Convert fixed-width space-separated text files to pipe-delimited CSV files.
"""

import subprocess
import sys
import os
from pathlib import Path

import duckdb

# From readme.txt of the GHCND data set:
# IV. FORMAT OF "ghcnd-stations.txt"

# ------------------------------
# Variable   Columns   Type
# ------------------------------
# ID            1-11   Character
# LATITUDE     13-20   Real
# LONGITUDE    22-30   Real
# ELEVATION    32-37   Real
# STATE        39-40   Character
# NAME         42-71   Character
# GSN FLAG     73-75   Character
# HCN/CRN FLAG 77-79   Character
# WMO ID       81-85   Character
# ------------------------------

# Convert the above list into a list of column names and start positions but not the end positions, one tuple each
column_names_and_start_positions = {'stations': [
    ('ID', 1),
    ('LATITUDE', 13),
    ('LONGITUDE', 22),
    ('ELEVATION', 32),
    ('STATE', 39),
    ('NAME', 42),
    ('GSN FLAG', 73),
    ('HCN/CRN FLAG', 77),
    ('WMO ID', 81),
]}


def extract_columns(line, column_starts):
    """
    Extract column values from a line using the identified column positions.
    
    Args:
        line: String (single line from file)
        column_starts: List of column start positions
        
    Returns:
        List of column values (stripped of leading/trailing spaces)
    """
    line = line.rstrip('\n')
    columns = []
    
    for i in range(len(column_starts)):
        if i < len(column_starts) - 1:
            # Extract from current start to next start
            col_value = line[column_starts[i]:column_starts[i+1]]
        else:
            # Last column: extract from start to end of line
            col_value = line[column_starts[i]:]
        
        # Strip trailing spaces from column value
        columns.append(col_value.rstrip())
    
    return columns


def convert_fixed_width_to_csv(input_filepath, output_filepath, data_set_name):
    """
    Convert a fixed-width file to a pipe-delimited CSV file.
    
    Args:
        input_filepath: Path to the input fixed-width file
    """
    # Read all lines from the input file
    try:
        with open(input_filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"Error: File '{input_filepath}' not found.")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return
    
    if not lines:
        print("Error: Input file is empty.")
        return
    
    column_starts = [start_pos - 1 for _, start_pos in column_names_and_start_positions[data_set_name]]

    # Write the header row, but lowercase the column names and replace spaces with underscores
    header_row = [name.lower().replace(' ', '_') for name, _ in column_names_and_start_positions[data_set_name]]
    with open(output_filepath, 'w', encoding='utf-8') as f:
        f.write('|'.join(header_row) + '\n')
    
    # Convert and write to CSV
    try:
        with open(output_filepath, 'w', encoding='utf-8') as f:
            for line_num, line in enumerate(lines):
                # Extract columns from this line
                columns = extract_columns(line, column_starts)
                
                # Write as pipe-delimited CSV
                f.write('|'.join(columns) + '\n')
                
                # Progress indicator for large files
                if (line_num + 1) % 1000 == 0:
                    print(f"Processed {line_num + 1} lines...")
        
        print(f"\nConversion complete!")
        print(f"Input:  {input_filepath}")
        print(f"Output: {output_filepath}")
        print(f"Total lines processed: {len(lines)}")
        
    except Exception as e:
        print(f"Error writing output file: {e}")
        return
    
def download_from_s3_if_not_exists(s3_path, local_path):
    """
    Download a file from S3 to a local path if it does not exist.
    """
    if not os.path.exists(local_path):
        print(f"File '{local_path}' not found. Downloading from S3...")
        subprocess.run(["aws", "s3", "cp", "--no-sign-request", s3_path, local_path])
        print(f"Downloaded file '{local_path}' from S3.")
    else:
        print(f"File '{local_path}' already exists. Skipping download.")

def convert_to_parquet(input_filepath, output_filepath):
    """
    Convert a CSV file to a Parquet file using DuckDB.
    """
    duckdb.sql(f"COPY (FROM '{input_filepath}') TO '{output_filepath}' (PARQUET_VERSION V2, COMPRESSION ZSTD)")

def main():
    """Main entry point for the script."""
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <data_set_name>")
        print("\nThis script converts a fixed-width space-separated file to a")
        print("pipe-delimited CSV file. The data set name is used to determine")
        print("the column names and start positions.")
        sys.exit(1)
    
    data_set_name = sys.argv[1]
    input_filepath = f"data/ghcnd-{data_set_name}.txt"
    output_filepath = f"data/ghcnd-{data_set_name}.csv"
    # If the parquet file doesn't exist, convert the CSV to parquet 
    parquet_filepath = f"data/ghcnd-{data_set_name}.parquet"
    if not os.path.exists(parquet_filepath):
        download_from_s3_if_not_exists(f"s3://noaa-ghcn-pds/ghcnd-{data_set_name}.txt", input_filepath)
        convert_fixed_width_to_csv(input_filepath, output_filepath, data_set_name)
        convert_to_parquet(output_filepath, parquet_filepath)
    else:
        print(f"Parquet file '{parquet_filepath}' already exists. Skipping conversion.")


if __name__ == "__main__":
    main()
