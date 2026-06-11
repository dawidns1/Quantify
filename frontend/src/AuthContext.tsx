import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recoveryMode: boolean;
  setRecoveryMode: (val: boolean) => void;
  signOut: () => Promise<void>;
  tier: 'free' | 'premium';
  setTier: (val: 'free' | 'premium') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [tier, setTierState] = useState<'free' | 'premium'>('free');

  const fetchProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('tier')
        .eq('id', uid)
        .single();
      if (!error && data && data.tier) {
        setTierState(data.tier === 'premium' ? 'premium' : 'free');
      } else {
        setTierState('free');
      }
    } catch (err) {
      setTierState('free');
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const usr = session?.user ?? null;
      setUser(usr);
      if (usr) {
        fetchProfile(usr.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(currentSession => {
        if (currentSession?.access_token === newSession?.access_token && 
            currentSession?.user?.id === newSession?.user?.id) {
          return currentSession;
        }
        return newSession;
      });

      setUser(currentUser => {
        const newUser = newSession?.user ?? null;
        if (currentUser?.id === newUser?.id) {
          return currentUser;
        }
        if (newUser) {
          fetchProfile(newUser.id);
        } else {
          setTierState('free');
        }
        return newUser;
      });

      setLoading(false);
      
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Set loading to false once tier state is resolved (if user is present)
  useEffect(() => {
    if (user) {
      setLoading(false);
    }
  }, [tier, user]);

  const setTier = async (newTier: 'free' | 'premium') => {
    setTierState(newTier);
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ tier: newTier })
          .eq('id', user.id);
      } catch (err) {
        console.error('Error updating tier in database:', err);
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRecoveryMode(false);
    setTierState('free');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, recoveryMode, setRecoveryMode, signOut, tier, setTier }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
