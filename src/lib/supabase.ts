import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://kfjfzsfjvesbuiqonsze.supabase.co';
const SB_KEY = 'sb_publishable_SLY2YPNRXjGj4X8emVHmsg_5D0nfqcU';

export const supabase = createClient(SB_URL, SB_KEY);
