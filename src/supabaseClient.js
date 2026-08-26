import { createClient } from '@supabase/supabase-js';

// Read environmental variables from Vite configuration (.env file)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Warning: Supabase credentials are missing from your environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Shared username-based login.
 * Appends "@yob.portal" to the username to create a valid email string for Supabase Auth,
 * since Supabase expects email format credentials.
 */
export async function loginWithUsername(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  
  // If the admin is logging in, they can input either admin@yob.portal or just "admin"
  let email = cleanUsername;
  if (!cleanUsername.includes('@')) {
    email = `${cleanUsername}@yob.portal`;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

/**
 * Shared Sign Out helper
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Decides whether the authenticated session is the Portal Admin or a Study Centre
 */
export async function getUserRole(user) {
  if (!user) return null;
  
  // Admin detection
  if (user.email === 'admin@yob.portal') {
    return { role: 'admin', data: { name: 'Portal Administrator' } };
  }

  // Study Centre Coordinator detection (pull details from database)
  const { data, error } = await supabase
    .from('study_centres')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching coordinator profile:', error);
    // Return dummy metadata if details are not yet present
    return { role: 'coordinator', data: null, error: error.message };
  }

  return { role: 'coordinator', data };
}
