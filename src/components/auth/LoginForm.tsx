// src/components/auth/LoginForm.tsx
"use client";

import { useState, useEffect } from 'react'; // Added useEffect
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation'; // For redirection after login success

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login, user, isLoading: authIsLoading } = useAuth(); // Get user and authIsLoading from context
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Renamed from isLoading to avoid conflict
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "test@test.com",
      password: "password", // Changed default password for testing Firebase Auth
    },
  });

  // Redirect if user is already logged in
  useEffect(() => {
    if (user && !authIsLoading) {
      router.push('/dashboard');
    }
  }, [user, authIsLoading, router]);

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
      // Successful login: onAuthStateChanged in AuthContext will update user state.
      // The useEffect above will then handle redirection to /dashboard.
      // Toast for success is handled in AuthContext now.
    } catch (error) {
      // Error toast is handled in AuthContext's login method.
      console.error("Login attempt failed in form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const currentIsLoading = isSubmitting || authIsLoading;

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-4">
          <LogIn className="h-12 w-12 text-primary" />
        </div>
        <CardTitle className="text-3xl font-bold">Welcome to HomePilot</CardTitle>
        <CardDescription>Enter your credentials to access your smart home.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              {...form.register("email")}
              className="bg-input/50"
              disabled={currentIsLoading}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                {...form.register("password")}
                className="bg-input/50"
                disabled={currentIsLoading}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                disabled={currentIsLoading}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={currentIsLoading}>
            {currentIsLoading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : "Log In"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center space-y-2 text-sm">
        <p className="text-muted-foreground">
          Don't have an account?{' '}
          <Link href="#" className="font-medium text-accent hover:underline">
            Sign up
          </Link>
        </p>
        <Link href="#" className="font-medium text-accent hover:underline">
            Forgot password?
        </Link>
      </CardFooter>
    </Card>
  );
}
