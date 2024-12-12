import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function Home() {
  const [stakes, setStakes] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('https://nfts.jessytremblay.com/STRX/stakes.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setStakes(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><p className="text-purple-600 text-2xl font-bold">Loading...</p></div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen"><p className="text-red-600 text-2xl font-bold">Error: {error}</p></div>;
  }

  const chartData = Object.entries(stakes || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="bg-white p-4">
      <h1 className="text-3xl font-bold text-purple-600 mb-8 text-center">STRX Staking Leaderboard</h1>
      <div className="flex justify-center items-center">
        <BarChart
          width={800}
          height={500}
          data={chartData.sort((a, b) => b.value - a.value).slice(0, 20)}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#7C63CC" />
        </BarChart>
      </div>
    </div>
  );
}