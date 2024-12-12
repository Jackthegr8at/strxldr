import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Leaderboard = () => {
  const [data, setData] = useState<[string, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [filterAmount, setFilterAmount] = useState<number | null>(null);
  const [cachedData, setCachedData] = useState<[string, number][] | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('https://nfts.jessytremblay.com/STRX/stakes.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonData = await response.json();
      const entries = Object.entries(jsonData) as [string, number][];
      setCachedData(entries);
      setData(entries);
      
      const chartData = entries.sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, value], index) => ({
        rank: index + 1,
        name: name.slice(0, 8) + '...', // Truncate for readability
        value: value,
      }));
      setChartData(chartData);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedData) {
      setData(cachedData);
    } else {
      fetchData();
    }
  }, [fetchData, cachedData]);

  useEffect(() => {
    if (cachedData) {
      let filteredData = [...cachedData];

      if (filterAmount !== null) {
        filteredData = filteredData.filter(([, amount]) => amount >= filterAmount);
      }

      if (sortConfig) {
        filteredData.sort((a, b) => {
          const aValue = a[1];
          const bValue = b[1];
          if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
          return 0;
        });
      }
      setData(filteredData);
    }
  }, [cachedData, sortConfig, filterAmount]);

  const handleSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFilterAmount(value === '' ? null : parseFloat(value));
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(data.length / itemsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const renderPaginationButtons = () => {
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(
        <button
          key={i}
          onClick={() => paginate(i)}
          className={`px-3 py-1 mx-1 rounded-md ${currentPage === i ? 'bg-purple-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
        >
          {i}
        </button>
      );
    }
    return pageNumbers;
  };

  const renderTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="py-2 px-4 border-b text-left">Rank</th>
            <th className="py-2 px-4 border-b text-left cursor-pointer" onClick={() => handleSort('username')}>Username</th>
            <th className="py-2 px-4 border-b text-left cursor-pointer" onClick={() => handleSort('amount')}>Staked Amount</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map(([username, amount], index) => (
            <tr key={username} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
              <td className="py-2 px-4 border-b">{indexOfFirstItem + index + 1}</td>
              <td className="py-2 px-4 border-b">{username}</td>
              <td className="py-2 px-4 border-b">{amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderChart = () => (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#7C63CC" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="bg-white min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4 text-center text-purple-700">STRX Staking Leaderboard</h1>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <label htmlFor="filter" className="mr-2">Filter by amount:</label>
          <input
            type="number"
            id="filter"
            placeholder="Enter amount"
            className="border border-gray-300 rounded-md p-1"
            onChange={handleFilterChange}
          />
        </div>
        <div className="flex items-center">
          <button
            onClick={() => paginate(1)}
            disabled={currentPage === 1}
            className={`px-3 py-1 mx-1 rounded-md ${currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
          >
            First
          </button>
          <button
            onClick={() => paginate(currentPage - 1)}
            disabled={currentPage === 1}
            className={`px-3 py-1 mx-1 rounded-md ${currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
          >
            Previous
          </button>
          <button
            onClick={() => paginate(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`px-3 py-1 mx-1 rounded-md ${currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
          >
            Next
          </button>
          <button
            onClick={() => paginate(totalPages)}
            disabled={currentPage === totalPages}
            className={`px-3 py-1 mx-1 rounded-md ${currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
          >
            Last
          </button>
        </div>
      </div>

      {loading && <div className="text-center">Loading...</div>}
      {error && <div className="text-center text-red-500">Error: {error}</div>}
      {!loading && !error && data.length > 0 && (
        <>
          {renderChart()}
          {renderTable()}
        </>
      )}
      {!loading && !error && data.length === 0 && <div className="text-center">No data available.</div>}

      <div className="mt-4 flex justify-center">
        {renderPaginationButtons()}
      </div>
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => paginate(1)}
          disabled={currentPage === 1}
          className={`px-3 py-1 mx-1 rounded-md ${currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
        >
          First
        </button>
        <button
          onClick={() => paginate(currentPage - 1)}
          disabled={currentPage === 1}
          className={`px-3 py-1 mx-1 rounded-md ${currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
        >
          Previous
        </button>
        <button
          onClick={() => paginate(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`px-3 py-1 mx-1 rounded-md ${currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
        >
          Next
        </button>
        <button
          onClick={() => paginate(totalPages)}
          disabled={currentPage === totalPages}
          className={`px-3 py-1 mx-1 rounded-md ${currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
        >
          Last
        </button>
      </div>
    </div>
  );
};

export default Leaderboard;
