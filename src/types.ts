export type Stage = 'prospecto' | 'contato' | 'proposta' | 'negociacao' | 'fechado' | 'perdido';

export interface LeadObs {
  id: number;
  text: string;
  created_at: string;
}

export interface Lead {
  id: number;
  name: string;
  company: string | null;
  stage: Stage;
  value: number;
  score: number;
  origin: string;
  phone: string | null;
  email: string | null;
  next_step: string | null;
  last_contact: string | null;
  created_at: string;
  lead_obs?: LeadObs[];
}

export type Priority = 'urgente' | 'alta' | 'media' | 'baixa';
export type Quadrant = 'fazer' | 'agendar' | 'delegar' | 'eliminar';

export interface TaskHistory {
  id: number;
  text: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  priority: Priority;
  category: string;
  col: string;
  quadrant: Quadrant;
  due_date: string | null;
  created_at: string;
  task_history?: TaskHistory[];
}

export interface HabitDay {
  id: number;
  habit_id: number;
  day: number;
  month: number;
  year: number;
}

export interface Habit {
  id: number;
  name: string;
  category: string;
  created_at: string;
  habit_days?: HabitDay[];
}

export interface Transaction {
  id: number;
  description: string;
  category: string;
  value: number;
  type: 'in' | 'out';
  date: string;
  created_at: string;
}

export interface QuoteItem {
  id: number;
  quote_id: number;
  description: string;
  quantity: number;
  value: number;
}

export interface Quote {
  id: number;
  client: string;
  project: string;
  status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado';
  date: string;
  created_at: string;
  quote_items?: QuoteItem[];
}
