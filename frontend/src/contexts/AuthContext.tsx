import React, { createContext, useContext, ReactNode } from 'react';

// Define role types based on your app
export enum UserRole {
  ADMIN = 'Admin',
  SUPER_USER = 'Super User',
  REGULAR_USER = 'Regular User'
}

// Define permissions for FILES component
export enum FilePermissions {
  UPLOAD = 'file_upload',
  RENAME = 'file_rename',
  DELETE = 'file_delete',
  SHARE = 'file_share',
  DOWNLOAD = 'file_download'
}

// Define permissions for CATEGORIES component
export enum CategoryPermissions {
  ADD = 'category_add',
  EDIT = 'category_edit',
  DELETE = 'category_delete',
  CREATE_FOLDER = 'category_create_folder',
  EDIT_FOLDER = 'category_edit_folder',
  DELETE_FOLDER = 'category_delete_folder',
  UPLOAD_FILES = 'category_upload_files',
  DELETE_FILE = 'category_delete_file',
  DOWNLOAD_FILES = 'category_download_files',
  SHARE_FILES = 'category_share_files',
  PREVIEW_FILES = 'category_preview_files'
}

// Combine all permissions - EXPORTED
export type Permission = FilePermissions | CategoryPermissions;

// Map roles to their permissions based on your access tables
const rolePermissionsMap: Record<string, Permission[]> = {
  [UserRole.ADMIN]: [
    // File permissions - all
    FilePermissions.UPLOAD,
    FilePermissions.RENAME,
    FilePermissions.DELETE,
    FilePermissions.SHARE,
    FilePermissions.DOWNLOAD,
    // Category permissions - all
    CategoryPermissions.ADD,
    CategoryPermissions.EDIT,
    CategoryPermissions.DELETE,
    CategoryPermissions.CREATE_FOLDER,
    CategoryPermissions.EDIT_FOLDER,
    CategoryPermissions.DELETE_FOLDER,
    CategoryPermissions.UPLOAD_FILES,
    CategoryPermissions.DELETE_FILE,
    CategoryPermissions.DOWNLOAD_FILES,
    CategoryPermissions.SHARE_FILES,
    CategoryPermissions.PREVIEW_FILES
  ],
  [UserRole.SUPER_USER]: [
    // File permissions - all except delete
    FilePermissions.UPLOAD,
    FilePermissions.RENAME,
    FilePermissions.SHARE,
    FilePermissions.DOWNLOAD,
    // Category permissions - all except delete file
    CategoryPermissions.ADD,
    CategoryPermissions.EDIT,
    CategoryPermissions.DELETE,
    CategoryPermissions.CREATE_FOLDER,
    CategoryPermissions.EDIT_FOLDER,
    CategoryPermissions.DELETE_FOLDER,
    CategoryPermissions.UPLOAD_FILES,
    CategoryPermissions.DOWNLOAD_FILES,
    CategoryPermissions.SHARE_FILES,
    CategoryPermissions.PREVIEW_FILES
  ],
  [UserRole.REGULAR_USER]: [
    // File permissions - only upload, share, download
    FilePermissions.UPLOAD,
    FilePermissions.SHARE,
    FilePermissions.DOWNLOAD,
    // Category permissions - only upload, download, share, preview
    CategoryPermissions.UPLOAD_FILES,
    CategoryPermissions.DOWNLOAD_FILES,
    CategoryPermissions.SHARE_FILES,
    CategoryPermissions.PREVIEW_FILES
  ]
};

// User type matching your existing structure
export interface User {
  id?: string | number;
  name: string;
  user_name: string;
  department?: string;
  role: string;
}

// Auth context type
interface AuthContextType {
  user: User | null;
  hasPermission: (permission: Permission) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  logout: () => void;
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider component
interface AuthProviderProps {
  children: ReactNode;
  userData: { user: User; token: string };
  onLogout: () => void;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, userData, onLogout }) => {
  const user = userData.user;

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return rolePermissionsMap[user.role]?.includes(permission) || false;
  };

  const hasRole = (role: string): boolean => {
    return user?.role === role;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return user ? roles.includes(user.role) : false;
  };

  const value: AuthContextType = {
    user,
    hasPermission,
    hasRole,
    hasAnyRole,
    logout: onLogout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};