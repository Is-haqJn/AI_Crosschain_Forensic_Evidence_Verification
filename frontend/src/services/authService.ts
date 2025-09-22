import axios from 'axios';
import { User, LoginForm } from '../types';

class AuthService {
  private token: string | null = null;
  private user: User | null = null;

  private readonly LOGIN_URL: string = '/api/v1/auth/login';
  private readonly ME_URL: string = '/api/v1/auth/me';

  async login(credentials: LoginForm): Promise<{ user: User; token: string }> {
    if (!credentials.email || !credentials.password) {
      throw new Error('Email and password are required');
    }

    const res = await axios.post(this.LOGIN_URL, credentials, {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    });
    const payload = (res.data?.data || res.data) as { token: string; refreshToken?: string; user: User };
    if (!payload?.token || !payload?.user) throw new Error('Invalid auth response');

    this.token = payload.token;
    this.user = payload.user;
    localStorage.setItem('auth_token', this.token);
    localStorage.setItem('auth_user', JSON.stringify(this.user));
    return { user: this.user, token: this.token };
  }

  async logout(): Promise<void> {
    try {
      if (this.token) {
        await axios.post(this.LOGIN_URL.replace('/login', '/logout'), {}, {
          headers: { Authorization: `Bearer ${this.token}` },
          withCredentials: true,
        });
      }
    } catch (e) {
      // ignore
    }
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  async verifyToken(token: string): Promise<User> {
    try {
      const res = await axios.get(this.ME_URL, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const user = (res.data?.data || res.data) as User;
      this.user = user;
      this.token = token;
      localStorage.setItem('auth_user', JSON.stringify(user));
      return user;
    } catch {
      const storedUser = localStorage.getItem('auth_user');
      const storedToken = localStorage.getItem('auth_token');
      if (storedUser && storedToken === token) {
        this.user = JSON.parse(storedUser);
        this.token = storedToken;
        return this.user!;
      }
      throw new Error('Invalid token');
    }
  }

  getToken(): string | null {
    return this.token || localStorage.getItem('auth_token');
  }

  async refreshToken(): Promise<string | null> {
    try {
      const refreshUrl = this.LOGIN_URL.replace('/login', '/refresh');
      const res = await axios.post(refreshUrl, {}, { withCredentials: true });
      const payload = (res.data?.data || res.data) as { token: string; refreshToken?: string };
      if (payload?.token) {
        this.token = payload.token;
        localStorage.setItem('auth_token', payload.token);
        return payload.token;
      }
      return null;
    } catch {
      return null;
    }
  }

  getCurrentUser(): User | null {
    const raw = localStorage.getItem('auth_user');
    return this.user || (raw ? JSON.parse(raw) : null);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    // Placeholder for real backend endpoint
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async resetPassword(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!this.user) throw new Error('User not authenticated');
    this.user = { ...this.user, ...updates };
    localStorage.setItem('auth_user', JSON.stringify(this.user));
    return this.user;
  }
}

export const authService = new AuthService();
