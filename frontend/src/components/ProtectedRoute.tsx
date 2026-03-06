import React from 'react';
import { Navigate } from 'react-router-dom';

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

interface ProtectedRouteProps {
  userData: UserData | null;
  onLogout: () => void;
  allowedRoles?: string[];
  children: React.ReactNode;
}

/**
 * ProtectedRoute Component
 * Protects routes by checking if user is authenticated
 * Optionally checks if user has specific roles
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  userData,
  onLogout,
  allowedRoles,
  children
}) => {
  // Check if user is authenticated
  if (!userData || !userData.user) {
    return <Navigate to="/" replace />;
  }

  // Check if user has allowed role (if allowedRoles is specified)
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(userData.user.role)) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-red-600 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-6">
              You don't have permission to access this page.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Your role: <span className="font-semibold">{userData.user.role}</span>
              <br />
              Required roles: <span className="font-semibold">{allowedRoles.join(', ')}</span>
            </p>
            <button
              onClick={onLogout}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      );
    }
  }

  // User is authenticated and has correct role
  return <>{children}</>;
};

export default ProtectedRoute;