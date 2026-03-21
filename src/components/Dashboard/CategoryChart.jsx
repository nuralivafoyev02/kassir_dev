import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export function CategoryChart({ transactions }) {
  const categories = {};
  transactions.forEach(t => {
    if (t.type === 'expense') {
      categories[t.category] = (categories[t.category] || 0) + Number(t.amount);
    }
  });

  const sorted = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const data = {
    labels: sorted.map(s => s[0]),
    datasets: [
      {
        data: sorted.map(s => s[1]),
        backgroundColor: [
          '#a855f7',
          '#ec4899',
          '#3b82f6',
          '#10b981',
          '#f59e0b'
        ],
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  };

  const options = {
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          font: {
            family: 'Plus Jakarta Sans',
            size: 10,
            weight: 'bold'
          },
          padding: 20,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: '#161625',
        titleFont: { family: 'Plus Jakarta Sans', size: 12 },
        bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
        padding: 12,
        cornerRadius: 12,
        displayColors: false
      }
    },
    cutout: '70%',
    maintainAspectRatio: false
  };

  if (sorted.length === 0) return null;

  return (
    <div className="panel" style={{ height: '320px' }}>
      <div className="panel-ttl">Xarajatlar Diagrammasi</div>
      <div style={{ height: '220px', position: 'relative' }}>
        <Doughnut data={data} options={options} />
      </div>
    </div>
  );
}
