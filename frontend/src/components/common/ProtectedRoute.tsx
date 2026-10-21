import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types';

interface ProtectedRouteProps {
  roles?: readonly Role[];
  children: ReactNode;
}

export function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
