// Add Nifty 50 stocks via the application API
// This uses the running application's database connection

const assets = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd' },
  { symbol: 'SBIN', name: 'State Bank of India' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd' },
  { symbol: 'INFY', name: 'Infosys Ltd' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd' },
  { symbol: 'ITC', name: 'ITC Ltd' },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd' },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd' },
  { symbol: 'HCLTECH', name: 'HCL Technologies Ltd' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd' },
  { symbol: 'TITAN', name: 'Titan Company Ltd' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd' },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corporation Ltd' },
  { symbol: 'NTPC', name: 'NTPC Ltd' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd' },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd' },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation of India Ltd' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra Ltd' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv Ltd' },
  { symbol: 'WIPRO', name: 'Wipro Ltd' },
  { symbol: 'TECHM', name: 'Tech Mahindra Ltd' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports and Special Economic Zone Ltd' },
  { symbol: 'COALINDIA', name: 'Coal India Ltd' },
  { symbol: 'DIVISLAB', name: 'Divi\'s Laboratories Ltd' },
  { symbol: 'DRREDDY', name: 'Dr. Reddy\'s Laboratories Ltd' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors Ltd' },
  { symbol: 'GRASIM', name: 'Grasim Industries Ltd' },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp Ltd' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries Ltd' },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank Ltd' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel Ltd' },
  { symbol: 'SBILIFE', name: 'SBI Life Insurance Company Ltd' },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products Ltd' },
  { symbol: 'CIPLA', name: 'Cipla Ltd' },
  { symbol: 'BPCL', name: 'Bharat Petroleum Corporation Ltd' },
  { symbol: 'BRITANNIA', name: 'Britannia Industries Ltd' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals Enterprise Ltd' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance Company Ltd' },
  { symbol: 'UPL', name: 'UPL Ltd' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto Ltd' },
  { symbol: 'LTIM', name: 'LTIMindtree Ltd' },
];

async function addAssets() {
  console.log('📊 Adding Nifty 50 stocks...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const asset of assets) {
    try {
      const response = await fetch('http://localhost:5000/api/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: asset.symbol,
          name: asset.name,
          type: 'indian_stock',
          exchange: 'NSE',
          enabled: true,
        }),
      });
      
      if (response.ok) {
        console.log(`   ✅ ${asset.symbol} - added successfully`);
        successCount++;
      } else {
        const error = await response.json();
        console.log(`   ⚠️  ${asset.symbol} - ${error.error || 'failed'}`);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`   ❌ ${asset.symbol} - ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n📈 Summary:`);
  console.log(`   ✅ Successfully added: ${successCount}`);
  console.log(`   ❌ Errors/Skipped: ${errorCount}`);
  console.log(`   📊 Total: ${assets.length}`);
}

addAssets();
