import { useState } from "react";

interface User {
  name: string;
  user_name: string;
  department?: string;
  role: string;
}

interface UserData {
  token: string;
  user: User;
}

interface LoginProps {
  onLoginSuccess: (userData: UserData) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Basic validation
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("http://localhost:3002/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_name: username.trim(),
          password: password,
        }),
      });

      const data = await response.json();

     if (response.ok) {
        console.log("Login successful:", data);
        
        // Validate response structure
        if (!data.token || !data.user) {
          throw new Error("Invalid response format from server");
        }
        
        // ✅ CRITICAL: Save token to localStorage
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        const userData: UserData = {
          token: data.token,
          user: data.user
        };
        
        // Call the parent component's success handler
        onLoginSuccess(userData);
      } else {
        // Handle different HTTP status codes
        switch (response.status) {
          case 401:
            setError("Invalid username or password");
            break;
          case 403:
            setError("Account is disabled or suspended");
            break;
          case 429:
            setError("Too many login attempts. Please try again later");
            break;
          case 500:
            setError("Server error. Please try again later");
            break;
          default:
            setError(data.message || "Login failed. Please try again");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      
      // Handle different types of errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError("Cannot connect to server. Please check if the server is running");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Clear error when user starts typing
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (error) setError("");
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg w-96">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-400">Welcome Back</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">Please sign in to your account</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Enter your username"
              disabled={isLoading}
              required
              autoComplete="username"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={handlePasswordChange}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Enter your password"
              disabled={isLoading}
              required
              autoComplete="current-password"
            />
          </div>
          
          <button 
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full bg-blue-600 dark:bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:ring-offset-gray-800 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </div>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
        
      </div>
    </div>
  );
}