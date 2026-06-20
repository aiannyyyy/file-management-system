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
  onRegister?: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

export default function Login({ onLoginSuccess, onRegister }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: username.trim(), password }),
      });

      const data = await response.json();

      if (response.ok) {
        if (!data.token || !data.user) throw new Error("Invalid response format from server");
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        onLoginSuccess({ token: data.token, user: data.user });
      } else {
        switch (response.status) {
          case 401: setError("Invalid username or password"); break;
          case 403: setError("Account is disabled or suspended"); break;
          case 429: setError("Too many login attempts. Please try again later"); break;
          case 500: setError("Server error. Please try again later"); break;
          default: setError(data.message || "Login failed. Please try again");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Cannot connect to server. Please check your connection");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg w-96">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-400">Welcome Back</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">Please sign in to your account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">Username</label>
            <input
              type="text" value={username}
              onChange={e => { setUsername(e.target.value); if (error) setError(""); }}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              placeholder="Enter your username" disabled={isLoading} required autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">Password</label>
            <input
              type="password" value={password}
              onChange={e => { setPassword(e.target.value); if (error) setError(""); }}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              placeholder="Enter your password" disabled={isLoading} required autoComplete="current-password"
            />
          </div>

          <button
            type="submit" disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in...
              </div>
            ) : "Sign In"}
          </button>
        </form>

        {onRegister && (
          <div className="mt-4 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Don't have an account?{" "}
              <button onClick={onRegister} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                Register
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
