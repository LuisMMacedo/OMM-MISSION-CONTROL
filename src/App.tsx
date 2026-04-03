import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  Users, 
  Activity, 
  FileText, 
  CheckSquare, 
  DollarSign, 
  Plus, 
  Search, 
  MoreVertical, 
  X,
  ChevronRight,
  Calendar,
  Phone,
  Mail,
  TrendingUp,
  Clock,
  PieChart as PieChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { cn, formatCurrency, formatCompactCurrency, getInitials } from './lib/utils';
import { Lead, Task, Habit, Transaction, Quote, Stage, Priority, Quadrant } from './types';
import { SEED_LEADS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { GoogleGenAI } from "@google/genai";

// --- Constants & Config ---
const STAGES: Record<Stage, { label: string; color: string }> = {
  prospecto: { label: 'Prospecto', color: '#5B9CF6' },
  contato: { label: 'Contato', color: '#F5A623' },
  proposta: { label: 'Proposta', color: '#86EFAC' },
  negociacao: { label: 'Negociação', color: '#F97316' },
  fechado: { label: 'Fechado', color: '#3ECF6A' },
  perdido: { label: 'Perdido', color: '#F06060' }
};

const PRIOS: Record<Priority, { label: string; color: string; emoji: string }> = {
  urgente: { label: 'Urgente', color: '#F06060', emoji: '🔴' },
  alta: { label: 'Alta', color: '#F97316', emoji: '🟠' },
  media: { label: 'Média', color: '#F5A623', emoji: '🟡' },
  baixa: { label: 'Baixa', color: '#3ECF6A', emoji: '🟢' }
};

const KANBAN_COLS = ['Inbox', 'Em progresso', 'Revisão', 'Concluído', 'Delegado', 'Bloqueado'];

const EQUADS: Record<Quadrant, { label: string; color: string; desc: string }> = {
  fazer: { label: 'Fazer Agora', color: '#F06060', desc: 'Urgente + Importante' },
  agendar: { label: 'Agendar', color: '#5B9CF6', desc: 'Não urgente + Importante' },
  delegar: { label: 'Delegar', color: '#F5A623', desc: 'Urgente + Não importante' },
  eliminar: { label: 'Eliminar', color: '#5C5852', desc: 'Não urgente + Não importante' }
};

// --- Components ---

const Badge = ({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <span 
    className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase", className)}
    style={style}
  >
    {children}
  </span>
);

const Card = ({ children, title, extra, className }: { children: React.ReactNode; title?: string; extra?: React.ReactNode; className?: string }) => (
  <div className={cn("bg-surface border border-white/5 rounded-xl overflow-hidden transition-colors hover:border-white/10", className)}>
    {title && (
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-head text-[13px] font-bold text-t1 tracking-tight">{title}</h3>
        {extra}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
);

const MetricCard = ({ label, value, trend, accentColor, className }: { label: string; value: string | number; trend?: string; accentColor?: string; className?: string }) => (
  <div 
    className={cn("bg-surface border border-white/5 rounded-xl p-5 relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-0.5", className)}
    style={accentColor ? { borderTop: `2px solid ${accentColor}` } : {}}
  >
    <div className="absolute top-0 right-0 w-16 h-16 bg-radial-gradient from-white/5 to-transparent pointer-events-none" />
    <div className="font-head text-[9px] font-bold tracking-widest uppercase text-t3 mb-2.5">{label}</div>
    <div className="font-head text-[28px] font-extrabold tracking-tighter leading-none text-t1">{value}</div>
    {trend && <div className="text-[11px] text-t3 mt-1.5">{trend}</div>}
  </div>
);

// --- Main App ---

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isBooting, setIsBooting] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [activities, setActivities] = useState<{ text: string; date: Date }[]>([]);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [crmTab, setCrmTab] = useState('lista');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState<Partial<Lead>>({ name: '', company: '', value: 0, stage: 'prospecto', score: 50 });

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [l, t, h, tx, q] = await Promise.all([
          supabase.from('leads').select('*, lead_obs(*)').order('created_at', { ascending: false }),
          supabase.from('tasks').select('*, task_history(*)').order('created_at', { ascending: false }),
          supabase.from('habits').select('*, habit_days(*)').order('created_at', { ascending: false }),
          supabase.from('transactions').select('*').order('created_at', { ascending: false }),
          supabase.from('quotes').select('*, quote_items(*)').order('created_at', { ascending: false })
        ]);

        if (l.data && l.data.length === 0) {
          // Seed data if empty
          await Promise.all(SEED_LEADS.map(lead => supabase.from('leads').insert(lead)));
          const { data: seededLeads } = await supabase.from('leads').select('*, lead_obs(*)').order('created_at', { ascending: false });
          if (seededLeads) setLeads(seededLeads);
        } else if (l.data) {
          setLeads(l.data);
        }
        if (t.data) setTasks(t.data);
        if (h.data) setHabits(h.data);
        if (tx.data) setTransactions(tx.data);
        if (q.data) setQuotes(q.data);

        setActivities([{ text: 'Dados carregados do Supabase ✓', date: new Date() }]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setTimeout(() => setIsBooting(false), 1500);
      }
    };

    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 2500);
  };

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (l.company?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesStage = !stageFilter || l.stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [leads, searchQuery, stageFilter]);

  const dashboardMetrics = useMemo(() => {
    const today = new Date().getDate();
    const habitDone = habits.filter(h => h.habit_days?.some(d => d.day === today)).length;
    const habitPct = habits.length ? Math.round((habitDone / habits.length) * 100) : 0;

    const activePipe = leads
      .filter(l => l.stage !== 'perdido' && l.stage !== 'fechado')
      .reduce((acc, l) => acc + l.value, 0);
    
    const activeLeadsCount = leads.filter(l => l.stage !== 'perdido' && l.stage !== 'fechado').length;

    const income = transactions.filter(t => t.type === 'in').reduce((acc, t) => acc + t.value, 0);
    const expense = transactions.filter(t => t.type === 'out').reduce((acc, t) => acc + t.value, 0);
    const balance = income - expense;

    const closedCount = leads.filter(l => l.stage === 'fechado').length;
    const convRate = leads.length ? Math.round((closedCount / leads.length) * 100) : 0;

    return { habitPct, habitDone, activePipe, activeLeadsCount, balance, convRate, closedCount };
  }, [habits, leads, transactions]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Leads won this month
    const leadsWonThisMonth = leads.filter(l => {
      const date = new Date(l.last_contact || l.created_at);
      return l.stage === 'fechado' && date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
    });

    // Financials this month
    const incomeThisMonth = transactions
      .filter(t => t.type === 'in' && new Date(t.date).getMonth() + 1 === currentMonth)
      .reduce((acc, t) => acc + t.value, 0);
    
    const expenseThisMonth = transactions
      .filter(t => t.type === 'out' && new Date(t.date).getMonth() + 1 === currentMonth)
      .reduce((acc, t) => acc + t.value, 0);

    // Tasks completed this month
    const tasksCompletedThisMonth = tasks.filter(t => t.col === 'Concluído').length;

    // Leads by stage for pie chart
    const leadsByStage = Object.entries(STAGES).map(([k, s]) => ({
      name: s.label,
      value: leads.filter(l => l.stage === k).length,
      color: s.color
    })).filter(item => item.value > 0);

    return { leadsWonThisMonth, incomeThisMonth, expenseThisMonth, tasksCompletedThisMonth, leadsByStage };
  }, [leads, transactions, tasks]);

  const handleGenerateInsight = async () => {
    setIsGeneratingInsight(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `Analise os seguintes dados de performance do mês e forneça um insight estratégico curto (máximo 3 frases) para um filmmaker/criativo:
      - Faturamento: ${formatCurrency(monthlyStats.incomeThisMonth)}
      - Despesas: ${formatCurrency(monthlyStats.expenseThisMonth)}
      - Leads Convertidos: ${monthlyStats.leadsWonThisMonth.length}
      - Tarefas Concluídas: ${monthlyStats.tasksCompletedThisMonth}
      - Distribuição do Funil: ${monthlyStats.leadsByStage.map(s => `${s.name}: ${s.value}`).join(', ')}
      
      Responda em Português.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiInsight(response.text || "Não foi possível gerar o insight no momento.");
    } catch (error) {
      console.error("Erro ao gerar insight:", error);
      setAiInsight("Erro ao conectar com a IA. Verifique sua chave de API.");
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const handleAddLead = async () => {
    if (!newLead.name) return showToast('Nome é obrigatório');
    try {
      const { data, error } = await supabase.from('leads').insert([newLead]).select();
      if (error) throw error;
      if (data) {
        setLeads([data[0], ...leads]);
        setIsAddLeadOpen(false);
        setNewLead({ name: '', company: '', value: 0, stage: 'prospecto', score: 50 });
        showToast('Lead adicionado com sucesso!');
      }
    } catch (error) {
      console.error('Error adding lead:', error);
      showToast('Erro ao adicionar lead');
    }
  };

  if (isBooting) {
    return (
      <div className="fixed inset-0 bg-bg z-[9999] flex flex-col items-center justify-center gap-4">
        <div className="font-head text-3xl font-black tracking-tighter text-t1">O<span className="text-brand-orange">MM</span></div>
        <div className="w-[200px] h-[3px] bg-surface3 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
            className="h-full bg-brand-orange"
          />
        </div>
        <div className="text-[11px] text-t3 font-medium">Conectando ao banco de dados...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg text-t1 font-sans">
      {/* Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface2 border border-white/15 rounded-xl px-5 py-2.5 text-xs font-medium z-[999] shadow-2xl"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Lead Modal */}
      <AnimatePresence>
        {isAddLeadOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddLeadOpen(false)}
              className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="font-head text-lg font-black tracking-tight text-t1">Novo Lead</h2>
                <button onClick={() => setIsAddLeadOpen(false)} className="p-2 hover:bg-surface2 rounded-xl text-t3 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-t3 ml-1">Nome do Lead</label>
                  <input 
                    className="w-full bg-surface2 border border-white/5 rounded-xl p-3 text-sm text-t1 outline-none focus:border-brand-orange/30 transition-all"
                    placeholder="Ex: João Silva"
                    value={newLead.name}
                    onChange={e => setNewLead({...newLead, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-t3 ml-1">Empresa</label>
                  <input 
                    className="w-full bg-surface2 border border-white/5 rounded-xl p-3 text-sm text-t1 outline-none focus:border-brand-orange/30 transition-all"
                    placeholder="Ex: Produtora X"
                    value={newLead.company}
                    onChange={e => setNewLead({...newLead, company: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-t3 ml-1">Valor Estimado</label>
                    <input 
                      type="number"
                      className="w-full bg-surface2 border border-white/5 rounded-xl p-3 text-sm text-t1 outline-none focus:border-brand-orange/30 transition-all"
                      placeholder="0.00"
                      value={newLead.value}
                      onChange={e => setNewLead({...newLead, value: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-t3 ml-1">Score (0-100)</label>
                    <input 
                      type="number"
                      className="w-full bg-surface2 border border-white/5 rounded-xl p-3 text-sm text-t1 outline-none focus:border-brand-orange/30 transition-all"
                      placeholder="50"
                      value={newLead.score}
                      onChange={e => setNewLead({...newLead, score: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-surface2/50 border-t border-white/5 flex gap-3">
                <button 
                  onClick={() => setIsAddLeadOpen(false)}
                  className="flex-1 py-3 bg-surface border border-white/5 rounded-2xl text-xs font-bold text-t2 hover:bg-surface transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleAddLead}
                  className="flex-1 py-3 bg-brand-orange text-white rounded-2xl text-xs font-bold hover:bg-brand-orange-lt transition-all shadow-lg shadow-brand-orange/20"
                >
                  Criar Lead
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="w-[230px] fixed left-0 top-0 bottom-0 bg-surface border-r border-white/5 flex flex-col z-50 transition-all duration-200 max-lg:w-[58px]">
        <div className="p-5 pb-4 border-b border-white/5 max-lg:p-4">
          <div className="flex items-center gap-2 font-head text-[22px] font-black tracking-tighter max-lg:text-sm">
            <div className="w-2 h-2 bg-brand-orange rounded-full shadow-[0_0_8px_rgba(232,98,10,1)]" />
            <span className="max-lg:hidden">OMM</span>
          </div>
          <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-t3 mt-0.5 max-lg:hidden">Mission Control</div>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
          <div className="px-2 mb-1 text-[9px] font-bold tracking-[0.14em] uppercase text-t4 max-lg:hidden">Visão Geral</div>
          <SidebarLink 
            icon={<LayoutDashboard size={16} />} 
            label="Dashboard" 
            active={activeSection === 'dashboard'} 
            onClick={() => setActiveSection('dashboard')} 
          />
          <SidebarLink 
            icon={<PieChartIcon size={16} />} 
            label="Relatórios" 
            active={activeSection === 'relatorios'} 
            onClick={() => setActiveSection('relatorios')} 
          />
          <SidebarLink 
            icon={<Layers size={16} />} 
            label="Mission Control" 
            active={activeSection === 'mission'} 
            onClick={() => setActiveSection('mission')} 
          />

          <div className="h-px bg-white/5 my-2 mx-2" />

          <div className="px-2 mb-1 text-[9px] font-bold tracking-[0.14em] uppercase text-t4 max-lg:hidden">CRM</div>
          <SidebarLink 
            icon={<Users size={16} />} 
            label="Leads & CRM" 
            active={activeSection === 'crm'} 
            onClick={() => setActiveSection('crm')} 
          />
          <SidebarLink 
            icon={<Activity size={16} />} 
            label="Pipeline Visual" 
            active={activeSection === 'pipeline'} 
            onClick={() => setActiveSection('pipeline')} 
          />
          <SidebarLink 
            icon={<FileText size={16} />} 
            label="Orçamentos" 
            active={activeSection === 'orcamentos'} 
            onClick={() => setActiveSection('orcamentos')} 
          />

          <div className="h-px bg-white/5 my-2 mx-2" />

          <div className="px-2 mb-1 text-[9px] font-bold tracking-[0.14em] uppercase text-t4 max-lg:hidden">Pessoal</div>
          <SidebarLink 
            icon={<CheckSquare size={16} />} 
            label="Hábitos" 
            active={activeSection === 'habitos'} 
            onClick={() => setActiveSection('habitos')} 
          />
          <SidebarLink 
            icon={<DollarSign size={16} />} 
            label="Financeiro" 
            active={activeSection === 'financeiro'} 
            onClick={() => setActiveSection('financeiro')} 
          />
        </nav>

        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-surface2 cursor-pointer transition-colors group">
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-brand-orange to-brand-orange-lt flex items-center justify-center font-head text-xs font-extrabold text-white shrink-0">MM</div>
            <div className="flex-1 min-w-0 max-lg:hidden">
              <div className="font-head text-xs font-bold text-t1 truncate">Miguel Macedo</div>
              <div className="text-[10px] text-t3">Filmmaker Estratégico</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-semantic-green shrink-0" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-[230px] max-lg:ml-[58px] flex flex-col">
        <header className="h-[58px] bg-surface border-b border-white/5 flex items-center justify-between px-7 sticky top-0 z-40 max-sm:px-4">
          <h1 className="font-head text-base font-bold tracking-tight text-t1 capitalize">{activeSection.replace('-', ' ')}</h1>
          <div className="flex items-center gap-2.5">
            <div className="px-3 py-1 bg-surface2 border border-white/5 rounded-full text-[10px] font-semibold tracking-widest uppercase text-t3 max-sm:hidden">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
            </div>
            <button 
              onClick={() => {
                if (activeSection === 'crm' || activeSection === 'pipeline') setIsAddLeadOpen(true);
                else showToast('Funcionalidade em desenvolvimento para esta seção');
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-orange hover:bg-brand-orange-lt text-white rounded-xl text-xs font-semibold transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(232,98,10,0.4)]"
            >
              <Plus size={13} strokeWidth={2.5} />
              <span>Adicionar</span>
            </button>
          </div>
        </header>

        <div className="p-7 max-sm:p-4 bg-bg2 flex-1">
          {activeSection === 'relatorios' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-head text-xl font-black tracking-tight text-t1">Relatórios Mensais</h2>
                  <p className="text-[11px] text-t3 uppercase tracking-widest font-bold">Performance de {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="flex gap-2 no-print">
                  <button 
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-surface border border-white/5 rounded-xl text-[11px] font-bold text-t2 hover:bg-surface2 transition-all"
                  >
                    Exportar PDF
                  </button>
                  <button 
                    onClick={handleGenerateInsight}
                    disabled={isGeneratingInsight}
                    className="px-4 py-2 bg-brand-orange text-white rounded-xl text-[11px] font-bold hover:bg-brand-orange-lt transition-all disabled:opacity-50"
                  >
                    {isGeneratingInsight ? 'Gerando...' : 'Gerar Insight AI'}
                  </button>
                </div>
              </div>

              {aiInsight && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-brand-orange/5 border border-brand-orange/20 rounded-2xl p-5 no-print"
                >
                  <div className="flex items-center gap-2 text-brand-orange mb-2">
                    <Activity size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Insight Estratégico AI</span>
                  </div>
                  <p className="text-xs text-t1 leading-relaxed italic">"{aiInsight}"</p>
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface border border-white/5 rounded-2xl p-5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <TrendingUp size={64} className="text-semantic-green" />
                  </div>
                  <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-1">Faturamento Mensal</div>
                  <div className="text-2xl font-black text-semantic-green font-head">{formatCurrency(monthlyStats.incomeThisMonth)}</div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-surface3 rounded-full overflow-hidden">
                      <div className="h-full bg-semantic-green rounded-full" style={{ width: '65%' }} />
                    </div>
                    <span className="text-[10px] font-bold text-t3">65% da meta</span>
                  </div>
                </div>

                <div className="bg-surface border border-white/5 rounded-2xl p-5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Users size={64} className="text-brand-orange" />
                  </div>
                  <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-1">Leads Convertidos</div>
                  <div className="text-2xl font-black text-t1 font-head">{monthlyStats.leadsWonThisMonth.length}</div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {monthlyStats.leadsWonThisMonth.slice(0, 3).map((l, i) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-surface3 border-2 border-surface flex items-center justify-center text-[8px] font-bold text-t2">
                          {getInitials(l.name)}
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-t3">Novos parceiros este mês</span>
                  </div>
                </div>

                <div className="bg-surface border border-white/5 rounded-2xl p-5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <CheckSquare size={64} className="text-brand-orange-lt" />
                  </div>
                  <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-1">Entregas Realizadas</div>
                  <div className="text-2xl font-black text-t1 font-head">{monthlyStats.tasksCompletedThisMonth}</div>
                  <div className="mt-4 text-[10px] font-bold text-t3">
                    Média de <span className="text-brand-orange-lt">{(monthlyStats.tasksCompletedThisMonth / 4).toFixed(1)}</span> por semana
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface border border-white/5 rounded-2xl p-6">
                  <h3 className="font-head text-sm font-bold text-t1 mb-6 flex items-center gap-2">
                    <Activity size={16} className="text-brand-orange" />
                    Distribuição do Funil
                  </h3>
                  <div className="h-[250px] w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={monthlyStats.leadsByStage}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {monthlyStats.leadsByStage.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          itemStyle={{ color: '#ffffff', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 ml-4">
                      {monthlyStats.leadsByStage.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-[10px] font-bold text-t3 uppercase tracking-wider">{s.name}</span>
                          <span className="text-[10px] font-black text-t1 ml-auto">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-surface border border-white/5 rounded-2xl p-6">
                  <h3 className="font-head text-sm font-bold text-t1 mb-6 flex items-center gap-2">
                    <DollarSign size={16} className="text-semantic-green" />
                    Fluxo de Caixa Mensal
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-surface2 rounded-xl border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-1">Entradas</div>
                        <div className="text-lg font-black text-semantic-green font-head">{formatCurrency(monthlyStats.incomeThisMonth)}</div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-semantic-green/10 flex items-center justify-center text-semantic-green">
                        <TrendingUp size={20} />
                      </div>
                    </div>
                    <div className="p-4 bg-surface2 rounded-xl border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-1">Saídas</div>
                        <div className="text-lg font-black text-semantic-red font-head">{formatCurrency(monthlyStats.expenseThisMonth)}</div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-semantic-red/10 flex items-center justify-center text-semantic-red">
                        <TrendingUp size={20} className="rotate-180" />
                      </div>
                    </div>
                    <div className="p-4 bg-brand-orange/5 rounded-xl border border-brand-orange/20 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-brand-orange-lt uppercase tracking-widest mb-1">Resultado Líquido</div>
                        <div className="text-xl font-black text-brand-orange font-head">{formatCurrency(monthlyStats.incomeThisMonth - monthlyStats.expenseThisMonth)}</div>
                      </div>
                      <div className="px-3 py-1 bg-brand-orange/20 rounded-full text-[10px] font-black text-brand-orange-lt">
                        {monthlyStats.incomeThisMonth > monthlyStats.expenseThisMonth ? '+ ' : ''}
                        {Math.round(((monthlyStats.incomeThisMonth - monthlyStats.expenseThisMonth) / (monthlyStats.incomeThisMonth || 1)) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'pipeline' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-head text-lg font-extrabold tracking-tight text-t1">Pipeline Visual</h2>
                  <p className="text-[11px] text-t3">Arraste e organize seus leads por estágio</p>
                </div>
                <button 
                  onClick={() => setIsAddLeadOpen(true)}
                  className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-lt text-white rounded-xl text-xs font-bold transition-all"
                >
                  + Lead
                </button>
              </div>
              <div className="grid grid-cols-6 gap-3 overflow-x-auto pb-4 min-w-[1200px]">
                {Object.entries(STAGES).map(([k, s]) => {
                  const sl = leads.filter(l => l.stage === k);
                  const total = sl.reduce((acc, l) => acc + l.value, 0);
                  return (
                    <div key={k} className="bg-surface border border-white/5 rounded-xl flex flex-col min-h-[400px]">
                      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between bg-surface2 rounded-t-xl" style={{ borderTop: `3px solid ${s.color}` }}>
                        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: s.color }}>{s.label}</span>
                        <span className="text-[10px] font-bold bg-surface3 px-2 py-0.5 rounded-full text-t2">{sl.length}</span>
                      </div>
                      <div className="p-2 space-y-2 overflow-y-auto flex-1">
                        {sl.map(l => (
                          <div 
                            key={l.id} 
                            className="bg-surface2 border border-white/5 rounded-xl p-3 hover:border-brand-orange/30 cursor-pointer transition-all hover:-translate-y-0.5"
                            onClick={() => { setSelectedLead(l); setIsDetailOpen(true); }}
                          >
                            <div className="text-[12px] font-bold text-t1 mb-1">{l.name}</div>
                            <div className="text-[10px] text-t3 mb-2">{l.company}</div>
                            <div className="text-[13px] font-black text-semantic-green">{formatCurrency(l.value)}</div>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                              <Badge className="bg-surface3 text-t2">{l.origin}</Badge>
                              <span className="text-[10px] font-bold font-head" style={{ color: scColor(l.score) }}>{l.score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-2 border-t border-white/5 bg-surface2/50">
                        <div className="text-[10px] font-bold text-t3 uppercase tracking-wider">Total: {formatCurrency(total)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'orcamentos' && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2">
                <MetricCard label="Total" value={formatCurrency(quotes.reduce((a, b) => a + (b.quote_items?.reduce((acc, i) => acc + i.quantity * i.value, 0) || 0), 0))} />
                <MetricCard label="Aguardando" value={formatCurrency(quotes.filter(o => o.status === 'enviado').reduce((a, b) => a + (b.quote_items?.reduce((acc, i) => acc + i.quantity * i.value, 0) || 0), 0))} accentColor="var(--color-semantic-amber)" />
                <MetricCard label="Aprovados" value={formatCurrency(quotes.filter(o => o.status === 'aprovado').reduce((a, b) => a + (b.quote_items?.reduce((acc, i) => acc + i.quantity * i.value, 0) || 0), 0))} accentColor="var(--color-semantic-green)" />
                <MetricCard label="Conversão" value={`${quotes.length ? Math.round((quotes.filter(o => o.status === 'aprovado').length / quotes.length) * 100) : 0}%`} accentColor="var(--color-semantic-blue)" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-head text-lg font-extrabold tracking-tight text-t1">Orçamentos</h2>
                <button className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-lt text-white rounded-xl text-xs font-bold transition-all">
                  + Orçamento
                </button>
              </div>
              <div className="space-y-3">
                {quotes.map(o => {
                  const total = o.quote_items?.reduce((acc, i) => acc + i.quantity * i.value, 0) || 0;
                  const statusColors = { rascunho: 'bg-surface3 text-t2', enviado: 'bg-semantic-amber/10 text-semantic-amber', aprovado: 'bg-semantic-green/10 text-semantic-green', recusado: 'bg-semantic-red/10 text-semantic-red' };
                  return (
                    <div key={o.id} className="bg-surface border border-white/5 rounded-xl p-5 flex items-center justify-between gap-4 hover:border-white/10 cursor-pointer transition-all">
                      <div>
                        <Badge className={statusColors[o.status]}>{o.status}</Badge>
                        <div className="font-head text-base font-black tracking-tight text-t1 mt-2">{o.project}</div>
                        <div className="text-xs text-t3 mt-1">{o.client} · {new Date(o.date).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-head text-2xl font-black text-brand-orange-lt tracking-tighter">{formatCurrency(total)}</div>
                        <div className="text-[10px] text-t3 font-bold uppercase">total</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2">
                <MetricCard 
                  label="Hábitos Hoje" 
                  value={`${dashboardMetrics.habitPct}%`} 
                  trend={`${dashboardMetrics.habitDone} de ${habits.length} hábitos`}
                  accentColor="var(--color-brand-orange)"
                />
                <MetricCard 
                  label="Pipeline Ativo" 
                  value={formatCompactCurrency(dashboardMetrics.activePipe)} 
                  trend={`${dashboardMetrics.activeLeadsCount} leads ativos`}
                  accentColor="var(--color-semantic-green)"
                />
                <MetricCard 
                  label="Saldo do Mês" 
                  value={formatCompactCurrency(dashboardMetrics.balance)} 
                  trend="entradas – saídas"
                  accentColor="var(--color-semantic-amber)"
                />
                <MetricCard 
                  label="Taxa de Conversão" 
                  value={`${dashboardMetrics.convRate}%`} 
                  trend={`${dashboardMetrics.closedCount} leads fechados`}
                  accentColor="var(--color-semantic-blue)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <Card 
                  title="Leads Quentes" 
                  extra={<button className="text-[11px] text-t3 hover:text-t2" onClick={() => setActiveSection('crm')}>Ver todos →</button>}
                >
                  <div className="space-y-0.5">
                    {leads.filter(l => l.stage === 'proposta' || l.stage === 'negociacao').slice(0, 4).map(l => (
                      <div 
                        key={l.id} 
                        className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 cursor-pointer group"
                        onClick={() => { setSelectedLead(l); setIsDetailOpen(true); }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-orange to-brand-orange-lt flex items-center justify-center font-head text-[11px] font-extrabold text-white shrink-0">
                            {getInitials(l.name)}
                          </div>
                          <div>
                            <div className="font-head text-[13px] font-bold text-t1 group-hover:text-brand-orange-lt transition-colors">{l.name}</div>
                            <div className="text-[11px] text-t3">{l.company}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-head text-[13px] font-extrabold text-semantic-green">{formatCurrency(l.value)}</div>
                          <Badge style={{ background: `${STAGES[l.stage].color}22`, color: STAGES[l.stage].color }}>{STAGES[l.stage].label}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card 
                  title="Tarefas Urgentes" 
                  extra={<button className="text-[11px] text-t3 hover:text-t2" onClick={() => setActiveSection('mission')}>Ver todas →</button>}
                >
                  <div className="space-y-0.5">
                    {tasks.filter(t => t.col !== 'Concluído').sort((a, b) => {
                      const p = { urgente: 0, alta: 1, media: 2, baixa: 3 };
                      return p[a.priority] - p[b.priority];
                    }).slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{PRIOS[t.priority].emoji}</span>
                          <span className="text-[12px] font-medium text-t1">{t.title}</span>
                        </div>
                        <span className="text-[9px] text-t3 font-head font-bold uppercase">{t.col}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card title="Feed de Atividade">
                <div className="space-y-4">
                  {activities.map((a, i) => (
                    <div key={i} className="flex gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-orange mt-1.5 shrink-0" />
                      <div>
                        <div className="text-[12px] text-t2 leading-relaxed">{a.text}</div>
                        <div className="text-[10px] text-t3 mt-0.5 flex items-center gap-1">
                          <Clock size={10} />
                          {a.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeSection === 'crm' && (
            <div className="space-y-6">
              <div className="grid grid-cols-5 gap-3.5 max-lg:grid-cols-2">
                <MetricCard label="Total Leads" value={leads.length} trend={`${leads.filter(l => l.stage === 'prospecto').length} prospectos`} />
                <MetricCard label="Pipeline Ativo" value={formatCompactCurrency(dashboardMetrics.activePipe)} trend="excl. fechados" accentColor="var(--color-semantic-green)" />
                <MetricCard label="Receita Fechada" value={formatCompactCurrency(transactions.filter(t => t.type === 'in').reduce((a, b) => a + b.value, 0))} trend={`${dashboardMetrics.closedCount} contratos`} accentColor="var(--color-semantic-blue)" />
                <MetricCard label="Conversão" value={`${dashboardMetrics.convRate}%`} trend="leads fechados/total" accentColor="var(--color-semantic-amber)" />
                <MetricCard label="Em Negociação" value={leads.filter(l => l.stage === 'proposta' || l.stage === 'negociacao').length} trend="proposta + neg." accentColor="var(--color-brand-orange)" />
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-0.5 bg-surface2 p-1 rounded-xl border border-white/5">
                  {['lista', 'contatos', 'tarefas'].map(tab => (
                    <button 
                      key={tab}
                      onClick={() => setCrmTab(tab)}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all capitalize",
                        crmTab === tab ? "bg-surface text-t1 shadow-sm font-bold" : "text-t3 hover:text-t2"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
                    <input 
                      type="text" 
                      placeholder="Buscar lead..." 
                      className="bg-surface2 border border-white/5 rounded-xl py-1.5 pl-8 pr-3 text-[12px] text-t1 outline-none focus:border-brand-orange transition-colors w-52"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select 
                    className="bg-surface2 border border-white/5 rounded-xl py-1.5 px-3 text-[12px] text-t1 outline-none focus:border-brand-orange transition-colors"
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                  >
                    <option value="">Todos os estágios</option>
                    {Object.entries(STAGES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                  </select>
                  <button className="px-4 py-1.5 bg-brand-orange hover:bg-brand-orange-lt text-white rounded-xl text-[12px] font-bold transition-all">
                    + Lead
                  </button>
                </div>
              </div>

              {crmTab === 'lista' && (
                <div className="border border-white/5 rounded-xl overflow-hidden bg-surface">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface2">
                      <tr>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Lead</th>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Empresa</th>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Estágio</th>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Valor/mês</th>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Score</th>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Origem</th>
                        <th className="px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase text-t3">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map(l => (
                        <tr 
                          key={l.id} 
                          className="border-t border-white/5 hover:bg-surface2 cursor-pointer transition-colors"
                          onClick={() => { setSelectedLead(l); setIsDetailOpen(true); }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-orange to-brand-orange-lt flex items-center justify-center font-head text-[11px] font-extrabold text-white shrink-0">
                                {getInitials(l.name)}
                              </div>
                              <div>
                                <div className="font-head text-[12px] font-bold text-t1">{l.name}</div>
                                <div className="text-[10px] text-t3">{l.phone || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-t2">{l.company || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge style={{ background: `${STAGES[l.stage].color}22`, color: STAGES[l.stage].color }}>{STAGES[l.stage].label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-[12px] font-bold text-t1 font-head">{formatCurrency(l.value)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1 bg-surface3 rounded-full overflow-hidden max-w-[50px]">
                                <div className="h-full rounded-full transition-all" style={{ width: `${l.score}%`, backgroundColor: l.score >= 80 ? 'var(--color-semantic-green)' : l.score >= 50 ? 'var(--color-semantic-amber)' : 'var(--color-semantic-red)' }} />
                              </div>
                              <span className="text-[11px] font-bold font-head" style={{ color: l.score >= 80 ? 'var(--color-semantic-green)' : l.score >= 50 ? 'var(--color-semantic-amber)' : 'var(--color-semantic-red)' }}>{l.score}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="bg-surface3 text-t2">{l.origin}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <button className="p-1.5 hover:bg-surface3 rounded-lg text-t3 transition-colors">
                              <MoreVertical size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeSection === 'mission' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-head text-lg font-extrabold tracking-tight text-t1">Mission Control</h2>
                  <p className="text-[11px] text-t3">Kanban + Matriz de Eisenhower</p>
                </div>
                <button className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-lt text-white rounded-xl text-xs font-bold transition-all">
                  + Nova Tarefa
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {KANBAN_COLS.map(col => (
                  <div 
                    key={col} 
                    className="min-w-[250px] flex-1 bg-surface border border-white/5 rounded-xl flex flex-col h-[600px]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const taskId = e.dataTransfer.getData('taskId');
                      if (taskId) {
                        const id = parseInt(taskId);
                        const task = tasks.find(t => t.id === id);
                        if (task && task.col !== col) {
                          const updatedTasks = tasks.map(t => t.id === id ? { ...t, col } : t);
                          setTasks(updatedTasks);
                          await supabase.from('tasks').update({ col }).eq('id', id);
                          showToast(`Tarefa movida para ${col}`);
                        }
                      }
                    }}
                  >
                    <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between bg-surface2 rounded-t-xl">
                      <span className="text-[9px] font-bold tracking-widest uppercase text-t3">{col}</span>
                      <span className="text-[10px] font-extrabold text-brand-orange-lt bg-brand-orange/10 px-2 py-0.5 rounded-full">{tasks.filter(t => t.col === col).length}</span>
                    </div>
                    <div className="p-2 space-y-2 overflow-y-auto flex-1">
                      {tasks.filter(t => t.col === col).map(t => (
                        <motion.div 
                          key={t.id} 
                          layoutId={t.id.toString()}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('taskId', t.id.toString());
                          }}
                          className="bg-surface2 border border-white/5 rounded-xl p-3 hover:border-brand-orange/30 cursor-grab active:cursor-grabbing transition-all"
                          onClick={() => { /* open task detail */ }}
                        >
                          <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: PRIOS[t.priority].color }}>
                            {PRIOS[t.priority].emoji} {PRIOS[t.priority].label}
                          </div>
                          <div className="text-[12px] font-medium text-t1 leading-tight mb-2">{t.title}</div>
                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-[9px] text-t3 bg-surface3 px-1.5 py-0.5 rounded">{t.category}</span>
                            <span className="text-[9px] text-t3">{t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-'}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <Card title="Matriz de Eisenhower">
                  <div className="grid grid-cols-2 gap-2.5">
                    {Object.entries(EQUADS).map(([k, q]) => (
                      <div key={k} className="bg-surface2 border border-white/5 rounded-xl p-3.5 flex flex-col min-h-[160px]" style={{ borderLeft: `3px solid ${q.color}` }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: q.color }}>{q.label}</span>
                          <span className="text-[8px] text-t3 font-medium">— {q.desc}</span>
                        </div>
                        <div className="space-y-1.5 overflow-y-auto flex-1">
                          {tasks.filter(t => t.quadrant === k && t.col !== 'Concluído').map(t => (
                            <div key={t.id} className="text-[11px] p-1.5 bg-surface3/50 rounded-lg text-t2 leading-tight">
                              {PRIOS[t.priority].emoji} {t.title}
                            </div>
                          ))}
                          {tasks.filter(t => t.quadrant === k && t.col !== 'Concluído').length === 0 && (
                            <div className="text-[10px] text-t4 text-center mt-4 italic">Nenhuma tarefa</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Métricas de Tarefas">
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'Ativas', value: tasks.filter(t => t.col !== 'Concluído').length, color: 'var(--color-brand-orange-lt)' },
                      { label: 'Concluídas', value: tasks.filter(t => t.col === 'Concluído').length, color: 'var(--color-semantic-green)' },
                      { label: 'Urgentes', value: tasks.filter(t => t.priority === 'urgente' && t.col !== 'Concluído').length, color: 'var(--color-semantic-red)' },
                      { label: 'Eficiência', value: `${tasks.length ? Math.round((tasks.filter(t => t.col === 'Concluído').length / tasks.length) * 100) : 0}%`, color: 'var(--color-semantic-blue)' }
                    ].map((m, i) => (
                      <div key={i} className="bg-surface2 border border-white/5 rounded-xl p-4 text-center">
                        <div className="font-head text-2xl font-black" style={{ color: m.color }}>{m.value}</div>
                        <div className="text-[9px] font-bold tracking-widest uppercase text-t3 mt-1">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeSection === 'financeiro' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3.5 max-lg:grid-cols-1">
                <MetricCard label="Entradas" value={formatCurrency(transactions.filter(t => t.type === 'in').reduce((a, b) => a + b.value, 0))} accentColor="var(--color-semantic-green)" />
                <MetricCard label="Saídas" value={formatCurrency(transactions.filter(t => t.type === 'out').reduce((a, b) => a + b.value, 0))} accentColor="var(--color-semantic-red)" />
                <MetricCard label="Saldo" value={formatCurrency(transactions.filter(t => t.type === 'in').reduce((a, b) => a + b.value, 0) - transactions.filter(t => t.type === 'out').reduce((a, b) => a + b.value, 0))} accentColor="var(--color-semantic-amber)" />
              </div>

              <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <Card title="Fluxo de Caixa — 6 meses">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'Out', in: 8200, out: 4100 },
                        { name: 'Nov', in: 9500, out: 5200 },
                        { name: 'Dez', in: 12000, out: 6800 },
                        { name: 'Jan', in: 7800, out: 4500 },
                        { name: 'Fev', in: 11200, out: 5900 },
                        { name: 'Mar', in: 9000, out: 2300 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#5C5852' }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#161614', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          itemStyle={{ fontSize: '11px' }}
                        />
                        <Bar dataKey="in" fill="var(--color-semantic-green)" radius={[2, 2, 0, 0]} barSize={10} />
                        <Bar dataKey="out" fill="var(--color-semantic-red)" radius={[2, 2, 0, 0]} barSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card title="Transações" extra={<button className="px-3 py-1 bg-brand-orange text-white rounded-lg text-[10px] font-bold">+ Transação</button>}>
                  <div className="space-y-0.5">
                    {transactions.slice(0, 6).map(t => (
                      <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 hover:opacity-80 cursor-pointer transition-opacity">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0",
                          t.type === 'in' ? "bg-semantic-green/10 text-semantic-green" : "bg-semantic-red/10 text-semantic-red"
                        )}>
                          {t.type === 'in' ? '↑' : '↓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-t1 truncate">{t.description}</div>
                          <div className="text-[10px] text-t3">{t.category} · {new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
                        </div>
                        <div className={cn("font-head text-[13px] font-bold", t.type === 'in' ? "text-semantic-green" : "text-semantic-red")}>
                          {t.type === 'in' ? '+' : '-'}{formatCurrency(t.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeSection === 'habitos' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-head text-lg font-extrabold tracking-tight text-t1">Hábitos</h2>
                  <p className="text-[11px] text-t3">Marque o progresso diário</p>
                </div>
                <button className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-lt text-white rounded-xl text-xs font-bold transition-all">
                  + Hábito
                </button>
              </div>

              <div className="space-y-3">
                {habits.map(h => {
                  const today = new Date().getDate();
                  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                  const streak = h.habit_days?.length || 0; // Simplified streak
                  const progress = Math.round(((h.habit_days?.length || 0) / daysInMonth) * 100);

                  return (
                    <div key={h.id} className="bg-surface border border-white/5 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-[9px] font-bold tracking-widest uppercase text-t3 mb-1">{h.category}</div>
                          <div className="font-head text-sm font-bold text-t1">{h.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-head text-2xl font-black text-brand-orange-lt leading-none">{streak}</div>
                          <div className="text-[9px] text-t3 uppercase font-bold">dias streak</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1.5 mb-4 sm:grid-cols-[repeat(auto-fill,minmax(26px,1fr))]">
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                          const isDone = h.habit_days?.some(d => d.day === day);
                          const isToday = day === today;
                          return (
                            <div 
                              key={day} 
                              className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-[9px] cursor-pointer transition-all hover:scale-110",
                                isDone ? "bg-t1 text-bg font-bold" : "bg-surface3 text-t4",
                                isToday && "border border-brand-orange"
                              )}
                              title={day.toString()}
                            >
                              {day}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-t3">Progresso: {progress}%</span>
                        <button className="text-[10px] text-semantic-red hover:underline">remover</button>
                      </div>
                      <div className="h-1 bg-surface3 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-orange to-brand-orange-lt transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail Panel Overlay */}
      <AnimatePresence>
        {isDetailOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-[420px] max-sm:w-full bg-surface border-l border-white/10 z-[101] shadow-2xl flex flex-col"
            >
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-surface2">
                <h2 className="font-head text-sm font-bold text-t1">Detalhes do Lead</h2>
                <button onClick={() => setIsDetailOpen(false)} className="p-1.5 hover:bg-surface3 rounded-lg text-t3 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {selectedLead && (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-orange to-brand-orange-lt flex items-center justify-center font-head text-lg font-black text-white shrink-0">
                        {getInitials(selectedLead.name)}
                      </div>
                      <div className="flex-1">
                        <input 
                          className="w-full bg-transparent font-head text-lg font-extrabold tracking-tight text-t1 outline-none border-b border-transparent focus:border-brand-orange/30"
                          value={selectedLead.name}
                          onChange={async (e) => {
                            const name = e.target.value;
                            setSelectedLead({ ...selectedLead, name });
                            setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, name } : l));
                            await supabase.from('leads').update({ name }).eq('id', selectedLead.id);
                          }}
                        />
                        <input 
                          className="w-full bg-transparent text-sm text-t2 outline-none border-b border-transparent focus:border-brand-orange/30"
                          value={selectedLead.company || ''}
                          placeholder="Empresa"
                          onChange={async (e) => {
                            const company = e.target.value;
                            setSelectedLead({ ...selectedLead, company });
                            setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, company } : l));
                            await supabase.from('leads').update({ company }).eq('id', selectedLead.id);
                          }}
                        />
                        <div className="mt-2">
                          <Badge style={{ background: `${STAGES[selectedLead.stage].color}22`, color: STAGES[selectedLead.stage].color }}>{STAGES[selectedLead.stage].label}</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-surface2 border border-white/5 rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-t3 mb-1">Valor/mês</div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-t3">R$</span>
                          <input 
                            type="number"
                            className="w-full bg-transparent font-head text-base font-extrabold text-semantic-green outline-none"
                            value={selectedLead.value}
                            onChange={async (e) => {
                              const value = parseInt(e.target.value) || 0;
                              setSelectedLead({ ...selectedLead, value });
                              setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, value } : l));
                              await supabase.from('leads').update({ value }).eq('id', selectedLead.id);
                            }}
                          />
                        </div>
                      </div>
                      <div className="bg-surface2 border border-white/5 rounded-xl p-3">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-t3 mb-1">Score</div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number"
                            min="0"
                            max="100"
                            className="w-12 bg-transparent font-head text-base font-extrabold outline-none"
                            style={{ color: scColor(selectedLead.score) }}
                            value={selectedLead.score}
                            onChange={async (e) => {
                              const score = parseInt(e.target.value) || 0;
                              setSelectedLead({ ...selectedLead, score });
                              setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, score } : l));
                              await supabase.from('leads').update({ score }).eq('id', selectedLead.id);
                            }}
                          />
                          <span className="text-xs font-bold text-t3">/ 100</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-t2 bg-surface2 p-2 rounded-lg border border-white/5">
                        <Phone size={14} className="text-t3 shrink-0" /> 
                        <input 
                          className="w-full bg-transparent outline-none"
                          value={selectedLead.phone || ''}
                          placeholder="Telefone"
                          onChange={async (e) => {
                            const phone = e.target.value;
                            setSelectedLead({ ...selectedLead, phone });
                            setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, phone } : l));
                            await supabase.from('leads').update({ phone }).eq('id', selectedLead.id);
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-t2 bg-surface2 p-2 rounded-lg border border-white/5">
                        <Mail size={14} className="text-t3 shrink-0" /> 
                        <input 
                          className="w-full bg-transparent outline-none"
                          value={selectedLead.email || ''}
                          placeholder="Email"
                          onChange={async (e) => {
                            const email = e.target.value;
                            setSelectedLead({ ...selectedLead, email });
                            setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, email } : l));
                            await supabase.from('leads').update({ email }).eq('id', selectedLead.id);
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-t3 flex items-center gap-2">
                        Próximo Passo <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <textarea 
                        className="w-full bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-3 text-xs text-brand-orange-lt leading-relaxed outline-none focus:border-brand-orange/40 h-20 resize-none"
                        value={selectedLead.next_step || ''}
                        placeholder="O que fazer agora?"
                        onChange={async (e) => {
                          const next_step = e.target.value;
                          setSelectedLead({ ...selectedLead, next_step });
                          setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, next_step } : l));
                          await supabase.from('leads').update({ next_step }).eq('id', selectedLead.id);
                        }}
                      />
                    </div>

                    <div className="space-y-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-t3 flex items-center gap-2">
                        Estágio <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(STAGES).map(([k, s]) => (
                          <button 
                            key={k} 
                            onClick={async () => {
                              setSelectedLead({ ...selectedLead, stage: k as Stage });
                              setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, stage: k as Stage } : l));
                              await supabase.from('leads').update({ stage: k }).eq('id', selectedLead.id);
                              showToast(`Estágio alterado para ${s.label}`);
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all",
                              selectedLead.stage === k ? "border-brand-orange bg-brand-orange/10 text-brand-orange-lt" : "border-white/10 text-t3 hover:border-white/20"
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-t3 flex items-center gap-2">
                        Observações <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {selectedLead.lead_obs?.map(o => (
                          <div key={o.id} className="bg-surface2 border border-white/5 rounded-xl p-3 relative group">
                            <div className="text-xs text-t2 leading-relaxed pr-4">{o.text}</div>
                            <div className="text-[10px] text-t3 mt-1.5">{new Date(o.created_at).toLocaleDateString('pt-BR')}</div>
                          </div>
                        ))}
                      </div>
                      <textarea className="w-full bg-surface2 border border-white/10 rounded-xl p-3 text-xs text-t1 outline-none focus:border-brand-orange h-20 resize-none" placeholder="Adicionar nota..." />
                      <button className="w-full py-2.5 bg-brand-orange text-white rounded-xl text-xs font-bold hover:bg-brand-orange-lt transition-colors">Salvar Nota</button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full p-2.5 rounded-xl text-[13px] font-medium transition-all relative group",
        active ? "bg-brand-orange/10 text-brand-orange-lt font-bold" : "text-t3 hover:bg-surface2 hover:text-t2"
      )}
    >
      <span className={cn("transition-opacity", active ? "opacity-100" : "opacity-60 group-hover:opacity-100")}>{icon}</span>
      <span className="max-lg:hidden">{label}</span>
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 bg-brand-orange rounded-r-full max-lg:hidden" />}
    </button>
  );
}

function scColor(s: number) {
  if (s >= 80) return 'var(--color-semantic-green)';
  if (s >= 50) return 'var(--color-semantic-amber)';
  return 'var(--color-semantic-red)';
}
