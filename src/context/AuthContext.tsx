import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Profile } from '../types/database';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  signInWithDemoUser: (customEmail?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Carregar profile associado
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.warn('Erro ao carregar perfil:', err);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Se não configurado com credenciais válidas, checa se há sessão local simulada
      const savedUser = localStorage.getItem('nova_tickets_mock_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setUser(parsed.user);
          setProfile(parsed.profile);
        } catch {
          // ignora
        }
      }
      setLoading(false);
      return;
    }

    // Obter sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    // Escutar mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      // Modo local/fallback
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const fakeUser: any = {
        id: fakeId,
        email,
        user_metadata: { full_name: 'Usuário Demonstração' },
      };
      const fakeProfile: Profile = {
        id: fakeId,
        email,
        full_name: 'Usuário Demonstração',
        cpf: '123.456.789-00',
        phone: '(11) 98765-4321',
        role: 'buyer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUser(fakeUser);
      setProfile(fakeProfile);
      localStorage.setItem('nova_tickets_mock_user', JSON.stringify({ user: fakeUser, profile: fakeProfile }));
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!isSupabaseConfigured) {
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const fakeUser: any = {
        id: fakeId,
        email,
        user_metadata: { full_name: fullName },
      };
      const fakeProfile: Profile = {
        id: fakeId,
        email,
        full_name: fullName,
        cpf: '123.456.789-00',
        phone: '(11) 98765-4321',
        role: 'buyer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUser(fakeUser);
      setProfile(fakeProfile);
      localStorage.setItem('nova_tickets_mock_user', JSON.stringify({ user: fakeUser, profile: fakeProfile }));
      return { error: null };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    localStorage.removeItem('nova_tickets_mock_user');
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const signInWithDemoUser = async (customEmail?: string) => {
    const email = customEmail || 'comprador@novatickets.com.br';
    const fakeId = '11111111-2222-3333-4444-555555555555';
    const fakeUser: any = {
      id: fakeId,
      email,
      user_metadata: { full_name: 'Lucas Silva (Comprador)' },
    };
    const fakeProfile: Profile = {
      id: fakeId,
      email,
      full_name: 'Lucas Silva',
      cpf: '123.456.789-00',
      phone: '(11) 99999-8888',
      role: 'buyer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setUser(fakeUser);
    setProfile(fakeProfile);
    localStorage.setItem('nova_tickets_mock_user', JSON.stringify({ user: fakeUser, profile: fakeProfile }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};

