import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from './ThemeProvider';

const ThemedTooltip = ({ active, payload, label }: any) => {
  const { theme } = useTheme();
  
  if (!active || !payload) return null;
  
  return (
    <div
      style={{
        backgroundColor: theme === 'dark' ? 'black' : 'white',
        border: '1px solid #6B21A8',
        borderRadius: '8px',
        color: theme === 'dark' ? 'white' : 'black',
        padding: '8px'
      }}
    >
      <p className="font-medium">{label}</p>
      <p>Staked : {payload[0]?.value.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
        useGrouping: true,
      })}</p>
    </div>
  );
};

type StakersChartProps = {
  topHolders: any[];
  sortField: string;
  formatLargeNumber: (value: number) => string;
};

export const StakersChart = ({ topHolders, sortField, formatLargeNumber }: StakersChartProps) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={topHolders} margin={{ left: 50, right: 20, top: 20, bottom: 20 }}>
        <XAxis 
          dataKey="username" 
          tick={{ fill: 'var(--axis-color)' }}
        />
        <YAxis 
          tickFormatter={formatLargeNumber}
          tick={{ fill: 'var(--axis-color)' }}
        />
        <Tooltip content={<ThemedTooltip />} />
        <Bar 
          dataKey={sortField === 'rewards' ? 'staked' : sortField} 
          fill="#7C63CC" 
        />
      </BarChart>
    </ResponsiveContainer>
  );
};
