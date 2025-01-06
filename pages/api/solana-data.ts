export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://public-api.solscan.io/token/meta/STRXzrUKLEpXTVN5oyXaSZgt38MUcWN8VRAZUAVFX3j',
      {
        headers: {
          'token': process.env.SOLSCAN_API_KEY || ''
        } as HeadersInit
      }
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Solana data' });
  }
} 