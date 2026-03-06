import React from 'react';
import { useAuth, FilePermissions, CategoryPermissions } from '../contexts/AuthContext';

type Permission = FilePermissions | CategoryPermissions;

interface ProtectedButtonProps {
  permission: FilePermissions | CategoryPermissions;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

export const ProtectedButton: React.FC<ProtectedButtonProps> = ({
  permission,
  onClick,
  children,
  className = '',
  disabled = false,
  title,
  variant = 'primary',
  size = 'md',
  showTooltip = true
}) => {
  const { hasPermission } = useAuth();

  // Check if user has permission
  const isAllowed = hasPermission(permission);

  // If user doesn't have permission, don't render anything (or render a disabled button)
  if (!isAllowed) {
    return null; // Change to return <DisabledButtonPlaceholder /> if you want to show disabled state
  }

  // Base styles
  const baseStyles = 'font-medium rounded transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

  // Size styles
  const sizeStyles = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  // Variant styles
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-400',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 disabled:bg-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-400',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 disabled:bg-green-400'
  };

  const buttonClass = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={buttonClass}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
};

interface ProtectedActionProps {
  permission: FilePermissions | CategoryPermissions;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Alternative: ProtectedAction - wraps any content and hides it if user doesn't have permission
 */
export const ProtectedAction: React.FC<ProtectedActionProps> = ({
  permission,
  fallback = null,
  children
}) => {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

interface ProtectedIconButtonProps extends ProtectedButtonProps {
  icon: React.ReactNode;
  permission: FilePermissions | CategoryPermissions;
}

/**
 * IconButton variant - for icon-only buttons
 */
export const ProtectedIconButton: React.FC<ProtectedIconButtonProps> = ({
  icon,
  permission,
  onClick,
  className = '',
  disabled = false,
  title,
  variant = 'primary',
  ...props
}) => {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    return null;
  }

  const baseStyles = 'p-2 rounded transition-colors duration-200 focus:outline-none focus:ring-2 inline-flex items-center justify-center';

  const variantStyles = {
    primary: 'text-blue-600 hover:bg-blue-100 focus:ring-blue-500',
    secondary: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
    danger: 'text-red-600 hover:bg-red-100 focus:ring-red-500',
    success: 'text-green-600 hover:bg-green-100 focus:ring-green-500'
  };

  const buttonClass = `${baseStyles} ${variantStyles[variant]} ${className}`;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={buttonClass}
      title={title}
      aria-label={title}
      {...props}
    >
      {icon}
    </button>
  );
};