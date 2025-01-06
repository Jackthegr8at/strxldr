import { Connection, PublicKey } from "@solana/web3.js";
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk";

// SOL-STRX pool ID from Raydium
const STRX_SOL_POOL_ID = "5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf";

async function getTokenBalance(connection: Connection, vault: PublicKey, decimals: number): Promise<number> {
  const balance = await connection.getTokenAccountBalance(vault);
  return parseFloat(balance.value.amount) / Math.pow(10, decimals);
}

export default async function handler(req, res) {
  try {
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    
    const info = await connection.getAccountInfo(new PublicKey(STRX_SOL_POOL_ID));
    if (!info) {
      throw new Error("Pool not found");
    }
    
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
    
    // SOL has 9 decimals, STRX has 6 decimals
    const solDecimals = 9;
    const strxDecimals = 6;
    
    const solBalance = await getTokenBalance(connection, poolState.baseVault, solDecimals);
    const strxBalance = await getTokenBalance(connection, poolState.quoteVault, strxDecimals);
    
    const strxPriceInSol = solBalance / strxBalance;
    
    res.status(200).json({
      strxPriceInSol,
      solLiquidity: solBalance,
      strxLiquidity: strxBalance,
      totalLiquidityInSol: solBalance * 2, // Assuming balanced pool
    });
    
  } catch (error) {
    console.error('Error fetching Raydium data:', error);
    res.status(500).json({ error: 'Failed to fetch Raydium data' });
  }
} 