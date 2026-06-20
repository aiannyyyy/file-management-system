import { useState, useEffect, useMemo } from "react";
import React from "react";
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatProvider } from "./contexts/ChatContext";
import { useChat } from "./contexts/ChatContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./components/Dashboard";
import Files from "./components/Files";
import Categories from "./components/Categories";
import Login from "./components/Login";
import Register from "./components/Register";
import Layout from "./components/Layout";
import FloatingChat from "./components/FloatingChat";

interface User {
  id?: string | number;
  name: string;
  user_name: string;
  department?: string;
  role: string;
}

interface UserData {
  token: string;
  user: User;
}

// Temporary Settings Page
function Settings() {
  return <h2 className="text-2xl font-bold">⚙️ Settings Page</h2>;
}

// Error Page
function ErrorPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center text-red-600">
      <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
      <p className="mt-2">The page you're looking for doesn't exist.</p>
    </div>
  );
}

// Chat Initializer - Separate component inside ChatProvider
function ChatInitializer({ userData }: { userData: UserData }) {
  const { initializeSocket } = useChat();

  useEffect(() => {
    if (userData?.user?.id) {
      console.log('🔵 ChatInitializer: Initializing socket for user:', userData.user.id);
      initializeSocket(Number(userData.user.id), {
        id: Number(userData.user.id),
        user_name: userData.user.user_name,
        name: userData.user.name,
        email: userData.user.email || 'no-email@example.com'
      });
    }
  }, [userData, initializeSocket]);

  return null;
}

// Chat Widget Wrapper - passes userData to FloatingChat
function ChatWidgetWrapper({ userData }: { userData: UserData }) {
  return (
    <FloatingChat
      currentUserData={{
        id: Number(userData.user.id),
        user_name: userData.user.user_name,
        name: userData.user.name,
        email: userData.user.email || 'no-email@example.com'
      }}
    />
  );
}

// Layout wrapper - just for routing structure
function AuthenticatedLayout({ userData, handleLogout }: { userData: UserData; handleLogout: () => void }) {
  return (
    <AuthProvider userData={userData} onLogout={handleLogout}>
      <Layout userData={userData} onLogout={handleLogout}>
        <Outlet />
      </Layout>
    </AuthProvider>
  );
}

function AppRoutes({ userData, handleLogout }: { userData: UserData; handleLogout: () => void }) {
  const router = useMemo(() => {
    return createBrowserRouter([
      {
        path: "/",
        element: <AuthenticatedLayout userData={userData} handleLogout={handleLogout} />,
        errorElement: <ErrorPage />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "dashboard",
            element: (
              <ProtectedRoute userData={userData} onLogout={handleLogout}>
                <Dashboard currentUser={userData.user} />
              </ProtectedRoute>
            ),
          },
          {
            path: "files",
            element: (
              <ProtectedRoute userData={userData} onLogout={handleLogout}>
                <Files currentUser={userData.user} />
              </ProtectedRoute>
            ),
          },
          {
            path: "categories",
            element: (
              <ProtectedRoute userData={userData} onLogout={handleLogout}>
                <Categories currentUser={userData.user} />
              </ProtectedRoute>
            ),
          },
          {
            path: "settings",
            element: (
              <ProtectedRoute userData={userData} onLogout={handleLogout}>
                <Settings />
              </ProtectedRoute>
            ),
          },
        ],
      },
    ]);
  }, [userData, handleLogout]);

  return <RouterProvider router={router} />;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  // Check for existing token on app load
  useEffect(() => {
    try {
      const token = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('userData');
      
      if (token && storedUser) {
        // Check if token is expired (JWT decode)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isExpired = payload.exp * 1000 < Date.now();
        
        if (isExpired) {
          console.log('Token expired, clearing...');
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          localStorage.removeItem('token');
          setIsLoading(false);
          return;
        }

        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && parsedUser.user_name) {
          setUserData({ token, user: parsedUser });
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
        }
      }
    } catch (error) {
      console.log('Error parsing stored user data, clearing...', error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('token');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoginSuccess = (userData: UserData) => {
    console.log('Login successful, user data:', userData);
    setUserData(userData);
    setIsAuthenticated(true);
    
    try {
      localStorage.setItem('authToken', userData.token);
      localStorage.setItem('userData', JSON.stringify(userData.user));
      localStorage.setItem('token', userData.token);
    } catch (error) {
      console.error('Failed to store user data:', error);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserData(null);
    try {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('token');
    } catch (error) {
      console.error('Failed to clear user data:', error);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('token');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // If not authenticated, show login or register
  if (!isAuthenticated || !userData) {
    if (showRegister) {
      return (
        <Register
          onBack={() => setShowRegister(false)}
          onSuccess={() => setShowRegister(false)}
        />
      );
    }

    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onRegister={() => setShowRegister(true)}
      />
    );
  }

  // ✅ FIXED: Authenticated - wrap everything with ChatProvider
  // ChatInitializer, ChatWidgetWrapper are INSIDE ChatProvider
  return (
    <ChatProvider userId={Number(userData.user.id)}>
      <AppRoutes userData={userData} handleLogout={handleLogout} />
      <ChatInitializer userData={userData} />
      <ChatWidgetWrapper userData={userData} />
    </ChatProvider>
  );
}