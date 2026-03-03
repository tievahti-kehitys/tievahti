import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import tievahtiLogo from '@/assets/tievahti-logo.svg';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({ title: 'Virhe', description: 'Täytä kaikki kentät', variant: 'destructive' });
      return;
    }

    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: 'Kirjautuminen epäonnistui', description: error.message, variant: 'destructive' });
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        toast({ title: 'Rekisteröinti epäonnistui', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: 'Tarkista sähköpostisi',
          description: 'Lähetimme vahvistuslinkin sähköpostiisi.',
        });
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <img src={tievahtiLogo} alt="Tievahti" className="h-10 mx-auto" />
          <CardTitle className="text-xl">
            {isLogin ? 'Kirjaudu sisään' : 'Luo tili'}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? 'Kirjaudu Tievahti-tiliisi'
              : 'Rekisteröidy sähköpostiosoitteellasi. Oikeutesi määräytyvät automaattisesti.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Sähköposti</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nimi@esimerkki.fi"
                required
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Salasana</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                maxLength={128}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Odota...' : isLogin ? 'Kirjaudu' : 'Rekisteröidy'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {isLogin ? 'Eikö sinulla ole tiliä? Rekisteröidy' : 'Onko sinulla jo tili? Kirjaudu'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
