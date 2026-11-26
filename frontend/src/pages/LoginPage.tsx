import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, KeyRound, Lock, Mail, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { getRoleHomeRoute, useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { RoleCode } from '../types/erp';

interface DemoAccount {
  name: string;
  email: string;
  role: RoleCode;
  roleName: string;
}

export function LoginPage() {
  const { login, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@savorsouthfoods.in');
  const [password, setPassword] = useState('Password@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    if (user) {
      navigate(getRoleHomeRoute(user.role), { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    apiFetch<DemoAccount[]>('/auth/demo-accounts')
      .then(setDemoAccounts)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedIn = await login(email, password);
      showToast(`Welcome back, ${loggedIn.name}`, `Signed in as ${loggedIn.roleName}`);
      navigate(getRoleHomeRoute(loggedIn.role), { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (accEmail: string) => {
    setEmail(accEmail);
    setPassword('Password@123');
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#FFF8ED] flex flex-col lg:flex-row">
      {/* Brand Showcase Panel */}
      <div className="relative lg:w-1/2 bg-[#183D32] text-[#FFF8ED] p-8 sm:p-12 flex flex-col justify-between overflow-hidden">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#D9A441]/15 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[#B85C38]/20 blur-3xl" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2 backdrop-blur">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D9A441] text-[#183D32] font-display font-extrabold text-sm">
              SS
            </span>
            <div>
              <p className="font-display text-sm font-bold leading-none">SavorSouth Foods</p>
              <p className="text-[11px] text-[#D9A441]">Tamil Nadu, India</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-10"
          >
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#D9A441]">
              <Sparkles className="w-3.5 h-3.5" />
              Order-to-Audit Manufacturing ERP
            </p>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-white">
              Tradition in Every Bite.
              <span className="block text-[#D9A441] mt-1">Precision in Every Batch.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm text-[#FFF8ED]/80 leading-relaxed">
              Integrated South Indian snacks manufacturing ERP connecting field sales, BOM
              production runs, weighted-average raw material valuation, Tamil Nadu &amp; inter-state
              GST invoicing, and immutable financial audit trails.
            </p>
          </motion.div>

          {/* Product Visual Strip */}
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[
              { name: 'Murukku', img: '/images/products/murukku.jpg' },
              { name: 'Banana Chips', img: '/images/products/banana-chips.jpg' },
              { name: 'Mysore Pak', img: '/images/products/sweets.jpg' },
            ].map((item) => (
              <div
                key={item.name}
                className="rounded-2xl bg-white/10 p-2 backdrop-blur-sm border border-white/10"
              >
                <img
                  src={item.img}
                  alt={item.name}
                  className="aspect-square w-full rounded-xl object-cover"
                />
                <p className="mt-1.5 text-center text-[11px] font-medium text-[#FFF8ED]">
                  {item.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#FFF8ED]/60">
          <span>NIT Tiruchirappalli CDI Winter Internship 2026</span>
          <span>GSTIN: 33AABCS1429B1Z5</span>
        </div>
      </div>

      {/* Sign In & Demo Accounts Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl border border-[#183D32]/12 bg-white p-7 sm:p-8 shadow-elevated">
            <h2 className="font-display text-2xl font-bold text-[#183D32]">Sign in to SavorSouth ERP</h2>
            <p className="mt-1 text-xs text-[#252B29]/65">
              Role-based access for Salesmen, Factory Admin, Production, Auditor &amp; Owner.
            </p>

            {error && (
              <div className="mt-4 rounded-xl border border-[#B85C38]/30 bg-[#B85C38]/10 px-3.5 py-2.5 text-xs font-medium text-[#B85C38]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#183D32] mb-1.5">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#252B29]/45" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[#183D32]/20 bg-[#FFF8ED]/30 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#183D32] focus:bg-white focus:ring-2 focus:ring-[#183D32]/15"
                    placeholder="name@savorsouthfoods.in"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#183D32] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#252B29]/45" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#183D32]/20 bg-[#FFF8ED]/30 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#183D32] focus:bg-white focus:ring-2 focus:ring-[#183D32]/15"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#183D32] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#235344] active:scale-[0.99] transition-all disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In to Workspace'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Role Selector for Evaluators */}
            <div className="mt-6 border-t border-[#183D32]/10 pt-5">
              <div className="flex items-center justify-between mb-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#183D32]">
                  <KeyRound className="w-3.5 h-3.5 text-[#D9A441]" />
                  Demo Role Accounts (Click to Fill)
                </p>
                <span className="text-[11px] font-mono text-[#252B29]/60">Password@123</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => quickFill(acc.email)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      email === acc.email
                        ? 'border-[#183D32] bg-[#183D32]/8'
                        : 'border-[#183D32]/12 hover:border-[#D9A441] hover:bg-[#FFF8ED]'
                    }`}
                  >
                    <p className="text-[11px] font-bold text-[#183D32] truncate">{acc.roleName}</p>
                    <p className="text-[10px] text-[#252B29]/65 truncate">{acc.email}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
