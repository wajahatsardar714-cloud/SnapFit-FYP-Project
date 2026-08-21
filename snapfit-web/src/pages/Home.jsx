import { useEffect, useState } from 'react';
import api from '../services/api';

function Home() {
  const [backendStatus, setBackendStatus] = useState('checking...');

  useEffect(() => {
    api
      .get('/health')
      .then((res) => setBackendStatus(res.data.status))
      .catch(() => setBackendStatus('unreachable'));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="rounded-lg bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-gray-800">SnapFit</h1>
        <p className="mt-2 text-gray-600">Backend status: {backendStatus}</p>
      </div>
    </div>
  );
}

export default Home;
