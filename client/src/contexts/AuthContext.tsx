import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, User } from '../api/client';
import { AxiosError } from 'axios';

interface RegisterData {
  email: string;
  username: string;
  password: string;
  displayName: string;
}

interface AuthError {
  message: string;
  details?: Array<{ field: string; message: string }>;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractAuthError(err: unknown): AuthError {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    return {
      message: data?.error ?? 'An unexpected error occurred',
      details: data?.details,
    };
  }
  return { message: 'An unexpected error occurred' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: meData, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const user = meData?.data?.user ?? null;

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.auth.login({ email, password }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => api.auth.register(data),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const login = async (email: string, password: string) => {
    try {
      await loginMutation.mutateAsync({ email, password });
    } catch (err) {
      const authError = extractAuthError(err);
      throw new Error(authError.message);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      await registerMutation.mutateAsync(data);
    } catch (err) {
      const authError = extractAuthError(err);
      throw new Error(authError.message);
    }
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
