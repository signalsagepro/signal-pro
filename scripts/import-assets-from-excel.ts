import XLSX from 'xlsx';
import pg from 'pg';

// Load environment variables from .env file
const fs = await import('fs');
const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("render.com") || databaseUrl.includes("neon.tech") 
    ? { rejectUnauthorized: false } 
    : undefined,
});

async function importAssetsFromExcel() {
  console.log("📊 Importing assets from list_50.xlsx...\n");

  try {
    // Read the Excel file
    const workbook = XLSX.readFile('list_50.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to array of arrays (raw data)
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    // Parse CSV-like data from the single column
    const data = rawData
      .filter(row => row.length > 0 && row[0]) // Filter out empty rows
      .map(row => {
        const csvString = row[0] as string;
        const parts = csvString.split(',');
        if (parts.length >= 3) {
          return {
            index: parts[0],
            symbol: parts[1],
            name: parts.slice(2).join(',') // Join remaining parts in case name has commas
          };
        }
        return null;
      })
      .filter(row => row !== null);
    
    console.log(`Found ${data.length} assets in the Excel file\n`);
    console.log("Sample:", data[0]);
    
    const client = await pool.connect();
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    try {
      for (const row of data as any[]) {
        try {
          const symbol = row.symbol;
          const name = row.name;
          
          if (!symbol) {
            console.log(`⚠️  Skipping row - no symbol found:`, row);
            skipCount++;
            continue;
          }

          // Check if asset already exists
          const existingAsset = await client.query(
            'SELECT id FROM assets WHERE symbol = $1',
            [symbol]
          );

          if (existingAsset.rows.length > 0) {
            console.log(`   ⏭️  ${symbol} - already exists, skipping`);
            skipCount++;
            continue;
          }

          // Insert new asset
          await client.query(
            `INSERT INTO assets (symbol, name, type, exchange, enabled) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              symbol,
              name,
              'indian_stock', // Default type
              'NSE',          // Default exchange
              true            // Enabled by default
            ]
          );

          console.log(`   ✅ ${symbol} - added successfully`);
          successCount++;
        } catch (error: any) {
          console.log(`   ❌ Error adding ${(row as any).Symbol || 'unknown'}: ${error.message}`);
          errorCount++;
        }
      }

      console.log(`\n📈 Import Summary:`);
      console.log(`   ✅ Successfully added: ${successCount}`);
      console.log(`   ⏭️  Skipped (already exists): ${skipCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   📊 Total rows processed: ${data.length}`);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error("❌ Error reading Excel file:", error);
    process.exit(1);
  }
}

importAssetsFromExcel();
