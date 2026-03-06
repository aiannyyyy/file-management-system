/*
import { useState, useEffect } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Files from "./components/Files";
import Categories from "./components/Categories";
import CategoryFiles from "./components/CategoryFiles";
import Login from "./components/Login";

interface User {
  id?: string | number; // Add the id field that comes from your database
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

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on app load
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('userData');
    
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        
        // Validate that the stored data has required fields
        if (parsedUser && parsedUser.user_name) {
          setUserData({ token, user: parsedUser });
          setIsAuthenticated(true);
        } else {
          // Clear invalid stored data
          console.log('Invalid stored user data, clearing...');
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
        }
      } catch (error) {
        console.log('Error parsing stored user data, clearing...');
        // Clear invalid stored data
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
      }
    }
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = (userData: UserData) => {
    console.log('Login successful, user data:', userData);
    setUserData(userData);
    setIsAuthenticated(true);
    
    // Store in localStorage for persistence
    localStorage.setItem('authToken', userData.token);
    localStorage.setItem('userData', JSON.stringify(userData.user));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserData(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
  };

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // If not authenticated, show login
  if (!isAuthenticated || !userData) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Define authenticated routes
  const router = createBrowserRouter([
    {
      path: "/",
      element: <Navigate to="/dashboard" replace />,
      errorElement: <ErrorPage />,
    },
    {
      path: "/dashboard",
      element: (
        <Layout userData={userData} onLogout={handleLogout}>
          <Dashboard currentUser={userData.user} />
        </Layout>
      ),
      errorElement: <ErrorPage />,
    },
    {
      path: "/files",
      element: (
        <Layout userData={userData} onLogout={handleLogout}>
          <Files currentUser={userData.user} />
        </Layout>
      ),
      errorElement: <ErrorPage />,
    },
    {
      path: "/categories",
      element: (
        <Layout userData={userData} onLogout={handleLogout}>
          <Categories />
        </Layout>
      ),
      errorElement: <ErrorPage />,
    },
    {
      path: "/categoriesFiles",
      element: (
        <Layout userData={userData} onLogout={handleLogout}>
          <CategoryFiles />
        </Layout>
      ),
      errorElement: <ErrorPage />,
    },
    {
      path: "/settings",
      element: (
        <Layout userData={userData} onLogout={handleLogout}>
          <Settings />
        </Layout>
      ),
      errorElement: <ErrorPage />,
    },
  ]);

  return <RouterProvider router={router} />;
}

*/
import { useState, useEffect, useMemo } from "react";
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Files from "./components/Files";
import Categories from "./components/Categories";
import Login from "./components/Login";

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

// Protected Route Component
function ProtectedRoute({ userData, onLogout, children }: { 
  userData: UserData; 
  onLogout: () => void; 
  children: React.ReactNode;
}) {
  return (
    <Layout userData={userData} onLogout={onLogout}>
      {children}
    </Layout>
  );
}

// Root Layout Component
function RootLayout() {
  return <Outlet />;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on app load
  useEffect(() => {
    try {
      const token = localStorage.getItem('authToken');
      const storedUser = localStorage.getItem('userData');
      
      if (token && storedUser) {
        const parsedUser = JSON.parse(storedUser);
        
        // Validate that the stored data has required fields
        if (parsedUser && parsedUser.user_name) {
          setUserData({ token, user: parsedUser });
          setIsAuthenticated(true);
        } else {
          // Clear invalid stored data
          console.log('Invalid stored user data, clearing...');
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
        }
      }
    } catch (error) {
      console.log('Error parsing stored user data, clearing...', error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoginSuccess = (userData: UserData) => {
    console.log('Login successful, user data:', userData);
    setUserData(userData);
    setIsAuthenticated(true);
    
    // Store in localStorage for persistence
    try {
      localStorage.setItem('authToken', userData.token);
      localStorage.setItem('userData', JSON.stringify(userData.user));
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
    } catch (error) {
      console.error('Failed to clear user data:', error);
    }
  };

  // Memoize router to prevent recreation on every render
  const router = useMemo(() => {
    if (!userData) return null;
    
    return createBrowserRouter([
      {
        path: "/",
        element: <RootLayout />,
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
  }, [userData]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // If not authenticated, show login
  if (!isAuthenticated || !userData || !router) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <RouterProvider router={router} />;
}