import { createBrowserRouter, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import CreateRoom from './pages/CreateRoom';
import PreJoin from './pages/PreJoin';
import Call from './pages/Call';
import ProtectedRoute from './components/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
  },
  {
    path: '/rooms/create',
    element: (
      <ProtectedRoute>
        <CreateRoom />
      </ProtectedRoute>
    ),
  },
  {
    path: '/pre-join/:roomCode',
    element: (
      <ProtectedRoute>
        <PreJoin />
      </ProtectedRoute>
    ),
  },
  {
    path: '/call/:roomCode',
    element: (
      <ProtectedRoute>
        <Call />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

