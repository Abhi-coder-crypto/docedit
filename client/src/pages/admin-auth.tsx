import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  employeeId: z.string().min(1, "Admin ID is required"),
  password: z.string().min(1, "Password is required"),
});

export default function AdminAuthPage() {
  const { login, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { employeeId: "", password: "" },
  });

  const onLoginSubmit = async (values: z.infer<typeof loginSchema>) => {
    const success = await login(values.employeeId, values.password);
    if (success) {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      
      if (data.user?.role === 'admin') {
        setLocation("/admin");
      } else {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges. Please use the client portal.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900">
      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <Card className="border-none shadow-2xl bg-white/95 backdrop-blur overflow-hidden">
          <div className="h-2 w-full bg-gradient-to-r from-indigo-600 to-purple-600" />
          <CardHeader className="space-y-1 text-center pb-4 pt-8">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg">
                <Shield className="h-8 w-8 text-white" />
              </div>
            </motion.div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-800">
              Admin Portal
            </CardTitle>
            <CardDescription className="text-slate-500">
              Sign in with your admin credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8 px-8">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5">
                <FormField
                  control={loginForm.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-medium">Admin ID</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <Input 
                            placeholder="Enter your Admin ID" 
                            {...field} 
                            className="pl-10 h-12 bg-slate-50 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" 
                            data-testid="input-admin-id"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 font-medium">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <Input 
                            type="password"
                            placeholder="Enter your password" 
                            {...field} 
                            className="pl-10 h-12 bg-slate-50 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20" 
                            data-testid="input-admin-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-opacity shadow-lg"
                  disabled={isLoading} 
                  data-testid="button-admin-login"
                >
                  {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  {isLoading ? 'Signing in...' : 'Sign In'}
                  {!isLoading && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        
        <p className="text-center text-slate-400 text-sm mt-6">
          Background Removal Admin System
        </p>
      </motion.div>
    </div>
  );
}
